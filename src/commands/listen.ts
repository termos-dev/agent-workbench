/**
 * Listen command handler - listens for pending messages.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { POLL_INTERVAL_MS } from "../constants.js";
import {
  countPendingMessages,
  getPendingMessages,
  markMessagesAsRead,
} from "../events.js";
import { getSessionRuntimeDir, pathToSessionName } from "../runtime.js";

/**
 * Listen for pending messages (blocking) or get count (non-blocking).
 */
export async function handleListen(args: string[]): Promise<void> {
  const hasCount = args.includes("--count");
  const sessionName = pathToSessionName(process.cwd());

  if (hasCount) {
    // Non-blocking: just output count
    const count = countPendingMessages(sessionName);
    console.log(count);
    return;
  }

  // Blocking mode: acquire lock and poll until message arrives
  const sessionDir = getSessionRuntimeDir(sessionName);
  const lockFile = path.join(sessionDir, "listen.lock");

  // Ensure session directory exists
  fs.mkdirSync(sessionDir, { recursive: true });

  // Try to acquire lock
  try {
    if (fs.existsSync(lockFile)) {
      const pid = Number.parseInt(fs.readFileSync(lockFile, "utf-8").trim());
      try {
        process.kill(pid, 0); // Check if process exists
        console.error(`Another listener is active (pid ${pid})`);
        process.exit(1);
      } catch {
        // Process dead, stale lock - remove it
        fs.unlinkSync(lockFile);
      }
    }

    // Write our PID
    fs.writeFileSync(lockFile, String(process.pid));
  } catch (err) {
    console.error("Failed to acquire lock:", err);
    process.exit(1);
  }

  // Cleanup on exit
  const cleanup = () => {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // Poll until message arrives
  while (true) {
    try {
      const messages = getPendingMessages(sessionName);

      if (messages.length > 0) {
        // Mark as read
        markMessagesAsRead(sessionName, messages);

        // Output for Claude to see
        for (const msg of messages) {
          const text = (msg.args as { text?: string })?.text || msg.title;
          console.log(`[Playground Message] ${text}`);
        }
        cleanup();
        return;
      }
    } catch {
      // Ignore transient errors, keep polling
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
