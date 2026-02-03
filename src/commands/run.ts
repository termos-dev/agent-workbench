/**
 * Run command handler - creates interactive components or runs commands.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type * as pty from "node-pty";
import { extractFlags } from "../arg-parser.js";
import { builtinComponents, positionalArgMap } from "../component-registry.js";
import { type ComponentType, writeEvent } from "../events.js";
import {
  cwdToProject,
  ensureEventsFile,
  getProcessInfoPath,
  getSessionRuntimeDir,
  pathToSessionName,
  writeIdleMarker,
} from "../runtime.js";
import {
  type FormSchema,
  componentSchemas,
  generateFullHelp,
  normalizeFormSchema,
  parseFormSchema,
} from "../schema/index.js";
import { ensureBrowserOpen, ensureServerRunning } from "../server-manager.js";
import { getAgentSessionId } from "../session-utils.js";

/**
 * Process handle that supports both ChildProcess and PTY processes
 */
type ProcessHandle = ChildProcess | pty.IPty;
type PtyModule = typeof import("node-pty");

/**
 * Global process tracker - maps interaction ID to process handle
 */
const runningProcesses = new Map<string, ProcessHandle>();
const processInfoFiles = new Map<string, string>();
let ptyModule: PtyModule | null = null;

function normalizeComponentName(name?: string): string | undefined {
  if (!name) return undefined;
  const lowered = name.toLowerCase();
  if (lowered.endsWith(".tsx") || lowered.endsWith(".jsx")) {
    return lowered.replace(/\.(tsx|jsx)$/, "");
  }
  return lowered;
}

function writeCommandOutput(data: Buffer | string): void {
  process.stderr.write(data);
}

interface ProcessInfo {
  pid: number;
  command?: string;
  startedAt: string;
}

interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function parseDelimited(content: string, delimiter = ","): CsvParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isTreeNode(value: unknown): value is TreeNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "label" in value
  );
}

function toTreeNodes(value: unknown, parentId = ""): TreeNode[] {
  if (Array.isArray(value)) {
    if (value.every((item) => isTreeNode(item))) {
      return value as TreeNode[];
    }
    return value.map((item, idx) => {
      if (isTreeNode(item)) return item;
      const id = parentId ? `${parentId}/${idx}` : String(idx);
      if (typeof item === "string") {
        return { id, label: item };
      }
      const label =
        typeof item === "object" && item !== null && "label" in item
          ? String((item as { label?: string }).label)
          : `Item ${idx + 1}`;
      const children = toTreeNodes(item, id);
      return children.length > 0 ? { id, label, children } : { id, label };
    });
  }

  if (typeof value === "object" && value !== null) {
    if (isTreeNode(value)) {
      return [value];
    }
    return Object.entries(value as Record<string, unknown>).map(
      ([key, child]) => {
        const id = parentId ? `${parentId}/${key}` : key;
        const children = toTreeNodes(child, id);
        return children.length > 0
          ? { id, label: key, children }
          : { id, label: key };
      }
    );
  }

  return [];
}

function writeProcessInfo(
  sessionName: string,
  interactionId: string,
  pid: number,
  command?: string
): void {
  const info: ProcessInfo = {
    pid,
    command,
    startedAt: new Date().toISOString(),
  };
  const infoPath = getProcessInfoPath(sessionName, interactionId);
  try {
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
    processInfoFiles.set(interactionId, infoPath);
  } catch {
    // Best effort only
  }
}

function cleanupProcessInfo(interactionId: string): void {
  const infoPath = processInfoFiles.get(interactionId);
  if (!infoPath) return;
  try {
    fs.unlinkSync(infoPath);
  } catch {
    // Ignore cleanup failures
  }
  processInfoFiles.delete(interactionId);
}

async function loadPtyModule(): Promise<PtyModule | null> {
  if (ptyModule) return ptyModule;
  try {
    ptyModule = await import("node-pty");
    return ptyModule;
  } catch {
    return null;
  }
}

/**
 * Register a running process for tracking
 */
export function registerProcess(
  interactionId: string,
  proc: ProcessHandle,
  meta?: { sessionName?: string; command?: string }
): void {
  // Ensure cleanup handler is registered
  registerCleanupHandler();

  runningProcesses.set(interactionId, proc);

  const pid = typeof proc.pid === "number" ? proc.pid : undefined;
  if (meta?.sessionName && pid) {
    writeProcessInfo(meta.sessionName, interactionId, pid, meta.command);
  }

  // Handle cleanup on exit - PTY uses onExit, ChildProcess uses 'exit' event
  if ("onExit" in proc) {
    proc.onExit(() => {
      runningProcesses.delete(interactionId);
      cleanupProcessInfo(interactionId);
    });
  } else {
    proc.on("exit", () => {
      runningProcesses.delete(interactionId);
      cleanupProcessInfo(interactionId);
    });
  }
}

/**
 * Kill a running process by interaction ID
 */
export function killProcess(interactionId: string): boolean {
  const proc = runningProcesses.get(interactionId);
  if (!proc) return false;

  try {
    proc.kill("SIGTERM");
    runningProcesses.delete(interactionId);
    cleanupProcessInfo(interactionId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill all running processes (cleanup on exit)
 */
export function killAllProcesses(): void {
  for (const [_id, proc] of runningProcesses) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Ignore errors during cleanup
    }
  }
  runningProcesses.clear();
  for (const [interactionId] of processInfoFiles) {
    cleanupProcessInfo(interactionId);
  }
}

// Cleanup handler - kill all child processes when parent exits
let cleanupRegistered = false;

function registerCleanupHandler(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    killAllProcesses();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

/**
 * Run a command with PTY support for real-time output streaming.
 * Uses a fallback chain: node-pty -> script wrapper -> regular spawn.
 */
async function runCommandWithPty(
  command: string,
  outputFile: string,
  interactionId: string,
  sessionName: string
): Promise<number | null> {
  const outputStream = fs.createWriteStream(outputFile, { flags: "a" });

  // Try node-pty first (cleanest PTY implementation)
  const pty = await loadPtyModule();
  if (pty) {
    try {
      return await runWithNodePty(
        pty,
        command,
        outputStream,
        interactionId,
        sessionName
      );
    } catch {
      // node-pty failed, try script wrapper
    }
  }

  // node-pty unavailable or failed, try script wrapper
  try {
    return await runWithScriptWrapper(
      command,
      outputStream,
      interactionId,
      sessionName
    );
  } catch {
    // All PTY methods failed, fall back to regular spawn (no isTTY)
    return await runWithRegularSpawn(
      command,
      outputStream,
      interactionId,
      sessionName
    );
  }
}

/**
 * Run command using node-pty for true PTY support.
 */
function runWithNodePty(
  pty: PtyModule,
  command: string,
  outputStream: fs.WriteStream,
  interactionId: string,
  sessionName: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const ptyProcess = pty.spawn("sh", ["-c", command], {
        name: "xterm-256color",
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      });

      registerProcess(interactionId, ptyProcess, { sessionName, command });

      ptyProcess.onData((data: string) => {
        outputStream.write(data);
        writeCommandOutput(data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        outputStream.write(`\n[Process exited with code ${exitCode}]\n`, () => {
          outputStream.end(() => resolve(exitCode));
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Run command using 'script' wrapper for PTY emulation.
 * Syntax differs between macOS and Linux.
 */
function runWithScriptWrapper(
  command: string,
  outputStream: fs.WriteStream,
  interactionId: string,
  sessionName: string
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const isMac = os.platform() === "darwin";

    // macOS: script -q -e /dev/null sh -c "command"
    // Linux: script -q -e -c "command" /dev/null
    const args = isMac
      ? ["-q", "-e", "/dev/null", "sh", "-c", command]
      : ["-q", "-e", "-c", command, "/dev/null"];

    const child = spawn("script", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    registerProcess(interactionId, child, { sessionName, command });

    // Filter out ^D control character that script injects at the start
    // The terminal renders Ctrl-D as literal "^D" (0x5e 0x44), not as 0x04
    let firstChunk = true;
    const filterControlChars = (data: Buffer): Buffer => {
      if (firstChunk) {
        firstChunk = false;
        // Check for literal "^D" at start (0x5e = ^, 0x44 = D)
        if (data[0] === 0x5e && data[1] === 0x44) {
          return data.slice(2);
        }
        // Also check for actual control character 0x04
        if (data[0] === 0x04) {
          return data.slice(1);
        }
      }
      return data;
    };

    child.stdout?.on("data", (data: Buffer) => {
      const filtered = filterControlChars(data);
      if (filtered.length > 0) {
        outputStream.write(filtered);
        writeCommandOutput(filtered);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      outputStream.write(data);
      writeCommandOutput(data);
    });

    child.on("close", (code) => {
      outputStream.write(`\n[Process exited with code ${code}]\n`, () => {
        outputStream.end(() => resolve(code));
      });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Fallback: run command with regular spawn (no PTY, may buffer).
 */
function runWithRegularSpawn(
  command: string,
  outputStream: fs.WriteStream,
  interactionId: string,
  sessionName: string
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    registerProcess(interactionId, child, { sessionName, command });

    child.stdout?.on("data", (data: Buffer) => {
      outputStream.write(data);
      writeCommandOutput(data);
    });

    child.stderr?.on("data", (data: Buffer) => {
      outputStream.write(data);
      writeCommandOutput(data);
    });

    child.on("close", (code) => {
      outputStream.write(`\n[Process exited with code ${code}]\n`, () => {
        outputStream.end(() => resolve(code));
      });
    });

    child.on("error", (err) => {
      outputStream.write(`\n[Process error: ${err.message}]\n`, () => {
        outputStream.end(() => resolve(1));
      });
    });
  });
}

/**
 * Get the output file path for a command.
 */
function getOutputPath(sessionName: string, id: string): string {
  const sessionsDir = getSessionRuntimeDir(sessionName);
  return path.join(sessionsDir, `output-${id}.txt`);
}

/**
 * Output the started JSON response.
 */
function outputStartedJson(id: string, sessionName: string): void {
  console.log(JSON.stringify({ id, status: "started", session: sessionName }));
}

/**
 * Show the run command help.
 */
export function showRunHelp(): void {
  console.log(generateFullHelp());
}

/**
 * Emit an error and exit with code 1.
 * Always exits - never returns.
 */
function emitRunError(message: string): never {
  console.log(JSON.stringify({ action: "cancel", error: message }));
  process.exit(1);
}

function applyFileArgs(
  component: string | undefined,
  inkArgs: Record<string, string | undefined> | undefined
): void {
  if (!component || !inkArgs?.file) return;

  const filePath = inkArgs.file;
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    emitRunError(
      `Error reading file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const ext = path.extname(filePath).toLowerCase();
  const columns = parseCommaList(inkArgs.columns);

  if (component === "code") {
    if (!inkArgs.content) {
      inkArgs.content = content;
    }
    if (!inkArgs.lang && !inkArgs.language) {
      const lang = ext.replace(".", "");
      if (lang) inkArgs.lang = lang;
    }
    inkArgs.file = undefined;
    return;
  }

  if (
    component === "markdown" ||
    component === "card" ||
    component === "plan-viewer"
  ) {
    if (!inkArgs.content) {
      inkArgs.content = content;
    }
    if (component !== "plan-viewer") {
      inkArgs.file = undefined;
    }
    return;
  }

  if (component === "mermaid") {
    if (!inkArgs.code && !inkArgs.diagram) {
      inkArgs.code = content;
    }
    inkArgs.file = undefined;
    return;
  }

  if (component === "json") {
    if (!inkArgs.data) {
      try {
        JSON.parse(content);
      } catch (err) {
        emitRunError(
          `Invalid JSON in file: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      inkArgs.data = content;
    }
    inkArgs.file = undefined;
    return;
  }

  if (component === "table") {
    try {
      if (ext === ".csv" || ext === ".tsv") {
        const delimiter = ext === ".tsv" ? "\t" : ",";
        const { headers, rows } = parseDelimited(content, delimiter);
        const filteredRows =
          columns.length > 0
            ? rows.map((row) => {
                const filtered: Record<string, string> = {};
                columns.forEach((col) => {
                  filtered[col] = row[col] ?? "";
                });
                return filtered;
              })
            : rows;

        inkArgs.data = JSON.stringify(filteredRows);
        if (columns.length > 0) {
          inkArgs.headers = columns.join(",");
        } else if (headers.length > 0) {
          inkArgs.headers = headers.join(",");
        }
      } else {
        const parsed = JSON.parse(content) as unknown;
        let rows: Record<string, unknown>[] = [];
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            rows = [];
          } else if (typeof parsed[0] === "object" && parsed[0] !== null) {
            rows = parsed as Record<string, unknown>[];
          } else {
            rows = parsed.map((value, idx) => ({ index: idx, value }));
          }
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (Array.isArray(obj.rows)) {
            rows = obj.rows as Record<string, unknown>[];
          } else {
            rows = Object.entries(obj).map(([key, value]) => ({
              key,
              value,
            }));
          }
        }

        if (columns.length > 0) {
          rows = rows.map((row) => {
            const filtered: Record<string, unknown> = {};
            columns.forEach((col) => {
              filtered[col] = row[col];
            });
            return filtered;
          });
          inkArgs.headers = columns.join(",");
        }

        inkArgs.data = JSON.stringify(rows);
      }
    } catch (err) {
      emitRunError(
        `Invalid table data in file: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    inkArgs.file = undefined;
    return;
  }

  if (component === "chart") {
    try {
      if (ext === ".csv" || ext === ".tsv") {
        const delimiter = ext === ".tsv" ? "\t" : ",";
        const { headers, rows } = parseDelimited(content, delimiter);
        let data: Array<number | { label: string; value: number }> = [];
        const labelKey =
          headers.find((h) => h.toLowerCase() === "label") ?? headers[0];
        const valueKey =
          headers.find((h) => h.toLowerCase() === "value") ?? headers[1];

        if (labelKey && valueKey) {
          data = rows.map((row) => ({
            label: row[labelKey] ?? "",
            value: Number(row[valueKey] ?? 0),
          }));
        } else if (headers.length === 1) {
          data = rows.map((row) => Number(row[headers[0]] ?? 0));
        }

        inkArgs.data = JSON.stringify(data);
      } else {
        const parsed = JSON.parse(content) as unknown;
        if (Array.isArray(parsed)) {
          inkArgs.data = JSON.stringify(parsed);
        } else if (parsed && typeof parsed === "object" && "data" in parsed) {
          inkArgs.data = JSON.stringify((parsed as { data: unknown }).data);
        } else {
          inkArgs.data = JSON.stringify([]);
        }
      }
    } catch (err) {
      emitRunError(
        `Invalid chart data in file: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    inkArgs.file = undefined;
    return;
  }

  if (component === "tree") {
    try {
      const parsed = JSON.parse(content) as unknown;
      const nodes = toTreeNodes(parsed);
      inkArgs.data = JSON.stringify(nodes);
    } catch (err) {
      emitRunError(
        `Invalid tree data in file: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    inkArgs.file = undefined;
    return;
  }

  if (component === "select" || component === "checklist") {
    if (!inkArgs.items) {
      inkArgs.items = content;
    }
    inkArgs.file = undefined;
  }
}

/**
 * Handle the run command.
 *
 * Usage:
 *   awb run --title "Title" <component> [--args...]
 *   awb run --title "Title" --cmd "<command>"
 *   awb run --title "Title" -- <command> [args...]
 */
export async function handleRun(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showRunHelp();
    process.exit(0);
  }

  // Auto-start UI server and open browser if needed
  const serverReady = await ensureServerRunning();
  if (serverReady) {
    await ensureBrowserOpen();
  }

  const _hasWait = args.includes("--wait");
  const restArgs = args.filter(
    (arg) => arg !== "--wait" && arg !== "--no-wait"
  );

  let cmdValue: string | undefined;
  let cmdFileValue: string | undefined;

  // Extract flags using reusable parser
  const knownCliFlags = [
    { name: "title" },
    { name: "cmd" },
    { name: "cmd-file" },
  ];
  const flags = extractFlags(restArgs, knownCliFlags);
  const title = flags.title;
  cmdValue = flags.cmd;
  cmdFileValue = flags["cmd-file"];

  const sepIdx = restArgs.indexOf("--");

  // Check for unknown CLI options (flags before component name or -- separator)
  const firstArgIdx = restArgs.findIndex(
    (arg) => !arg.startsWith("--") || arg === "--"
  );
  for (
    let i = 0;
    i < (firstArgIdx === -1 ? restArgs.length : firstArgIdx);
    i++
  ) {
    const arg = restArgs[i];
    if (arg.startsWith("--") && arg !== "--") {
      const flagName = arg.slice(2).split("=")[0];
      const validFlags = knownCliFlags.map((f) => `--${f.name}`).join(", ");
      emitRunError(
        `Unknown CLI option --${flagName}. Valid options: ${validFlags}`
      );
    }
  }

  // Validate --cmd, --cmd-file, and -- separator are mutually exclusive
  const cmdSources = [
    cmdValue !== undefined,
    cmdFileValue !== undefined,
    sepIdx !== -1,
  ].filter(Boolean).length;

  if (cmdSources > 1) {
    emitRunError("Use only one of --cmd, --cmd-file, or '--' separator.");
  }

  // Validate --cmd-file exists and is readable
  if (cmdFileValue) {
    try {
      if (!fs.existsSync(cmdFileValue)) {
        emitRunError(`Command file not found: ${cmdFileValue}`);
      }
      const stats = fs.statSync(cmdFileValue);
      if (!stats.isFile()) {
        emitRunError(`Not a file: ${cmdFileValue}`);
      }
    } catch (err) {
      emitRunError(
        `Error accessing command file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const titleValue = title?.trim();
  if (!titleValue) {
    const commandArgs = sepIdx !== -1 ? restArgs.slice(sepIdx + 1) : [];
    const hasTitleAfterSeparator = commandArgs.some(
      (arg) => arg === "--title" || arg.startsWith("--title=")
    );
    if (hasTitleAfterSeparator) {
      emitRunError(
        "--title is required and must appear before '--' (command separator)."
      );
    } else {
      emitRunError("--title is required.");
    }
  }

  const component = normalizeComponentName(restArgs[0]);
  const isCommandMode =
    cmdValue !== undefined || cmdFileValue !== undefined || sepIdx !== -1;

  const sessionName = pathToSessionName(process.cwd());

  // Ensure session directory exists
  ensureEventsFile(sessionName);

  let inkArgs: Record<string, string> | undefined;
  let command: string | undefined;

  // Special handling for `ask` - uses SchemaForm directly instead of a component file
  if (component === "ask") {
    // Parse --questions argument
    let questionsArg: string | undefined;
    for (let i = 1; i < restArgs.length; i++) {
      const arg = restArgs[i];
      if (!arg.startsWith("--")) continue;
      const key = arg.slice(2);
      const eqIdx = key.indexOf("=");
      const flag = eqIdx > 0 ? key.slice(0, eqIdx) : key;
      const value = eqIdx > 0 ? key.slice(eqIdx + 1) : restArgs[i + 1];

      if (flag === "questions") {
        questionsArg = eqIdx > 0 ? value : restArgs[++i];
      }
    }

    if (!questionsArg) {
      emitRunError(
        "--questions is required for ask component. Pass a JSON array of questions."
      );
    }

    let schema: FormSchema;
    try {
      const parsed = JSON.parse(questionsArg);
      const normalized = normalizeFormSchema(parsed);
      // Validate the normalized schema
      schema = parseFormSchema(normalized);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitRunError(`Invalid --questions: ${errMsg}`);
    }

    ensureEventsFile(sessionName);
    const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentSessionId = getAgentSessionId();

    writeEvent(sessionName, {
      type: "created" as const,
      id,
      component: "ask" as ComponentType,
      title: titleValue,
      args: { schema },
      agentSessionId,
      project: cwdToProject(process.cwd()),
    });

    // Update idle marker so playground can detect this session
    if (agentSessionId) {
      writeIdleMarker(agentSessionId, process.cwd());
    }

    outputStartedJson(id, sessionName);
    process.exit(0);
  }

  // Special handling for `html` - renders Claude-generated HTML with web components
  if (component === "html") {
    let htmlContent: string | undefined;
    let htmlFile: string | undefined;

    for (let i = 1; i < restArgs.length; i++) {
      const arg = restArgs[i];
      if (!arg.startsWith("--")) continue;
      const key = arg.slice(2);
      const eqIdx = key.indexOf("=");
      const flag = eqIdx > 0 ? key.slice(0, eqIdx) : key;
      const value = eqIdx > 0 ? key.slice(eqIdx + 1) : restArgs[i + 1];

      if (flag === "content") {
        htmlContent = eqIdx > 0 ? value : restArgs[++i];
      } else if (flag === "file") {
        htmlFile = eqIdx > 0 ? value : restArgs[++i];
      }
    }

    // Validate: either --content or --file required
    if (!htmlContent && !htmlFile) {
      emitRunError(
        "Either --content or --file is required for html component."
      );
    }

    // Read from file if specified
    if (htmlFile) {
      const absolutePath = path.isAbsolute(htmlFile)
        ? htmlFile
        : path.resolve(process.cwd(), htmlFile);

      if (!fs.existsSync(absolutePath)) {
        emitRunError(`File not found: ${absolutePath}`);
      }

      try {
        htmlContent = fs.readFileSync(absolutePath, "utf8");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emitRunError(`Error reading file: ${errMsg}`);
      }
    }

    ensureEventsFile(sessionName);
    const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentSessionId = getAgentSessionId();

    writeEvent(sessionName, {
      type: "created" as const,
      id,
      component: "html" as ComponentType,
      title: titleValue,
      args: {
        content: htmlContent,
        file: htmlFile,
      },
      agentSessionId,
      project: cwdToProject(process.cwd()),
    });

    // Update idle marker so playground can detect this session
    if (agentSessionId) {
      writeIdleMarker(agentSessionId, process.cwd());
    }

    outputStartedJson(id, sessionName);
    process.exit(0);
  }

  // Special handling for `diff` - runs git diff and shows in GitDiffPanel
  if (component === "diff") {
    let diffFile: string | undefined;
    let staged = false;
    let beforeFile: string | undefined;
    let afterFile: string | undefined;

    for (let i = 1; i < restArgs.length; i++) {
      const arg = restArgs[i];
      if (!arg.startsWith("--")) continue;
      const key = arg.slice(2);
      const eqIdx = key.indexOf("=");
      const flag = eqIdx > 0 ? key.slice(0, eqIdx) : key;
      const value = eqIdx > 0 ? key.slice(eqIdx + 1) : restArgs[i + 1];

      if (flag === "file") {
        diffFile = eqIdx > 0 ? value : restArgs[++i];
      } else if (flag === "staged") {
        staged = true;
      } else if (flag === "before") {
        beforeFile = eqIdx > 0 ? value : restArgs[++i];
      } else if (flag === "after") {
        afterFile = eqIdx > 0 ? value : restArgs[++i];
      }
    }

    interface DiffFile {
      fileName: string;
      fullDiff: string;
      additions: number;
      deletions: number;
    }

    const files: DiffFile[] = [];

    try {
      if (beforeFile && afterFile) {
        // File comparison mode (git diff --no-index works cross-platform)
        let diff = "";
        try {
          diff = execSync(
            `git diff --no-index -- "${beforeFile}" "${afterFile}"`,
            {
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024,
            }
          );
        } catch (err) {
          // git diff --no-index exits with code 1 when differences exist
          if (err && typeof err === "object" && "stdout" in err) {
            diff = String((err as { stdout?: string }).stdout ?? "");
          } else {
            throw err;
          }
        }

        if (diff.trim()) {
          const additions = (diff.match(/^\+[^+]/gm) || []).length;
          const deletions = (diff.match(/^-[^-]/gm) || []).length;
          files.push({
            fileName: `${beforeFile} → ${afterFile}`,
            fullDiff: diff,
            additions,
            deletions,
          });
        }
      } else {
        // Git diff mode
        const gitArgs = ["diff"];
        if (staged) gitArgs.push("--staged");
        if (diffFile) gitArgs.push(diffFile);

        const diff = execSync(`git ${gitArgs.join(" ")}`, {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });

        if (diff.trim()) {
          // Parse git diff output to extract individual files
          const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);

          for (const fileDiff of fileDiffs) {
            const lines = fileDiff.split("\n");
            const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
            const fileName = headerMatch ? headerMatch[2] : "unknown";

            const additions = (fileDiff.match(/^\+[^+]/gm) || []).length;
            const deletions = (fileDiff.match(/^-[^-]/gm) || []).length;

            files.push({
              fileName,
              fullDiff: `diff --git ${fileDiff}`,
              additions,
              deletions,
            });
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitRunError(`Error running diff: ${errMsg}`);
    }

    ensureEventsFile(sessionName);
    const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentSessionId = getAgentSessionId();

    writeEvent(sessionName, {
      type: "created" as const,
      id,
      component: "diff" as ComponentType,
      title: titleValue,
      args: {
        files,
      },
      agentSessionId,
      project: cwdToProject(process.cwd()),
    });

    // Update idle marker so playground can detect this session
    if (agentSessionId) {
      writeIdleMarker(agentSessionId, process.cwd());
    }

    outputStartedJson(id, sessionName);
    process.exit(0);
  }

  if (cmdValue) {
    command = cmdValue;
  } else if (cmdFileValue) {
    command = fs.readFileSync(cmdFileValue, "utf8").trim();
  } else if (sepIdx !== -1) {
    command = restArgs.slice(sepIdx + 1).join(" ");
    if (!command) {
      emitRunError(
        "Command is required after '--' separator. Usage: awb run -- <command>"
      );
    }
  } else {
    // Validate component name
    const componentName = normalizeComponentName(restArgs[0]) ?? "";
    const isBuiltin = componentName in builtinComponents;

    if (!isBuiltin) {
      const builtins =
        "ask, html, confirm, checklist, select, code, diff, table, json, markdown, card, progress, chart, gauge, tree, mermaid, plan-viewer";
      emitRunError(
        `Unknown component '${componentName}'. Built-in components: ${builtins}`
      );
    }

    inkArgs = {};
    const positionalKey = positionalArgMap[component ?? ""];

    for (let i = 1; i < restArgs.length; i++) {
      const arg = restArgs[i];
      if (arg === "--arg" && restArgs[i + 1]) {
        const [k, ...v] = restArgs[++i].split("=");
        if (k) inkArgs[k] = v.join("=");
      } else if (arg.startsWith("--")) {
        const key = arg.slice(2);
        const eqIdx = key.indexOf("=");
        if (eqIdx > 0) inkArgs[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
        else if (restArgs[i + 1]?.charAt(0) !== "-")
          inkArgs[key] = restArgs[++i];
      } else if (positionalKey && !inkArgs[positionalKey]) {
        inkArgs[positionalKey] = arg;
      }
    }
    if (titleValue && !("title" in inkArgs)) {
      inkArgs.title = titleValue;
    }
    if (!Object.keys(inkArgs).length) inkArgs = undefined;

    // Normalize common aliases
    if (inkArgs?.json && !inkArgs.data) {
      inkArgs.data = inkArgs.json;
      // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
      delete inkArgs.json;
    }
    if (component === "table" && inkArgs) {
      if (inkArgs.rows && !inkArgs.data) {
        inkArgs.data = inkArgs.rows;
        // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
        delete inkArgs.rows;
      }
      if (inkArgs.content && !inkArgs.data) {
        inkArgs.data = inkArgs.content;
        // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
        delete inkArgs.content;
      }
    }
  }

  // Validate component args against schema
  if (!isCommandMode && component) {
    const schema = componentSchemas[component];
    if (schema?.args) {
      for (const [argName, argDef] of Object.entries(schema.args)) {
        if (
          (argDef as { required?: boolean }).required &&
          !inkArgs?.[argName]
        ) {
          emitRunError(`Missing required argument: --${argName}`);
        }
      }

      if (schema.validation?.oneOf) {
        const hasOne = schema.validation.oneOf.some((arg) => inkArgs?.[arg]);
        if (!hasOne) {
          const opts = schema.validation.oneOf
            .map((a) => `--${a}`)
            .join(" or ");
          emitRunError(`Either ${opts} is required for '${component}'`);
        }
      }

      if (inkArgs) {
        const knownArgs = new Set(Object.keys(schema.args));
        for (const argName of Object.keys(inkArgs)) {
          if (!knownArgs.has(argName) && argName !== "title") {
            const validArgs = Array.from(knownArgs)
              .map((a) => `--${a}`)
              .join(", ");
            emitRunError(
              `Unknown argument --${argName} for component '${component}'. Valid args: ${validArgs}`
            );
          }
        }
      }

      if (inkArgs) {
        for (const [argName, argDef] of Object.entries(schema.args)) {
          if (argDef.type === "json" && inkArgs[argName]) {
            try {
              JSON.parse(inkArgs[argName]);
            } catch (e) {
              const value = inkArgs[argName];
              const preview =
                value.length > 50 ? `${value.slice(0, 50)}...` : value;
              const errMsg = e instanceof Error ? e.message : String(e);
              emitRunError(
                `Invalid JSON in --${argName}: ${errMsg}\nValue: ${preview}`
              );
            }
          }
        }
      }
    }
  }

  // Validate file arguments exist before creating interaction
  // Also normalize to absolute path so playground can read from any cwd
  if (inkArgs?.file) {
    const filePath = inkArgs.file;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      emitRunError(`File not found: ${absolutePath}`);
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      emitRunError(`Not a file: ${absolutePath}`);
    }
    // Store absolute path so playground can read from any directory
    inkArgs.file = absolutePath;
  }

  applyFileArgs(component, inkArgs);

  ensureEventsFile(sessionName);

  // Generate unique ID
  const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Handle command mode - run command, stream to file, and block until done
  if (command) {
    const agentSessionId = getAgentSessionId();
    const outputFile = getOutputPath(sessionName, id);

    // Create empty output file
    fs.writeFileSync(outputFile, "");

    // Write created event with outputFile reference (browser can tail this)
    writeEvent(sessionName, {
      type: "created" as const,
      id,
      component: "output" as ComponentType,
      title: titleValue,
      args: {
        command,
        outputFile,
      },
      agentSessionId,
      project: cwdToProject(process.cwd()),
    });

    // Update idle marker so playground can detect this session
    if (agentSessionId) {
      writeIdleMarker(agentSessionId, process.cwd());
    }

    // Output started JSON immediately so caller knows the interaction ID
    outputStartedJson(id, sessionName);

    // Run command with PTY for real-time streaming (isTTY=true)
    // This ensures libraries like Winston don't buffer output.
    // Falls back to `script` wrapper if node-pty fails, then to regular spawn.
    const exitCode = await runCommandWithPty(
      command,
      outputFile,
      id,
      sessionName
    );

    // Command completed - exit with the child's exit code
    process.exit(exitCode ?? 0);
  }

  // Parse options for select components
  let options: Array<{ label: string; value: string }> | undefined;
  if (inkArgs?.items) {
    const itemsStr = inkArgs.items as string;
    try {
      const parsed = JSON.parse(itemsStr);
      if (Array.isArray(parsed)) {
        options = parsed.map((item: unknown) => {
          if (typeof item === "string") {
            return { label: item, value: item };
          }
          const obj = item as { label?: string; value?: string };
          return {
            label: obj.label || String(obj.value),
            value: String(obj.value),
          };
        });
      }
    } catch {
      options = itemsStr.split(",").map((item) => {
        const trimmed = item.trim();
        return { label: trimmed, value: trimmed };
      });
    }
  }

  // Write created event - playground will render the component
  const agentSessionId = getAgentSessionId();
  writeEvent(sessionName, {
    type: "created" as const,
    id,
    component: component as ComponentType,
    title: titleValue,
    prompt: inkArgs?.prompt as string,
    options,
    args: inkArgs,
    agentSessionId,
    project: cwdToProject(process.cwd()),
  });

  // Update idle marker so playground can detect this session
  if (agentSessionId) {
    writeIdleMarker(agentSessionId, process.cwd());
  }

  outputStartedJson(id, sessionName);
}
