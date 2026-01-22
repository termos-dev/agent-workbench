/**
 * Session detection utilities.
 *
 * These functions help detect the current Claude session ID from various sources.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ACTIVE_MARKER_STALE_MS } from "./constants.js";

/**
 * Read active session marker written by PreToolUse hook.
 * This is the fastest way to detect the current session.
 */
export function readActiveSessionMarker(): string | undefined {
  try {
    const cwd = process.cwd();
    const encodedPath = cwd.replace(/[/\\]/g, "-");
    const markerPath = path.join(
      process.env.HOME || "",
      ".termos",
      "markers",
      "active",
      encodedPath
    );

    if (!fs.existsSync(markerPath)) return undefined;

    // Check if marker is recent (within staleness threshold)
    const stat = fs.statSync(markerPath);
    const age = Date.now() - stat.mtimeMs;
    if (age > ACTIVE_MARKER_STALE_MS) return undefined; // Stale marker

    return fs.readFileSync(markerPath, "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Detect Claude session ID from session files (fallback).
 * Uses Claude's sessions-index.json to find the most recently modified session.
 */
export function detectClaudeSessionId(): string | undefined {
  try {
    const cwd = process.cwd();
    const encodedPath = cwd.replace(/[/\\]/g, "-");
    const indexPath = path.join(
      process.env.HOME || "",
      ".claude",
      "projects",
      encodedPath,
      "sessions-index.json"
    );

    if (!fs.existsSync(indexPath)) return undefined;

    const content = fs.readFileSync(indexPath, "utf-8");
    const index = JSON.parse(content) as {
      entries: Array<{ sessionId: string; modified: string }>;
    };

    if (!index.entries?.length) return undefined;

    // Find most recently modified session
    const sorted = [...index.entries].sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    return sorted[0]?.sessionId;
  } catch {
    return undefined;
  }
}

/**
 * Get the Claude session ID - tries multiple sources.
 *
 * Priority:
 * 1. TERMOS_SESSION_ID environment variable
 * 2. Active session marker (set by PreToolUse hook)
 * 3. Claude's sessions-index.json (fallback)
 */
export function getAgentSessionId(): string | undefined {
  // 1. Check our own env var
  if (process.env.TERMOS_SESSION_ID) {
    return process.env.TERMOS_SESSION_ID;
  }

  // 2. Read from active session marker (set by PreToolUse hook)
  const activeSessionId = readActiveSessionMarker();
  if (activeSessionId) {
    return activeSessionId;
  }

  // 3. Fallback: detect from Claude's session files
  return detectClaudeSessionId();
}
