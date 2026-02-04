import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_THRESHOLD_MS,
  IDLE_GRACE_PERIOD_MS,
  MARKER_CLEANUP_MS,
} from "./constants.js";
import { getAgentState } from "./events.js";

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
  modified: string; // ISO timestamp
  projectPath: string;
  messageCount: number;
  fullPath?: string;
  gitBranch?: string;
  firstPrompt?: string; // User's initial prompt for this session
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
  project: string; // Short project name
  modified: string; // Last activity timestamp
  messageCount: number;
  gitBranch?: string;
  title?: string; // Short title (set via awb set-title)
  firstPrompt?: string; // User's initial prompt for this session
  status: "running" | "idle" | "thinking";
  source: "index" | "marker" | "both"; // Where we detected this session
}

/**
 * Get cached title for a session (set via `awb set-title`).
 */
async function getCachedTitle(sessionId: string): Promise<string | undefined> {
  const titlePath = path.join(os.homedir(), ".awb", "titles", sessionId);
  try {
    const content = await fsp.readFile(titlePath, "utf-8");
    return content.trim() || undefined;
  } catch {
    // Ignore errors (file doesn't exist or read failed)
  }
  return undefined;
}

/**
 * Clean up stale markers from a directory (older than 1 hour).
 */
async function cleanupStaleMarkers(dir: string): Promise<void> {
  const now = Date.now();
  try {
    const files = await fsp.readdir(dir);
    for (const file of files) {
      const markerPath = path.join(dir, file);
      try {
        const stat = await fsp.stat(markerPath);
        if (now - stat.mtimeMs > MARKER_CLEANUP_MS) {
          await fsp.unlink(markerPath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Ignore errors (directory doesn't exist or read failed)
  }
}

/**
 * Get all active sessions using hybrid detection.
 *
 * Sources:
 * 1. Claude's sessions-index.json - source of truth for session data
 * 2. Our idle markers (~/.awb/markers/idle/) - catches new sessions before index updates
 *
 * A session is active if EITHER source shows recent activity AND no ended marker exists.
 */
export async function getActiveSessions(
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): Promise<ActiveSession[]> {
  const now = Date.now();
  const sessionsMap = new Map<string, ActiveSession>();

  // Housekeeping: clean up old markers (ended and idle) - run in parallel
  await Promise.all([
    cleanupStaleMarkers(getEndedMarkersDir()),
    cleanupStaleMarkers(getIdleMarkersDir()),
  ]);

  // Build lookup map of all session data from Claude's index
  const sessionDataLookup = await buildSessionDataLookup();

  // Source 1: Scan Claude's sessions-index.json files
  await scanSessionsIndex(sessionsMap, now, thresholdMs);

  // Source 2: Scan idle markers for sessions not yet in index
  await scanIdleMarkers(sessionsMap, now, thresholdMs, sessionDataLookup);

  // Convert to array and sort by modified time (most recent first)
  const results = Array.from(sessionsMap.values());
  results.sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
  );

  return results;
}

/**
 * Build a lookup map of all sessions from Claude's sessions-index.json files.
 * Used to enrich idle marker entries with data like projectPath, gitBranch.
 */
async function buildSessionDataLookup(): Promise<
  Map<string, ClaudeSessionEntry>
> {
  const lookup = new Map<string, ClaudeSessionEntry>();
  const projectsDir = getClaudeProjectsDir();

  try {
    const entries = await fsp.readdir(projectsDir, { withFileTypes: true });

    // Read all index files in parallel
    const readPromises = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const indexPath = path.join(
          projectsDir,
          entry.name,
          "sessions-index.json"
        );
        try {
          const content = await fsp.readFile(indexPath, "utf-8");
          const index = JSON.parse(content) as ClaudeSessionsIndex;
          return index.entries;
        } catch {
          // Skip invalid or missing files
          return [];
        }
      });

    const results = await Promise.all(readPromises);
    for (const sessions of results) {
      for (const session of sessions) {
        lookup.set(session.sessionId, session);
      }
    }
  } catch {
    // Ignore errors (directory doesn't exist or read failed)
  }

  return lookup;
}

/**
 * Scan Claude's sessions-index.json files
 */
async function scanSessionsIndex(
  sessionsMap: Map<string, ActiveSession>,
  now: number,
  thresholdMs: number
): Promise<void> {
  const projectsDir = getClaudeProjectsDir();

  try {
    const entries = await fsp.readdir(projectsDir, { withFileTypes: true });
    const dirEntries = entries.filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith(".")
    );

    // Read all index files in parallel
    const indexReadPromises = dirEntries.map(async (entry) => {
      const indexPath = path.join(
        projectsDir,
        entry.name,
        "sessions-index.json"
      );
      try {
        const content = await fsp.readFile(indexPath, "utf-8");
        return JSON.parse(content) as ClaudeSessionsIndex;
      } catch {
        return null;
      }
    });

    const indexes = await Promise.all(indexReadPromises);

    // Process all sessions from all indexes
    for (const index of indexes) {
      if (!index) continue;

      // Process sessions in parallel per index
      const sessionPromises = index.entries.map(async (session) => {
        // Skip if session has ended (immediate removal)
        if (await isSessionEnded(session.sessionId)) return null;

        // Check if has idle marker (agent waiting for user input)
        const idleTimestamp = await getIdleMarkerTimestamp(session.sessionId);
        const hasIdleMarker = idleTimestamp !== null;

        const modifiedTime = new Date(session.modified).getTime();
        const age = now - modifiedTime;

        // Skip if too old AND no idle marker (stale/crashed session)
        // Sessions with idle markers are kept indefinitely (user might be thinking)
        if (age > thresholdMs && !hasIdleMarker) return null;

        // Get status using event-based state machine
        const status = getAgentStatus(session.sessionId, session.projectPath);

        // Get cached title
        const title = await getCachedTitle(session.sessionId);

        return {
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          project: cwdToProject(session.projectPath),
          modified: session.modified,
          messageCount: session.messageCount,
          gitBranch: session.gitBranch,
          title,
          firstPrompt: session.firstPrompt,
          status,
          source: "index" as const,
        };
      });

      const results = await Promise.all(sessionPromises);
      for (const result of results) {
        if (result) {
          sessionsMap.set(result.sessionId, result);
        }
      }
    }
  } catch {
    // Ignore errors (directory doesn't exist or read failed)
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
async function readIdleMarker(
  markerPath: string
): Promise<IdleMarkerData | null> {
  try {
    const content = (await fsp.readFile(markerPath, "utf-8")).trim();
    if (!content) return null;

    // Try JSON format first
    if (content.startsWith("{")) {
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
async function scanIdleMarkers(
  sessionsMap: Map<string, ActiveSession>,
  _now: number,
  _thresholdMs: number,
  sessionDataLookup: Map<string, ClaudeSessionEntry>
): Promise<void> {
  const markersDir = getIdleMarkersDir();

  try {
    const files = await fsp.readdir(markersDir);

    // Process markers in parallel
    const markerPromises = files.map(async (sessionId) => {
      // Skip if session has ended (immediate removal)
      if (await isSessionEnded(sessionId)) return null;

      // Skip if already found in sessions-index
      const existing = sessionsMap.get(sessionId);
      if (existing) {
        // Update source to 'both'
        existing.source = "both";
        return null;
      }

      const markerPath = path.join(markersDir, sessionId);
      try {
        // Read marker data - if idle marker exists, session is waiting for user
        // Keep it indefinitely (1hr cleanup handles truly stale markers)
        const markerData = await readIdleMarker(markerPath);
        if (!markerData) return null;

        const markerTime = new Date(markerData.timestamp);
        const projectPath = markerData.cwd || "unknown";
        const project =
          projectPath !== "unknown"
            ? cwdToProject(projectPath)
            : sessionId.substring(0, 8);

        // Look up additional session data from Claude's index
        const indexData = sessionDataLookup.get(sessionId);
        const effectiveProjectPath = indexData?.projectPath || projectPath;

        // Get status using event-based state machine
        const status =
          effectiveProjectPath !== "unknown"
            ? getAgentStatus(sessionId, effectiveProjectPath)
            : "idle";

        // Get cached title
        const title = await getCachedTitle(sessionId);

        return {
          sessionId,
          projectPath: effectiveProjectPath,
          project:
            effectiveProjectPath !== "unknown"
              ? cwdToProject(effectiveProjectPath)
              : project,
          modified: markerTime.toISOString(),
          messageCount: indexData?.messageCount || 0,
          gitBranch: indexData?.gitBranch,
          title,
          firstPrompt: indexData?.firstPrompt,
          status,
          source: "marker" as const,
        };
      } catch {
        // Skip invalid markers
        return null;
      }
    });

    const results = await Promise.all(markerPromises);
    for (const result of results) {
      if (result) {
        sessionsMap.set(result.sessionId, result);
      }
    }
  } catch {
    // Ignore errors (directory doesn't exist or read failed)
  }
}

export function getRuntimeRoot(): string {
  const override = process.env.AWB_RUNTIME_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }
  return path.join(os.homedir(), ".awb", "sessions");
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

export function getProcessInfoPath(
  sessionName: string,
  interactionId: string
): string {
  return path.join(
    getSessionRuntimeDir(sessionName),
    `process-${interactionId}.json`
  );
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
 * Get the path to the global playground marker file.
 * This indicates the playground is running and can handle interactions.
 */
export function getPlaygroundMarkerPath(): string {
  return path.join(getRuntimeRoot(), ".playground");
}

/**
 * Write playground marker file with PID.
 */
export function writePlaygroundMarker(): void {
  const dir = getRuntimeRoot();
  fs.mkdirSync(dir, { recursive: true });
  const markerPath = getPlaygroundMarkerPath();
  fs.writeFileSync(markerPath, `${process.pid}\n${new Date().toISOString()}`, {
    flag: "w",
  });
}

/**
 * Delete playground marker file.
 */
export function deletePlaygroundMarker(): void {
  const markerPath = getPlaygroundMarkerPath();
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
  return path.join(os.homedir(), ".awb", "markers");
}

/**
 * Get the path to the idle markers directory.
 */
export function getIdleMarkersDir(): string {
  return path.join(getMarkersDir(), "idle");
}

/**
 * Get the path to the ended markers directory.
 * Sessions with ended markers are immediately removed from playground.
 */
export function getEndedMarkersDir(): string {
  return path.join(getMarkersDir(), "ended");
}

/**
 * Check if a session has an ended marker (set by SessionEnd hook).
 */
export async function isSessionEnded(sessionId: string): Promise<boolean> {
  const markerPath = path.join(getEndedMarkersDir(), sessionId);
  try {
    await fsp.access(markerPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the timestamp stored in an idle marker for a session.
 * Supports both old plain text and new JSON format.
 */
export async function getIdleMarkerTimestamp(
  sessionId: string
): Promise<Date | null> {
  const markerPath = path.join(getIdleMarkersDir(), sessionId);
  try {
    const content = (await fsp.readFile(markerPath, "utf-8")).trim();
    if (!content) return null;

    // Try JSON format first
    if (content.startsWith("{")) {
      const data = JSON.parse(content) as { timestamp: string };
      const date = new Date(data.timestamp);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // Fallback: plain text timestamp
    const date = new Date(content);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Check if an agent is idle based on idle marker vs session modified time.
 * Uses a small grace period (2 seconds) to handle timing differences.
 */
export async function isAgentIdle(
  sessionId: string,
  sessionModified: string
): Promise<boolean> {
  const idleTimestamp = await getIdleMarkerTimestamp(sessionId);
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
export function getAgentStatus(
  _sessionId: string,
  projectPath: string
): "running" | "thinking" | "idle" {
  // Note: _sessionId is kept for API consistency and potential future use
  const sessionName = pathToSessionName(projectPath);
  const { state } = getAgentState(sessionName);

  // Map AgentState to status
  if (state === "working") return "running";
  if (state === "thinking") return "thinking";
  return "idle";
}

/**
 * Write or update idle marker for a session.
 * Used by awb run to keep session visible while waiting for user input.
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
 * e.g., "/Users/burakemre/Code/agent-workbench" -> "agent-workbench"
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
export async function getPlanFileForSession(
  sessionId: string,
  projectPath: string
): Promise<string | undefined> {
  const encoded = pathToSessionName(projectPath);
  const jsonlPath = path.join(
    getClaudeProjectsDir(),
    encoded,
    `${sessionId}.jsonl`
  );

  try {
    const content = await fsp.readFile(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");

    // Pattern to match plan file paths: ~/.claude/plans/*.md or .claude/plans/*.md
    const homeDir = os.homedir();
    const absolutePlanDir = path.join(homeDir, ".claude", "plans");

    let latestPlanFile: string | undefined;
    let latestTimestamp = 0;

    // Two patterns: absolute path and relative path (.claude/plans/...)
    const absolutePattern = `${absolutePlanDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/\\\\][^"\\s]+\\.md`;
    const relativePattern = `\\.claude[/\\\\]plans[/\\\\][^"\\s]+\\.md`;
    const planFileRegex = new RegExp(
      `(${absolutePattern}|${relativePattern})`,
      "g"
    );

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        // Check various fields that might contain file paths
        // Claude stores file references in different ways depending on the context
        const searchText = JSON.stringify(event);

        // Look for plan file paths in the JSON
        const matches = searchText.match(planFileRegex);
        if (matches) {
          for (const rawMatch of matches) {
            // Skip matches containing literal \n (multiline noise from JSON)
            if (rawMatch.includes("\\n")) continue;

            // Normalize relative paths to absolute
            let match = rawMatch;
            if (match.startsWith(".claude")) {
              match = path.join(homeDir, match);
            }

            // Parse timestamp - could be ISO string or number
            let timestamp = latestTimestamp + 1;
            const rawTs = event.timestamp || event.ts;
            if (rawTs) {
              if (typeof rawTs === "number") {
                timestamp = rawTs;
              } else if (typeof rawTs === "string") {
                const parsed = new Date(rawTs).getTime();
                if (!Number.isNaN(parsed)) timestamp = parsed;
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
        // Only return if the file actually exists
        try {
          await fsp.access(normalizedPath);
          return normalizedPath;
        } catch {
          return undefined;
        }
      } catch {
        // Path is invalid, don't return it
        return undefined;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Convert a session name to project name.
 * e.g., "-Users-burakemre-Code-agent-workbench" -> "agent-workbench"
 */
export function sessionNameToProject(sessionName: string): string {
  // Convert session name back to path-like string, then use cwdToProject
  const asPath = sessionName.replace(/-/g, "/");
  return cwdToProject(asPath);
}

/**
 * Maximum length for tmux session names.
 * Keep it reasonable for display and CLI usage.
 */
const TMUX_SESSION_MAX_LENGTH = 50;

/**
 * Generate a short hash of a string (first 4 chars of hex).
 */
function shortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 4).padStart(4, "0");
}

/**
 * Generate a deterministic tmux session name from a path.
 * Format: awb-{path-segments}-{hash}
 *
 * Includes as many path segments as fit within max length,
 * starting from the end (most specific) of the path.
 *
 * @example
 * "/Users/bob/Code/ai-experiments/mcp-sidecar"
 * → "awb-Code-ai-experiments-mcp-sidecar-a3f2"
 */
export function pathToTmuxSession(cwd: string): string {
  const normalized = path.resolve(cwd);
  const hash = shortHash(normalized);
  const prefix = "awb-";
  const suffix = `-${hash}`;
  const reserved = prefix.length + suffix.length;
  const available = TMUX_SESSION_MAX_LENGTH - reserved;

  // Split path into segments, filter empty
  const segments = normalized.split(path.sep).filter(Boolean);

  // Build from end, include as many segments as fit
  const included: string[] = [];
  let length = 0;

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    const segmentLength = segment.length + (included.length > 0 ? 1 : 0); // +1 for separator

    if (length + segmentLength <= available) {
      included.unshift(segment);
      length += segmentLength;
    } else {
      break;
    }
  }

  // Join with dashes (tmux-safe)
  const pathPart = included.join("-");
  return `${prefix}${pathPart}${suffix}`;
}

/**
 * Get the tmux session name for the current environment.
 *
 * If running inside tmux ($TMUX is set), returns the current session name.
 * Otherwise, generates a deterministic session name from the cwd.
 */
export function getTmuxSessionName(cwd: string = process.cwd()): string | null {
  // Check if already in tmux
  if (process.env.TMUX) {
    try {
      const sessionName = execSync("tmux display-message -p '#S'", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (sessionName) {
        return sessionName;
      }
    } catch {
      // Failed to get tmux session, fall through to generate
    }
  }

  return pathToTmuxSession(cwd);
}

/**
 * Check if tmux is available on the system.
 */
export function isTmuxAvailable(): boolean {
  if (process.env.AWB_DISABLE_TMUX && process.env.AWB_DISABLE_TMUX !== "0") {
    return false;
  }
  try {
    execSync("tmux -V", { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a tmux session exists.
 */
export function tmuxSessionExists(sessionName: string): boolean {
  try {
    execSync(`tmux has-session -t ${sessionName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * List windows in a tmux session.
 */
export interface TmuxWindow {
  index: number;
  name: string;
  command: string;
  active: number; // timestamp
}

export function listTmuxWindows(sessionName: string): TmuxWindow[] {
  try {
    const output = execSync(
      `tmux list-windows -t ${sessionName} -F '#{window_index}|#{window_name}|#{pane_current_command}|#{window_activity}'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );

    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => {
        const [index, name, command, active] = line.split("|");
        return {
          index: Number.parseInt(index, 10),
          name,
          command,
          active: Number.parseInt(active, 10),
        };
      });
  } catch {
    return [];
  }
}

/**
 * List all tmux sessions that start with "awb-" prefix.
 * Returns session names.
 */
export function listAwbTmuxSessions(): string[] {
  if (!isTmuxAvailable()) {
    return [];
  }

  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((name: string) => name.startsWith("awb-"));
  } catch {
    return [];
  }
}
