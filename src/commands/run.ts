/**
 * Run command handler - creates interactive components or runs commands.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type FormSchema,
  componentSchemas,
  generateFullHelp,
  normalizeFormSchema,
} from "@termosdev/shared";
import { extractFlags } from "../arg-parser.js";
import { builtinComponents, positionalArgMap } from "../component-registry.js";
import { type ComponentType, writeEvent } from "../events.js";
import {
  cwdToProject,
  ensureEventsFile,
  pathToSessionName,
  writeIdleMarker,
} from "../runtime.js";
import { getAgentSessionId } from "../session-utils.js";

/**
 * Get the output file path for a live command.
 */
function getLiveOutputPath(sessionName: string, id: string): string {
  const sessionsDir = path.join(
    process.env.HOME || "",
    ".termos",
    "sessions",
    sessionName
  );
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
 * Emit an error and exit.
 */
function emitRunError(message: string): void {
  console.log(JSON.stringify({ action: "cancel", error: message }));
}

/**
 * Handle the run command.
 *
 * Usage:
 *   termos run --title "Title" <component> [--args...]
 *   termos run --title "Title" --cmd "<command>"
 *   termos run --title "Title" -- <command> [args...]
 */
export async function handleRun(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showRunHelp();
    process.exit(0);
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
    { name: "live", type: "boolean" as const },
  ];
  const flags = extractFlags(restArgs, knownCliFlags);
  const title = flags.title;
  cmdValue = flags.cmd;
  cmdFileValue = flags["cmd-file"];
  const isLive = flags.live === "true";

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
      process.exit(1);
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
    process.exit(1);
  }

  // Validate --cmd-file exists and is readable
  if (cmdFileValue) {
    try {
      if (!fs.existsSync(cmdFileValue)) {
        emitRunError(`Command file not found: ${cmdFileValue}`);
        process.exit(1);
      }
      const stats = fs.statSync(cmdFileValue);
      if (!stats.isFile()) {
        emitRunError(`Not a file: ${cmdFileValue}`);
        process.exit(1);
      }
    } catch (err) {
      emitRunError(
        `Error accessing command file: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
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
    process.exit(1);
  }

  const component = restArgs[0]?.toLowerCase();
  const isCommandMode =
    cmdValue !== undefined || cmdFileValue !== undefined || sepIdx !== -1;

  const sessionName = pathToSessionName(process.cwd());

  // Ensure session directory exists
  ensureEventsFile(sessionName);

  let inkFile: string | undefined;
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
      process.exit(1);
    }

    let schema: FormSchema;
    try {
      const parsed = JSON.parse(questionsArg);
      schema = normalizeFormSchema(parsed);
    } catch {
      emitRunError("Invalid JSON in --questions");
      process.exit(1);
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

    // Update idle marker so TUI can detect this session
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
      console.error("Usage: termos run -- <command>");
      process.exit(1);
    }
  } else {
    inkFile = restArgs[0];

    const builtinFile = builtinComponents[inkFile?.toLowerCase() ?? ""];
    if (builtinFile) {
      const distPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "ink-runner",
        "components",
        builtinFile
      );
      const devPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "packages",
        "ink-runner",
        "components",
        builtinFile
      );
      inkFile = fs.existsSync(distPath) ? distPath : devPath;
    } else if (!inkFile?.endsWith(".tsx") && !inkFile?.endsWith(".jsx")) {
      console.error("Usage: termos run <component> or termos run -- <command>");
      console.error("\nBuilt-in components:");
      console.error(
        "  ask, confirm, checklist, select, code, diff, table, json, markdown, card"
      );
      console.error("  progress, chart, gauge, tree, mermaid, plan-viewer");
      process.exit(1);
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
          return emitRunError(`Missing required argument: --${argName}`);
        }
      }

      if (schema.validation?.oneOf) {
        const hasOne = schema.validation.oneOf.some((arg) => inkArgs?.[arg]);
        if (!hasOne) {
          const opts = schema.validation.oneOf
            .map((a) => `--${a}`)
            .join(" or ");
          return emitRunError(`Either ${opts} is required for '${component}'`);
        }
      }

      if (inkArgs) {
        const knownArgs = new Set(Object.keys(schema.args));
        for (const argName of Object.keys(inkArgs)) {
          if (!knownArgs.has(argName) && argName !== "title") {
            const validArgs = Array.from(knownArgs)
              .map((a) => `--${a}`)
              .join(", ");
            return emitRunError(
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
              return emitRunError(
                `Invalid JSON in --${argName}: ${errMsg}\nValue: ${preview}`
              );
            }
          }
        }
      }
    }
  }

  // Validate file arguments exist before creating interaction
  // Also normalize to absolute path so TUI can read from any cwd
  if (inkArgs?.file) {
    const filePath = inkArgs.file;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      return emitRunError(`File not found: ${absolutePath}`);
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return emitRunError(`Not a file: ${absolutePath}`);
    }
    // Store absolute path so TUI can read from any directory
    inkArgs.file = absolutePath;
  }

  ensureEventsFile(sessionName);

  // Generate unique ID
  const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Handle command mode - run command and capture output
  if (command) {
    const agentSessionId = getAgentSessionId();

    if (isLive) {
      // Live mode: use spawn and stream to file
      const outputFile = getLiveOutputPath(sessionName, id);

      // Create empty output file
      fs.writeFileSync(outputFile, "");

      // Write created event with outputFile reference
      writeEvent(sessionName, {
        type: "created" as const,
        id,
        component: "output" as ComponentType,
        title: titleValue,
        args: {
          command,
          outputFile,
          live: true,
        },
        agentSessionId,
        project: cwdToProject(process.cwd()),
      });

      // Update idle marker so TUI can detect this session
      if (agentSessionId) {
        writeIdleMarker(agentSessionId, process.cwd());
      }

      // Output started JSON immediately
      outputStartedJson(id, sessionName);

      // Use nohup to fully background the process with shell redirection
      // This ensures the process continues even after the parent exits
      const wrappedCommand = `nohup sh -c '{ ${command.replace(/'/g, "'\\''")}; } >> "${outputFile}" 2>&1; echo "" >> "${outputFile}"; echo "[Process exited with code $?]" >> "${outputFile}"' >/dev/null 2>&1 &`;

      spawnSync("sh", ["-c", wrappedCommand], {
        cwd: process.cwd(),
        stdio: "ignore",
      });

      // For CLI usage, return immediately after outputStartedJson
      return;
    }
    // Non-live mode: use spawnSync (blocking)
    const result = spawnSync("sh", ["-c", command], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: process.cwd(),
    });

    const output = (result.stdout || "") + (result.stderr || "");

    writeEvent(sessionName, {
      type: "created" as const,
      id,
      component: "output" as ComponentType,
      title: titleValue,
      args: {
        command,
        output: output.trim(),
        exitCode: result.status,
      },
      agentSessionId,
      project: cwdToProject(process.cwd()),
    });

    // Update idle marker so TUI can detect this session
    if (agentSessionId) {
      writeIdleMarker(agentSessionId, process.cwd());
    }

    outputStartedJson(id, sessionName);
    return;
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

  // Write created event - dashboard will render the component
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

  // Update idle marker so TUI can detect this session
  if (agentSessionId) {
    writeIdleMarker(agentSessionId, process.cwd());
  }

  outputStartedJson(id, sessionName);
}
