/**
 * Status command - show all sessions and their interactions
 */

import {
  type CreatedEvent,
  getAgentState,
  getPendingInteractions,
} from "../events.js";
import { sessionNameToProject } from "../runtime.js";
import { discoverSessionDirs } from "../session-scanner.js";

interface SessionStatus {
  sessionName: string;
  project: string;
  agentState: "working" | "thinking" | "idle";
  pending: CreatedEvent[];
}

/**
 * Get status for all sessions
 */
async function getAllSessionStatus(): Promise<SessionStatus[]> {
  const sessionNames = await discoverSessionDirs();
  const statuses: SessionStatus[] = [];

  for (const sessionName of sessionNames) {
    const pending = getPendingInteractions(sessionName);
    const { state: agentState } = getAgentState(sessionName);

    // Only include sessions that have pending interactions
    if (pending.length > 0) {
      statuses.push({
        sessionName,
        project: sessionNameToProject(sessionName),
        agentState,
        pending,
      });
    }
  }

  return statuses;
}

/**
 * Format time ago string
 */
function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Handle the status command
 */
export async function handleStatus(args: string[]): Promise<void> {
  const jsonOutput = args.includes("--json");
  const statuses = await getAllSessionStatus();

  if (jsonOutput) {
    console.log(JSON.stringify(statuses, null, 2));
    return;
  }

  if (statuses.length === 0) {
    console.log("No active sessions found.");
    return;
  }

  // Print status for each session
  for (const session of statuses) {
    const stateColor =
      session.agentState === "working"
        ? "\x1b[33m" // yellow
        : session.agentState === "thinking"
          ? "\x1b[36m" // cyan
          : "\x1b[90m"; // gray
    const stateIcon =
      session.agentState === "working"
        ? "●"
        : session.agentState === "thinking"
          ? "◐"
          : "○";

    console.log(`\n\x1b[1m${session.project}\x1b[0m`);
    console.log(
      `  ${stateColor}${stateIcon}\x1b[0m Agent: ${session.agentState}`
    );

    // Show pending interactions
    if (session.pending.length > 0) {
      console.log("  \x1b[34m?\x1b[0m Pending interactions:");
      for (const int of session.pending) {
        const type = int.component;
        const title = int.title || int.prompt || "untitled";
        console.log(`    - [${type}] ${title} (${timeAgo(int.ts)})`);
      }
    }
  }

  // Summary
  const totalPending = statuses.reduce((sum, s) => sum + s.pending.length, 0);
  console.log(`\n${statuses.length} session(s), ${totalPending} pending`);
}
