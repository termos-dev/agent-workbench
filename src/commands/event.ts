/**
 * Event command handler - writes tool events for agent state tracking.
 */

import { writeEvent } from "../events.js";
import { ensureEventsFile, pathToSessionName } from "../runtime.js";
import { getAgentSessionId } from "../session-utils.js";

/**
 * Write a tool event for the current session.
 * Used by hooks to track tool execution state.
 */
export function handleEvent(args: string[]): void {
  const eventType = args[0];
  const tool = args[1];

  if (!eventType || !["tool_start", "tool_end", "stop"].includes(eventType)) {
    console.error("Usage: awb event <tool_start|tool_end|stop> [tool_name]");
    process.exit(1);
  }

  // Get the current session ID
  const sessionId = getAgentSessionId();
  if (!sessionId) {
    // Silently exit - hooks may run outside of sessions
    process.exit(0);
  }

  // Get session name from CWD
  const cwd = process.cwd();
  const sessionName = pathToSessionName(cwd);

  // Ensure events file exists
  ensureEventsFile(sessionName);

  // Write the event
  if (eventType === "tool_start") {
    writeEvent(sessionName, { type: "tool_start", sessionId, tool });
  } else if (eventType === "tool_end") {
    writeEvent(sessionName, { type: "tool_end", sessionId, tool });
  } else if (eventType === "stop") {
    writeEvent(sessionName, { type: "stop", sessionId });
  }
}
