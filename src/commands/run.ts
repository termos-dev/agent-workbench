/**
 * Run command handler - creates interactive components.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { extractFlags } from "../arg-parser.js";
import { builtinComponents, positionalArgMap } from "../component-registry.js";
import { type ComponentType, writeEvent } from "../events.js";
import {
  cwdToProject,
  ensureEventsFile,
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

function normalizeComponentName(name?: string): string | undefined {
  if (!name) return undefined;
  const lowered = name.toLowerCase();
  if (lowered.endsWith(".tsx") || lowered.endsWith(".jsx")) {
    return lowered.replace(/\.(tsx|jsx)$/, "");
  }
  return lowered;
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

/**
 * Scan a directory and convert it to TreeNode format
 */
function scanDirectoryToTree(
  dirPath: string,
  options: { depth?: number; showHidden?: boolean } = {}
): TreeNode[] {
  const { depth = 5, showHidden = false } = options;

  function scan(currentPath: string, currentDepth: number): TreeNode[] {
    if (currentDepth > depth) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return [];
    }

    // Sort: directories first, then files, both alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    return entries
      .filter((entry) => showHidden || !entry.name.startsWith("."))
      .map((entry) => {
        const fullPath = path.join(currentPath, entry.name);
        const node: TreeNode = {
          id: fullPath,
          label: entry.name,
        };

        if (entry.isDirectory()) {
          const children = scan(fullPath, currentDepth + 1);
          if (children.length > 0) {
            node.children = children;
          }
        }

        return node;
      });
  }

  return scan(dirPath, 1);
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
    // Keep file path for file info bar and "Open in Editor" functionality
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

  // Extract flags using reusable parser
  const knownCliFlags = [{ name: "title" }];
  const flags = extractFlags(restArgs, knownCliFlags);
  const title = flags.title;

  // Check for unknown CLI options (flags before component name)
  const firstArgIdx = restArgs.findIndex((arg) => !arg.startsWith("--"));
  for (
    let i = 0;
    i < (firstArgIdx === -1 ? restArgs.length : firstArgIdx);
    i++
  ) {
    const arg = restArgs[i];
    if (arg.startsWith("--")) {
      const flagName = arg.slice(2).split("=")[0];
      const validFlags = knownCliFlags.map((f) => `--${f.name}`).join(", ");
      emitRunError(
        `Unknown CLI option --${flagName}. Valid options: ${validFlags}`
      );
    }
  }

  const titleValue = title?.trim();
  if (!titleValue) {
    emitRunError("--title is required.");
  }

  const component = normalizeComponentName(restArgs[0]);

  const sessionName = pathToSessionName(process.cwd());

  // Ensure session directory exists
  ensureEventsFile(sessionName);

  let inkArgs: Record<string, string> | undefined;

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

  // Validate component name
  const componentName = normalizeComponentName(restArgs[0]) ?? "";
  const isBuiltin = componentName in builtinComponents;

  if (!isBuiltin) {
    const builtins =
      "ask, html, confirm, checklist, code, table, markdown, plan-viewer";
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
      else if (restArgs[i + 1]?.charAt(0) !== "-") inkArgs[key] = restArgs[++i];
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

  // Validate component args against schema
  if (component) {
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

  // Handle tree --path option: scan directory and convert to tree data
  if (component === "tree" && inkArgs?.path) {
    const dirPath = inkArgs.path;
    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.resolve(process.cwd(), dirPath);

    if (!fs.existsSync(absolutePath)) {
      emitRunError(`Directory not found: ${absolutePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      emitRunError(`Not a directory: ${absolutePath}`);
    }

    const depth = inkArgs.depth ? Number.parseInt(inkArgs.depth, 10) : 5;
    const showHidden = inkArgs.showHidden === "true";

    const treeNodes = scanDirectoryToTree(absolutePath, { depth, showHidden });
    inkArgs.data = JSON.stringify(treeNodes);
    // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
    delete inkArgs.path;
    // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
    delete inkArgs.depth;
    // biome-ignore lint/performance/noDelete: cleaner than undefined assignment
    delete inkArgs.showHidden;
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
