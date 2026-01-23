/**
 * Agent display status for dashboard.
 * Represents an active Claude session with its current state.
 */
export interface AgentDisplayStatus {
  id: string; // Short ID (first 8 chars)
  sessionId: string; // Full session ID
  project: string; // Project name
  projectPath: string; // Full project path
  displayStatus: "running" | "idle" | "thinking" | "waiting";
  modified: string; // Last activity timestamp
  messageCount: number;
  gitBranch?: string;
  title?: string; // Short title (set via termos set-title)
  firstPrompt?: string; // User's initial prompt for this session
  source: "index" | "marker" | "both";
  planFile?: string; // Associated plan file path (from session transcript)
}
