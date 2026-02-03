/**
 * Wait command handler - waits for an interaction result.
 */

import * as fs from "node:fs";
import { POLL_INTERVAL_MS } from "../constants.js";
import { getPendingMessages, markMessagesAsRead } from "../events.js";
import { getEventsFilePath, pathToSessionName } from "../runtime.js";

/**
 * Wait for an interaction result (blocking) or get all results (--all).
 */
export async function handleWait(args: string[]): Promise<void> {
  const hasAll = args.includes("--all");
  const id = args.find((arg) => !arg.startsWith("--"));

  if (!id && !hasAll) {
    console.error("Usage: awb wait <interaction-id>");
    console.error("       awb wait --all  (get all results)");
    process.exit(1);
  }

  const sessionName = pathToSessionName(process.cwd());
  const eventsFile = getEventsFilePath(sessionName);

  // --all mode: return all results immediately (non-blocking)
  if (hasAll) {
    try {
      if (fs.existsSync(eventsFile)) {
        const content = fs.readFileSync(eventsFile, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        const results: unknown[] = [];
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === "result") {
              results.push(event);
            }
          } catch {
            // Skip malformed lines
          }
        }
        console.log(JSON.stringify({ results }));
        process.exit(0);
      }
    } catch {
      // Ignore errors
    }
    console.log(JSON.stringify({ results: [] }));
    process.exit(0);
  }

  // Normal mode: poll forever until result is found
  while (true) {
    try {
      if (fs.existsSync(eventsFile)) {
        const content = fs.readFileSync(eventsFile, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const event = JSON.parse(lines[i]);
            if (event.type === "result" && event.id === id) {
              // Get pending messages and include them in the response
              const pendingMessages = getPendingMessages(sessionName);
              const messages = pendingMessages.map((m) => ({
                id: m.id,
                text: (m.args as { text?: string })?.text || "",
                ts: m.ts,
                agentSessionId: m.agentSessionId,
              }));

              // Mark messages as read
              markMessagesAsRead(sessionName, pendingMessages);

              // Output result with messages
              const output = {
                ...event,
                messages: messages.length > 0 ? messages : undefined,
              };
              console.log(JSON.stringify(output));
              process.exit(0);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Ignore read errors, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
