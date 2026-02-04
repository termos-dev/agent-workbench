/**
 * Process Tracker - State management for agent processes
 *
 * Maintains a list of tracked processes, validates they're still running,
 * and correlates them with awb sessions.
 */

import {
  type AgentProcess,
  isProcessAlive,
  scanAgentProcesses,
} from "./process-scanner.js";
import { pathToSessionName } from "./runtime.js";

export interface TrackedProcess extends AgentProcess {
  /** awb session name (encoded path) */
  sessionName: string | null;
  /** Last time this process was seen running */
  lastSeen: number;
  /** Whether the process is currently alive */
  alive: boolean;
}

export interface ProcessTrackerState {
  /** All tracked processes indexed by PID */
  processes: Map<number, TrackedProcess>;
  /** Last scan timestamp */
  lastScan: number;
}

// In-memory state
let state: ProcessTrackerState = {
  processes: new Map(),
  lastScan: 0,
};

// Scan interval in ms
const SCAN_INTERVAL = 2000;

// How long to keep dead processes in state (for UI transition animations)
const DEAD_PROCESS_TTL = 5000;

/**
 * Convert AgentProcess to TrackedProcess
 */
function toTrackedProcess(proc: AgentProcess): TrackedProcess {
  const sessionName = proc.projectPath
    ? pathToSessionName(proc.projectPath)
    : null;

  return {
    ...proc,
    sessionName,
    lastSeen: Date.now(),
    alive: true,
  };
}

/**
 * Perform a full scan and update state
 */
export function scan(): TrackedProcess[] {
  const now = Date.now();
  const scanned = scanAgentProcesses();

  // Track which PIDs we've seen in this scan
  const seenPids = new Set<number>();

  // Update or add processes from scan
  for (const proc of scanned) {
    seenPids.add(proc.pid);

    const existing = state.processes.get(proc.pid);
    if (existing) {
      // Update existing process
      existing.lastSeen = now;
      existing.alive = true;
      // Update projectPath if it changed (rare but possible)
      if (proc.projectPath !== existing.projectPath) {
        existing.projectPath = proc.projectPath;
        existing.project = proc.project;
        existing.sessionName = proc.projectPath
          ? pathToSessionName(proc.projectPath)
          : null;
      }
    } else {
      // Add new process
      state.processes.set(proc.pid, toTrackedProcess(proc));
    }
  }

  // Mark processes not seen as dead
  for (const [pid, proc] of state.processes) {
    if (!seenPids.has(pid)) {
      proc.alive = false;
    }
  }

  // Clean up old dead processes
  for (const [pid, proc] of state.processes) {
    if (!proc.alive && now - proc.lastSeen > DEAD_PROCESS_TTL) {
      state.processes.delete(pid);
    }
  }

  state.lastScan = now;

  return Array.from(state.processes.values());
}

/**
 * Get all tracked processes
 */
export function getProcesses(): TrackedProcess[] {
  return Array.from(state.processes.values());
}

/**
 * Get alive processes only
 */
export function getAliveProcesses(): TrackedProcess[] {
  return Array.from(state.processes.values()).filter((p) => p.alive);
}

/**
 * Get processes for a specific session
 */
export function getProcessesForSession(sessionName: string): TrackedProcess[] {
  return Array.from(state.processes.values()).filter(
    (p) => p.alive && p.sessionName === sessionName
  );
}

/**
 * Get processes for a specific project path
 */
export function getProcessesForProject(projectPath: string): TrackedProcess[] {
  return Array.from(state.processes.values()).filter(
    (p) => p.alive && p.projectPath === projectPath
  );
}

/**
 * Get a process by PID
 */
export function getProcess(pid: number): TrackedProcess | undefined {
  return state.processes.get(pid);
}

/**
 * Validate a specific process is still alive
 */
export function validateProcess(pid: number): boolean {
  const proc = state.processes.get(pid);
  if (!proc) return false;

  const alive = isProcessAlive(pid);
  proc.alive = alive;
  if (alive) {
    proc.lastSeen = Date.now();
  }

  return alive;
}

/**
 * Get summary statistics
 */
export function getStats(): {
  total: number;
  alive: number;
  byAgent: Record<string, number>;
  byProject: Record<string, number>;
} {
  const processes = Array.from(state.processes.values());
  const alive = processes.filter((p) => p.alive);

  const byAgent: Record<string, number> = {};
  const byProject: Record<string, number> = {};

  for (const proc of alive) {
    byAgent[proc.agent] = (byAgent[proc.agent] || 0) + 1;
    const project = proc.project || "unknown";
    byProject[project] = (byProject[project] || 0) + 1;
  }

  return {
    total: processes.length,
    alive: alive.length,
    byAgent,
    byProject,
  };
}

/**
 * Clear all state (for testing)
 */
export function reset(): void {
  state = {
    processes: new Map(),
    lastScan: 0,
  };
}

/**
 * Check if we need to scan (based on interval)
 */
export function needsScan(): boolean {
  return Date.now() - state.lastScan >= SCAN_INTERVAL;
}

/**
 * Scan if needed, otherwise return cached data
 */
export function scanIfNeeded(): TrackedProcess[] {
  if (needsScan()) {
    return scan();
  }
  return getProcesses();
}
