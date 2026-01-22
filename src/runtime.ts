import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getAgentState, type AgentState } from "./events.js";
import { DEFAULT_THRESHOLD_MS, MARKER_CLEANUP_MS, IDLE_GRACE_PERIOD_MS } from "./constants.js";

/**
 * Get the Claude Code projects directory.
 * Claude stores session data in ~/.claude/projects/{encoded-path}/
 */
export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

/**
 * Get the path to Claude's sessions-index.json for a given project path.
 */
export function getClaudeSessionsIndexPath(projectPath: string): string {
  const encoded = pathToSessionName(projectPath);
  return path.join(getClaudeProjectsDir(), encoded, "sessions-index.json");
}

/**
 * Entry in Claude's sessions-index.json
 */
export interface ClaudeSessionEntry {
  sessionId: string;
  modified: string;       // ISO timestamp
  projectPath: string;
  messageCount: number;
  fullPath?: string;
  gitBranch?: string;
}

/**
 * Structure of Claude's sessions-index.json
 */
export interface ClaudeSessionsIndex {
  entries: ClaudeSessionEntry[];
}

/**
 * Active session info combining Claude's index + our idle markers
 */
export interface ActiveSession {
  sessionId: string;
  projectPath: string;
  project: string;           // Short project name
  modified: string;          // Last activity timestamp
  messageCount: number;
  gitBranch?: string;
  title?: string;            // Short title (set via termos set-title)
  status: 'running' | 'idle' | 'thinking';
  source: 'index' | 'marker' | 'both';  // Where we detected this session
}


/**
 * Get cached title for a session (set via `termos set-title`).
 */
function getCachedTitle(sessionId: string): string | undefined {
  const titlePath = path.join(os.homedir(), ".termos", "titles", sessionId);
  try {
    if (fs.existsSync(titlePath)) {
      return fs.readFileSync(titlePath, "utf-8").trim() || undefined;
    }
  } catch {
    // Ignore errors
  }
  return undefined;
}

/**
 * Clean up stale markers from a directory (older than 1 hour).
 */
function cleanupStaleMarkers(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const now = Date.now();
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const markerPath = path.join(dir, file);
      try {
        const stat = fs.statSync(markerPath);
        if (now - stat.mtimeMs > MARKER_CLEANUP_MS) {
          fs.unlinkSync(markerPath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Get all active sessions using hybrid detection.
 *
 * Sources:
 * 1. Claude's sessions-index.json - source of truth for session data
 * 2. Our idle markers (~/.termos/markers/idle/) - catches new sessions before index updates
 *
 * A session is active if EITHER source shows recent activity AND no ended marker exists.
 */
export function getActiveSessions(thresholdMs: number = DEFAULT_THRESHOLD_MS): ActiveSession[] {
  const now = Date.now();
  const sessionsMap = new Map<string, ActiveSession>();

  // Housekeeping: clean up old markers (ended and idle)
  cleanupStaleMarkers(getEndedMarkersDir());
  cleanupStaleMarkers(getIdleMarkersDir());

  // Build lookup map of all session data from Claude's index
  const sessionDataLookup = buildSessionDataLookup();

  // Source 1: Scan Claude's sessions-index.json files
  scanSessionsIndex(sessionsMap, now, thresholdMs);

  // Source 2: Scan idle markers for sessions not yet in index
  scanIdleMarkers(sessionsMap, now, thresholdMs, sessionDataLookup);

  // Convert to array and sort by modified time (most recent first)
  const results = Array.from(sessionsMap.values());
  results.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

  return results;
}

/**
 * Build a lookup map of all sessions from Claude's sessions-index.json files.
 * Used to enrich idle marker entries with data like projectPath, gitBranch.
 */
function buildSessionDataLookup(): Map<string, ClaudeSessionEntry> {
  const lookup = new Map<string, ClaudeSessionEntry>();
  const projectsDir = getClaudeProjectsDir();
  if (!fs.existsSync(projectsDir)) return lookup;

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const indexPath = path.join(projectsDir, entry.name, "sessions-index.json");
      if (!fs.existsSync(indexPath)) continue;

      try {
        const content = fs.readFileSync(indexPath, "utf-8");
        const index = JSON.parse(content) as ClaudeSessionsIndex;
        for (const session of index.entries) {
          lookup.set(session.sessionId, session);
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Ignore errors
  }

  return lookup;
}

/**
 * Scan Claude's sessions-index.json files
 */
function scanSessionsIndex(
  sessionsMap: Map<string, ActiveSession>,
  now: number,
  thresholdMs: number
): void {
  const projectsDir = getClaudeProjectsDir();
  if (!fs.existsSync(projectsDir)) return;

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const indexPath = path.join(projectsDir, entry.name, "sessions-index.json");
      if (!fs.existsSync(indexPath)) continue;

      try {
        const content = fs.readFileSync(indexPath, "utf-8");
        const index = JSON.parse(content) as ClaudeSessionsIndex;

        for (const session of index.entries) {
          // Skip if session has ended (immediate removal)
          if (isSessionEnded(session.sessionId)) continue;

          // Check if has idle marker (agent waiting for user input)
          const idleTimestamp = getIdleMarkerTimestamp(session.sessionId);
          const hasIdleMarker = idleTimestamp !== null;

          const modifiedTime = new Date(session.modified).getTime();
          const age = now - modifiedTime;

          // Skip if too old AND no idle marker (stale/crashed session)
          // Sessions with idle markers are kept indefinitely (user might be thinking)
          if (age > thresholdMs && !hasIdleMarker) continue;

          // Get status using event-based state machine
          const status = getAgentStatus(session.sessionId, session.projectPath);

          sessionsMap.set(session.sessionId, {
            sessionId: session.sessionId,
            projectPath: session.projectPath,
            project: cwdToProject(session.projectPath),
            modified: session.modified,
            messageCount: session.messageCount,
            gitBranch: session.gitBranch,
            title: getCachedTitle(session.sessionId),
            status,
            source: 'index',
          });
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Idle marker data (JSON format)
 */
interface IdleMarkerData {
  timestamp: string;
  cwd?: string;
}

/**
 * Read idle marker data (supports both old plain text and new JSON format)
 */
function readIdleMarker(markerPath: string): IdleMarkerData | null {
  try {
    const content = fs.readFileSync(markerPath, "utf-8").trim();
    if (!content) return null;

    // Try JSON format first
    if (content.startsWith('{')) {
      return JSON.parse(content) as IdleMarkerData;
    }

    // Fallback: old plain text format (just timestamp)
    return { timestamp: content };
  } catch {
    return null;
  }
}

/**
 * Scan idle markers for sessions not yet in sessions-index.
 * This catches brand new sessions before Claude updates the index.
 */
function scanIdleMarkers(
  sessionsMap: Map<string, ActiveSession>,
  now: number,
  thresholdMs: number,
  sessionDataLookup: Map<string, ClaudeSessionEntry>
): void {
  const markersDir = getIdleMarkersDir();
  if (!fs.existsSync(markersDir)) return;

  try {
    const files = fs.readdirSync(markersDir);
    for (const sessionId of files) {
      // Skip if session has ended (immediate removal)
      if (isSessionEnded(sessionId)) continue;

      // Skip if already found in sessions-index
      if (sessionsMap.has(sessionId)) {
        // Update source to 'both'
        const existing = sessionsMap.get(sessionId)!;
        existing.source = 'both';
        continue;
      }

      const markerPath = path.join(markersDir, sessionId);
      try {
        // Read marker data - if idle marker exists, session is waiting for user
        // Keep it indefinitely (1hr cleanup handles truly stale markers)
        const markerData = readIdleMarker(markerPath);
        if (!markerData) continue;

        const markerTime = new Date(markerData.timestamp);
        const projectPath = markerData.cwd || 'unknown';
        const project = projectPath !== 'unknown' ? cwdToProject(projectPath) : sessionId.substring(0, 8);

        // Look up additional session data from Claude's index
        const indexData = sessionDataLookup.get(sessionId);
        const effectiveProjectPath = indexData?.projectPath || projectPath;

        // Get status using event-based state machine
        const status = effectiveProjectPath !== 'unknown'
          ? getAgentStatus(sessionId, effectiveProjectPath)
          : 'idle';

        sessionsMap.set(sessionId, {
          sessionId,
          projectPath: effectiveProjectPath,
          project: effectiveProjectPath !== 'unknown' ? cwdToProject(effectiveProjectPath) : project,
          modified: markerTime.toISOString(),
          messageCount: indexData?.messageCount || 0,
          gitBranch: indexData?.gitBranch,
          title: getCachedTitle(sessionId),
          status,
          source: 'marker',
        });
      } catch {
        // Skip invalid markers
      }
    }
  } catch {
    // Ignore errors
  }
}

export function getRuntimeRoot(): string {
  const override = process.env.TERMOS_RUNTIME_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }
  return path.join(os.homedir(), ".termos", "sessions");
}

/**
 * Convert a path to a session name by replacing slashes with dashes.
 * Similar to how Claude Code stores projects in ~/.claude/projects/
 * e.g., /Users/foo/myproject -> -Users-foo-myproject
 */
export function pathToSessionName(cwd: string): string {
  // Normalize and convert slashes to dashes
  const normalized = path.resolve(cwd);
  const sessionName = normalized.replace(/[/\\]/g, "-");
  return sessionName || "session";
}

export function getSessionRuntimeDir(sessionName: string): string {
  return path.join(getRuntimeRoot(), sessionName);
}

export function getEventsFilePath(sessionName: string): string {
  return path.join(getSessionRuntimeDir(sessionName), "events.jsonl");
}

export function ensureEventsFile(sessionName: string): string {
  const dir = getSessionRuntimeDir(sessionName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getEventsFilePath(sessionName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", { flag: "w" });
  }
  return filePath;
}


/**
 * Get the path to the global dashboard marker file.
 * This indicates the dashboard is running and can handle interactions.
 */
export function getDashboardMarkerPath(): string {
  return path.join(getRuntimeRoot(), ".dashboard");
}

/**
 * Write dashboard marker file with PID.
 */
export function writeDashboardMarker(): void {
  const dir = getRuntimeRoot();
  fs.mkdirSync(dir, { recursive: true });
  const markerPath = getDashboardMarkerPath();
  fs.writeFileSync(markerPath, `${process.pid}\n${new Date().toISOString()}`, { flag: "w" });
}

/**
 * Delete dashboard marker file.
 */
export function deleteDashboardMarker(): void {
  const markerPath = getDashboardMarkerPath();
  try {
    fs.unlinkSync(markerPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Get the path to the markers directory.
 */
export function getMarkersDir(): string {
  return path.join(os.homedir(), ".termos", "markers");
}

/**
 * Get the path to the idle markers directory.
 */
export function getIdleMarkersDir(): string {
  return path.join(getMarkersDir(), "idle");
}

/**
 * Get the path to the ended markers directory.
 * Sessions with ended markers are immediately removed from TUI.
 */
export function getEndedMarkersDir(): string {
  return path.join(getMarkersDir(), "ended");
}

/**
 * Check if a session has an ended marker (set by SessionEnd hook).
 */
export function isSessionEnded(sessionId: string): boolean {
  const markerPath = path.join(getEndedMarkersDir(), sessionId);
  return fs.existsSync(markerPath);
}

/**
 * Get the timestamp stored in an idle marker for a session.
 * Supports both old plain text and new JSON format.
 */
export function getIdleMarkerTimestamp(sessionId: string): Date | null {
  const markerPath = path.join(getIdleMarkersDir(), sessionId);
  try {
    const content = fs.readFileSync(markerPath, "utf-8").trim();
    if (!content) return null;

    // Try JSON format first
    if (content.startsWith('{')) {
      const data = JSON.parse(content) as { timestamp: string };
      const date = new Date(data.timestamp);
      return isNaN(date.getTime()) ? null : date;
    }

    // Fallback: plain text timestamp
    const date = new Date(content);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Check if an agent is idle based on idle marker vs session modified time.
 * Uses a small grace period (2 seconds) to handle timing differences.
 */
export function isAgentIdle(sessionId: string, sessionModified: string): boolean {
  const idleTimestamp = getIdleMarkerTimestamp(sessionId);
  if (!idleTimestamp) return false;

  const modifiedTime = new Date(sessionModified).getTime();
  const idleTime = idleTimestamp.getTime();

  // If idle marker is within grace period of session modified (or newer), consider idle
  // This handles the case where Stop fires at approximately the same time as session update
  return idleTime >= modifiedTime - IDLE_GRACE_PERIOD_MS;
}

/**
 * Get agent status using event stream analysis for better accuracy.
 * Falls back to marker-based detection if no events are available.
 *
 * This provides three states:
 * - 'running': Agent is actively executing a tool
 * - 'thinking': Agent just finished a tool and may be about to start another (grace period)
 * - 'idle': Agent has stopped and grace period has passed
 */
export function getAgentStatus(_sessionId: string, projectPath: string): 'running' | 'thinking' | 'idle' {
  // Note: _sessionId is kept for API consistency and potential future use
  const sessionName = pathToSessionName(projectPath);
  const { state } = getAgentState(sessionName);

  // Map AgentState to status
  if (state === 'working') return 'running';
  if (state === 'thinking') return 'thinking';
  return 'idle';
}

/**
 * Write or update idle marker for a session.
 * Used by termos run to keep session visible while waiting for user input.
 */
export function writeIdleMarker(sessionId: string, cwd: string): void {
  const markersDir = getIdleMarkersDir();
  fs.mkdirSync(markersDir, { recursive: true });
  const markerPath = path.join(markersDir, sessionId);
  const data = {
    timestamp: new Date().toISOString(),
    cwd,
  };
  fs.writeFileSync(markerPath, JSON.stringify(data), "utf-8");
}

/**
 * Convert a cwd path to project name (last path segment).
 * e.g., "/Users/burakemre/Code/mcp-sidecar" -> "mcp-sidecar"
 */
export function cwdToProject(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

/**
 * Get the plan file path for a session by scanning its JSONL transcript.
 * Searches for paths matching ~/.claude/plans/*.md in the session transcript.
 *
 * @param sessionId - The full session ID (UUID)
 * @param projectPath - The project path (used to locate the JSONL file)
 * @returns The most recent plan file path found, or undefined if none
 */
export function getPlanFileForSession(sessionId: string, projectPath: string): string | undefined {
  const encoded = pathToSessionName(projectPath);
  const jsonlPath = path.join(getClaudeProjectsDir(), encoded, `${sessionId}.jsonl`);

  if (!fs.existsSync(jsonlPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");

    // Pattern to match plan file paths: ~/.claude/plans/*.md
    const homeDir = os.homedir();
    const planDirPattern = path.join(homeDir, ".claude", "plans");

    let latestPlanFile: string | undefined;
    let latestTimestamp = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        // Check various fields that might contain file paths
        // Claude stores file references in different ways depending on the context
        const searchText = JSON.stringify(event);

        // Look for plan file paths in the JSON
        const planFileRegex = new RegExp(
          `${planDirPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/\\\\][^"\\s]+\\.md`,
          "g"
        );

        const matches = searchText.match(planFileRegex);
        if (matches) {
          for (const match of matches) {
            // Skip matches containing literal \n (multiline noise from JSON)
            if (match.includes('\\n')) continue;

            // Parse timestamp - could be ISO string or number
            let timestamp = latestTimestamp + 1;
            const rawTs = event.timestamp || event.ts;
            if (rawTs) {
              if (typeof rawTs === 'number') {
                timestamp = rawTs;
              } else if (typeof rawTs === 'string') {
                const parsed = new Date(rawTs).getTime();
                if (!isNaN(parsed)) timestamp = parsed;
              }
            }

            if (timestamp >= latestTimestamp) {
              latestTimestamp = timestamp;
              latestPlanFile = match;
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Validate and normalize the plan file path before returning
    if (latestPlanFile) {
      try {
        // Ensure it's a valid path that can be normalized
        const normalizedPath = path.resolve(latestPlanFile);
        // Only return if the parent directory exists (file may be gone)
        const parentDir = path.dirname(normalizedPath);
        if (fs.existsSync(parentDir)) {
          return normalizedPath;
        }
      } catch {
        // Path is invalid, don't return it
        return undefined;
      }
    }

    return latestPlanFile;
  } catch {
    return undefined;
  }
}

/**
 * Convert a session name to project name.
 * e.g., "-Users-burakemre-Code-mcp-sidecar" -> "mcp-sidecar"
 */
export function sessionNameToProject(sessionName: string): string {
  // Convert session name back to path-like string, then use cwdToProject
  const asPath = sessionName.replace(/-/g, "/");
  return cwdToProject(asPath);
}
