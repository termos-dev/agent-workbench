import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildShellCommand } from "./shell-utils.js";

const execFileAsync = promisify(execFile);

/**
 * Write a shell script to a temp file and return its path.
 * This allows running commands in an interactive shell context with proper TTY.
 */
function writeTempScript(shellCommand: string): string {
  const shell = process.env.SHELL || "/bin/sh";
  const tempFile = path.join(os.tmpdir(), `termos-pane-${Date.now()}.sh`);
  const scriptContent = `#!${shell}
${shellCommand}
`;
  fs.writeFileSync(tempFile, scriptContent, { mode: 0o755 });
  return tempFile;
}

/**
 * Schedule cleanup of a temp script file after a delay.
 * Zellij run returns before the script starts, so we need to wait.
 */
function scheduleScriptCleanup(scriptPath: string, delayMs: number = 10000): void {
  setTimeout(() => {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }, delayMs);
}

/**
 * Write a KDL layout file for creating a tab with a command.
 * This ensures atomic tab creation - the command runs in the new tab only,
 * avoiding race conditions that could affect other panes (like Claude's).
 * Includes tab-bar and status-bar to match Zellij's default layout.
 */
function writeTempLayout(shellCommand: string, cwd?: string): string {
  const tempFile = path.join(os.tmpdir(), `termos-layout-${Date.now()}.kdl`);
  const shell = process.env.SHELL || "/bin/sh";

  // Escape double quotes and backslashes for KDL string
  const escapedCommand = shellCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cwdLine = cwd ? `        cwd "${cwd}"\n` : "";

  // Include tab-bar and status-bar to match Zellij's default layout
  const layoutContent = `layout {
    pane size=1 borderless=true {
        plugin location="zellij:tab-bar"
    }
    pane command="${shell}" {
        args "-c" "${escapedCommand}"
${cwdLine}    }
    pane size=1 borderless=true {
        plugin location="zellij:status-bar"
    }
}`;

  fs.writeFileSync(tempFile, layoutContent, { mode: 0o644 });
  return tempFile;
}

interface FloatingPaneOptions {
  name?: string;
  width?: string;
  height?: string;
  x?: string;
  y?: string;
  closeOnExit?: boolean;
  cwd?: string;
}

export async function runFloatingPane(
  command: string,
  options: FloatingPaneOptions = {},
  env?: Record<string, string>,
  sessionName?: string
): Promise<void> {
  const args = ["run", "--floating", "--pinned", "true"];

  if (options.closeOnExit) args.push("--close-on-exit");
  if (options.name) args.push("--name", options.name);
  if (options.cwd) args.push("--cwd", options.cwd);
  if (options.width) args.push("--width", options.width);
  if (options.height) args.push("--height", options.height);
  if (options.x) args.push("--x", options.x);
  if (options.y) args.push("--y", options.y);

  const shellCommand = buildShellCommand(command, env);
  // Write to temp script and execute directly to ensure proper TTY/raw mode for Ink
  const scriptPath = writeTempScript(shellCommand);
  args.push("--", scriptPath);

  // Pass session name via env var if running from outside the session
  const execEnv = sessionName ? { ...process.env, ZELLIJ_SESSION_NAME: sessionName } : undefined;
  await execFileAsync("zellij", args, execEnv ? { env: execEnv } : undefined);

  // Schedule cleanup after the script has had time to start
  scheduleScriptCleanup(scriptPath);
}

export async function runTab(
  command: string,
  options: FloatingPaneOptions = {},
  env?: Record<string, string>,
  sessionName?: string
): Promise<void> {
  const name = options.name ?? "termos";
  const shellCommand = buildShellCommand(command, env);

  // Pass session name via env var if running from outside the session
  const execEnv = sessionName ? { ...process.env, ZELLIJ_SESSION_NAME: sessionName } : undefined;
  const execOptions = execEnv ? { env: execEnv } : undefined;

  // Create a KDL layout file with the command - this is atomic and safe.
  // Unlike the previous --in-place approach, this cannot affect other panes
  // even if focus is not on the expected tab.
  const layoutPath = writeTempLayout(shellCommand, options.cwd);

  // Atomic operation: create tab with layout (command runs immediately in new tab)
  const tabArgs = ["action", "new-tab", "--layout", layoutPath, "--name", name];
  await execFileAsync("zellij", tabArgs, execOptions);

  // Schedule cleanup after the layout file has been read
  scheduleScriptCleanup(layoutPath);
}

interface SplitPaneOptions {
  name?: string;
  direction?: "right" | "down";
  closeOnExit?: boolean;
  cwd?: string;
}

interface PaneDimensions {
  columns: number;
  rows: number;
}

function getCurrentPaneDimensions(): PaneDimensions {
  return {
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

export function getOptimalSplitDirection(): "right" | "down" {
  const dims = getCurrentPaneDimensions();
  return dims.rows > dims.columns ? "down" : "right";
}

export async function runSplitPane(
  command: string,
  options: SplitPaneOptions = {},
  env?: Record<string, string>,
  sessionName?: string
): Promise<void> {
  const direction = options.direction ?? getOptimalSplitDirection();
  const args = ["run", "--direction", direction];

  if (options.closeOnExit) args.push("--close-on-exit");
  if (options.name) args.push("--name", options.name);
  if (options.cwd) args.push("--cwd", options.cwd);

  const shellCommand = buildShellCommand(command, env);
  // Write to temp script and execute directly to ensure proper TTY/raw mode for Ink
  const scriptPath = writeTempScript(shellCommand);
  args.push("--", scriptPath);

  // Pass session name via env var if running from outside the session
  const execEnv = sessionName ? { ...process.env, ZELLIJ_SESSION_NAME: sessionName } : undefined;
  await execFileAsync("zellij", args, execEnv ? { env: execEnv } : undefined);

  // Schedule cleanup after the script has had time to start
  scheduleScriptCleanup(scriptPath);
}

/**
 * Check if a zellij session is alive by querying zellij list-sessions.
 */
export async function isSessionAlive(sessionName: string): Promise<boolean> {
  try {
    const sessions = await listSessions();
    return sessions.includes(sessionName);
  } catch {
    return false;
  }
}

/**
 * List all zellij sessions.
 */
export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("zellij", ["list-sessions", "-s"]);
    return stdout
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Kill a zellij session by name.
 */
export async function killSession(sessionName: string): Promise<void> {
  await execFileAsync("zellij", ["kill-session", sessionName]);
}

/**
 * Check if zellij is installed and available.
 */
export async function isZellijInstalled(): Promise<boolean> {
  try {
    await execFileAsync("zellij", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export interface PaneInfo {
  name?: string;
  command?: string;
  args?: string[];
  suspended?: boolean;
}

export interface TabInfo {
  name: string;
  focused: boolean;
  panes: PaneInfo[];
}

/**
 * Get the layout of a zellij session including tabs and panes.
 */
export async function getSessionLayout(sessionName: string): Promise<TabInfo[]> {
  try {
    const { stdout } = await execFileAsync("zellij", [
      "--session", sessionName,
      "action", "dump-layout"
    ]);
    return parseLayoutKdl(stdout);
  } catch {
    return [];
  }
}

/**
 * Parse KDL layout output to extract tab and pane info.
 * This is a simple parser for the specific format zellij outputs.
 */
function parseLayoutKdl(kdl: string): TabInfo[] {
  const tabs: TabInfo[] = [];
  const lines = kdl.split('\n');

  let currentTab: TabInfo | null = null;
  let currentPane: PaneInfo | null = null;
  let inPane = false;
  let inTemplate = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip template sections (new_tab_template, swap_tiled_layout, etc.)
    if (trimmed.match(/^(new_tab_template|swap_tiled_layout|swap_floating_layout)\s*{/)) {
      inTemplate = true;
      braceDepth = 1;
      continue;
    }

    // Track template brace depth
    if (inTemplate) {
      const openBraces = (trimmed.match(/{/g) || []).length;
      const closeBraces = (trimmed.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;
      if (braceDepth <= 0) {
        inTemplate = false;
        braceDepth = 0;
      }
      continue;
    }

    // Match tab line: tab name="Tab #1" focus=true { or tab { (attributes can be in any order)
    if (trimmed.startsWith('tab ') && trimmed.endsWith('{')) {
      if (currentTab) tabs.push(currentTab);
      const nameMatch = trimmed.match(/name="([^"]*)"/);
      const focusMatch = trimmed.match(/focus=(true|false)/);
      currentTab = {
        name: nameMatch?.[1] || 'Tab',
        focused: focusMatch?.[1] === 'true',
        panes: []
      };
      continue;
    }

    // Match pane with command: pane command="python" name="docs" { (order may vary)
    if (trimmed.startsWith('pane ') && trimmed.includes('command=') && currentTab) {
      const commandMatch = trimmed.match(/command="([^"]*)"/);
      const nameMatch = trimmed.match(/name="([^"]*)"/);
      if (commandMatch) {
        currentPane = {
          command: commandMatch[1],
          name: nameMatch?.[1],
          args: [],
          suspended: false
        };
        inPane = true;
        continue;
      }
    }

    // Match pane without command (plugins, etc) - skip these
    if (trimmed.startsWith('pane ') && trimmed.includes('{')) {
      continue;
    }

    // Inside a pane, look for args and start_suspended
    if (inPane && currentPane) {
      // Match args "arg1" "arg2" ...
      const argsMatch = trimmed.match(/^args\s+(.+)/);
      if (argsMatch) {
        const argsStr = argsMatch[1];
        const argMatches = argsStr.match(/"([^"]*)"/g);
        if (argMatches) {
          currentPane.args = argMatches.map(a => a.slice(1, -1));
        }
      }

      // Match start_suspended true
      if (trimmed.includes('start_suspended true')) {
        currentPane.suspended = true;
      }

      // End of pane block
      if (trimmed === '}' && currentTab) {
        currentTab.panes.push(currentPane);
        currentPane = null;
        inPane = false;
      }
    }
  }

  // Don't forget the last tab
  if (currentTab) tabs.push(currentTab);

  return tabs;
}
