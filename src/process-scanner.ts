/**
 * Process Scanner - Detects running coding agent processes
 *
 * Uses system tools (ps, lsof) to discover processes and their working directories.
 * Agent-agnostic: works for Claude, Codex, OpenCode, etc.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { matchAgent } from "./agent-registry.js";

export interface AgentProcess {
  /** Agent type (claude, codex, etc.) */
  agent: string;
  /** Process ID */
  pid: number;
  /** Parent process ID */
  ppid: number;
  /** Terminal (e.g., ttys000) or "??" if not attached */
  tty: string;
  /** Command line (truncated) */
  command: string;
  /** Working directory path */
  projectPath: string | null;
  /** Project name (basename of projectPath) */
  project: string | null;
  /** Session title set via awb set-title */
  title: string | null;
  /** When this process was detected */
  detectedAt: number;
}

/**
 * Get title for a process by PID (from awb set-title)
 */
function getTitleByPid(pid: number): string | null {
  try {
    const titlePath = path.join(
      os.homedir(),
      ".awb",
      "pid-titles",
      String(pid)
    );
    if (fs.existsSync(titlePath)) {
      const data = JSON.parse(fs.readFileSync(titlePath, "utf-8"));
      return data.title || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Execute a shell command and return stdout
 */
function execCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

/**
 * Get working directory for a process using lsof (macOS/Linux)
 */
export function getProcessCwd(pid: number): string | null {
  // macOS: lsof shows cwd as a file descriptor
  const output = execCommand(`lsof -p ${pid} 2>/dev/null | grep cwd`);
  if (output) {
    // Parse lsof output: "COMMAND PID USER FD TYPE ... NAME"
    const parts = output.split(/\s+/);
    const cwdPath = parts[parts.length - 1];
    if (cwdPath?.startsWith("/")) {
      return cwdPath;
    }
  }

  // Linux fallback: read /proc/PID/cwd symlink
  const procCwd = execCommand(`readlink /proc/${pid}/cwd 2>/dev/null`);
  if (procCwd?.startsWith("/")) {
    return procCwd;
  }

  return null;
}

/**
 * Check if a process is still running
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // kill -0 checks if process exists without sending a signal
    execSync(`kill -0 ${pid} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a line from ps output
 */
function parsePsLine(line: string): {
  pid: number;
  ppid: number;
  tty: string;
  command: string;
} | null {
  // Match: "  PID  PPID TTY  COMMAND..."
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;

  const [, pidStr, ppidStr, tty, command] = match;
  return {
    pid: Number.parseInt(pidStr, 10),
    ppid: Number.parseInt(ppidStr, 10),
    tty,
    command,
  };
}

/**
 * Scan for all running coding agent processes
 */
export function scanAgentProcesses(): AgentProcess[] {
  const psOutput = execCommand("ps -eo pid,ppid,tty,args");
  if (!psOutput) return [];

  const lines = psOutput.split("\n").slice(1); // Skip header
  const processes: AgentProcess[] = [];
  const now = Date.now();

  for (const line of lines) {
    const parsed = parsePsLine(line);
    if (!parsed) continue;

    const agent = matchAgent(parsed.command);
    if (!agent) continue;

    const projectPath = getProcessCwd(parsed.pid);
    const project = projectPath ? path.basename(projectPath) : null;

    // Look up title set via awb set-title
    const title = getTitleByPid(parsed.pid);

    processes.push({
      agent: agent.name,
      pid: parsed.pid,
      ppid: parsed.ppid,
      tty: parsed.tty,
      command: parsed.command.slice(0, 100), // Truncate for storage
      projectPath,
      project,
      title,
      detectedAt: now,
    });
  }

  return processes;
}

/**
 * Group processes by project path
 */
export function groupByProject(
  processes: AgentProcess[]
): Map<string, AgentProcess[]> {
  const groups = new Map<string, AgentProcess[]>();

  for (const proc of processes) {
    const key = proc.projectPath || "unknown";
    const existing = groups.get(key) || [];
    existing.push(proc);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Group processes by agent type
 */
export function groupByAgent(
  processes: AgentProcess[]
): Map<string, AgentProcess[]> {
  const groups = new Map<string, AgentProcess[]>();

  for (const proc of processes) {
    const existing = groups.get(proc.agent) || [];
    existing.push(proc);
    groups.set(proc.agent, existing);
  }

  return groups;
}
