/**
 * Set-title command handler - sets a title for the current session.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentSessionId } from "../session-utils.js";

/**
 * Get the parent process ID (the Claude process).
 */
function getParentPid(): number | null {
  try {
    const ppid = process.ppid;
    return ppid || null;
  } catch {
    return null;
  }
}

/**
 * Set a title for the current session.
 */
export function handleSetTitle(args: string[]): void {
  const title = args.join(" ").trim();

  if (!title) {
    console.error("Usage: awb set-title <title>");
    process.exit(1);
  }

  // Get the current session ID
  const sessionId = getAgentSessionId();
  if (!sessionId) {
    console.error(
      "Could not detect current session. Make sure you're running within a Claude session."
    );
    process.exit(1);
  }

  // Get parent PID (Claude process)
  const ppid = getParentPid();

  // Save title to cache by sessionId
  const titlesDir = path.join(process.env.HOME || "", ".awb", "titles");
  fs.mkdirSync(titlesDir, { recursive: true });
  fs.writeFileSync(path.join(titlesDir, sessionId), title);

  // Also save title by PID for easy lookup
  if (ppid) {
    const pidTitlesDir = path.join(
      process.env.HOME || "",
      ".awb",
      "pid-titles"
    );
    fs.mkdirSync(pidTitlesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pidTitlesDir, String(ppid)),
      JSON.stringify({ title, sessionId, ts: Date.now() })
    );
  }

  console.log(JSON.stringify({ sessionId, ppid, title, status: "set" }));
}
