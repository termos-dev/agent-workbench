import * as fs from "node:fs";
import { THINKING_GRACE_PERIOD_MS } from "./constants.js";
import { getEventsFilePath } from "./runtime.js";

/**
 * Cache entry for parsed events file.
 * Supports incremental parsing by tracking file offset.
 */
interface EventsCacheEntry {
  mtime: number;
  size: number;
  ino: number;
  birthtime: number;
  offset: number; // Byte offset of last read position
  events: WorkbenchEvent[];
}

/**
 * In-memory cache for parsed events files.
 * Key: sessionName, Value: cached events and file metadata
 */
const eventsCache = new Map<string, EventsCacheEntry>();

/**
 * Maximum number of events to cache per session.
 * Older events are dropped when this limit is exceeded.
 */
const MAX_CACHED_EVENTS = 10000;

/**
 * Parse JSONL content into WorkbenchEvent array.
 * Handles malformed lines gracefully.
 */
function parseJsonlContent(content: string): WorkbenchEvent[] {
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as WorkbenchEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is WorkbenchEvent => e !== null);
}

/**
 * Clear the events cache for a specific session or all sessions.
 */
export function clearEventsCache(sessionName?: string): void {
  if (sessionName) {
    eventsCache.delete(sessionName);
  } else {
    eventsCache.clear();
  }
}

/**
 * Component types supported by awb
 */
export type ComponentType =
  | "confirm"
  | "select"
  | "checklist"
  | "ask"
  | "card" // Interactive
  | "code"
  | "diff"
  | "markdown"
  | "mermaid" // Display
  | "table"
  | "tree"
  | "json"
  | "chart"
  | "gauge"
  | "progress" // Data display
  | "editor" // File editor
  | "message" // User message to agent
  | "html"; // Claude-generated HTML with web components

/**
 * Event types for the awb events file
 */
type WorkbenchEventType =
  | "created"
  | "result"
  | "tool_start"
  | "tool_end"
  | "stop";

export interface WorkbenchEventBase {
  ts: number;
  type: WorkbenchEventType;
}

/**
 * Event emitted when a component is created
 */
export interface CreatedEvent extends WorkbenchEventBase {
  type: "created";
  id: string;
  component: ComponentType;
  title?: string;
  // Interactive component fields
  prompt?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
  // Display component fields
  args?: Record<string, unknown>;
  // Agent tracking
  agentSessionId?: string; // Claude session ID that created this interaction
  project?: string; // Project name (last segment of cwd path)
}

export interface ResultEvent extends WorkbenchEventBase {
  type: "result";
  id: string;
  action: "accept" | "decline" | "cancel" | "timeout";
  answers?: Record<string, string | string[]>;
  result?: unknown;
  feedback?: string; // User feedback text for display components
}

/**
 * Event emitted when a tool starts executing
 */
export interface ToolStartEvent extends WorkbenchEventBase {
  type: "tool_start";
  sessionId: string;
  tool?: string;
}

/**
 * Event emitted when a tool finishes executing
 */
export interface ToolEndEvent extends WorkbenchEventBase {
  type: "tool_end";
  sessionId: string;
  tool?: string;
}

/**
 * Event emitted when agent yields control (Stop hook)
 */
export interface StopEvent extends WorkbenchEventBase {
  type: "stop";
  sessionId: string;
}

export type WorkbenchEvent =
  | CreatedEvent
  | ResultEvent
  | ToolStartEvent
  | ToolEndEvent
  | StopEvent;

/**
 * Agent state based on event stream analysis
 */
export type AgentState = "working" | "thinking" | "idle";

/**
 * Get the current state of an agent based on event stream analysis.
 *
 * State machine:
 * - working: Tool is currently executing (tool_start without tool_end)
 * - thinking: Tool just finished, waiting to see if more tools follow (grace period)
 * - idle: Agent has stopped and grace period has passed
 */
export function getAgentState(sessionName: string): {
  state: AgentState;
  lastActivity: number;
} {
  const events = readEvents(sessionName);

  let lastToolStart: number | null = null;
  let lastToolEnd: number | null = null;
  let lastStop: number | null = null;

  // Track tool execution state per session
  const toolStack: number[] = []; // Timestamps of unfinished tool_start events

  // Scan events to build state
  for (const event of events) {
    if (event.type === "tool_start") {
      toolStack.push(event.ts);
      lastToolStart = event.ts;
    } else if (event.type === "tool_end") {
      toolStack.pop();
      lastToolEnd = event.ts;
    } else if (event.type === "stop") {
      lastStop = event.ts;
    }
  }

  const now = Date.now();
  const lastActivity = Math.max(
    lastToolStart || 0,
    lastToolEnd || 0,
    lastStop || 0
  );

  // If tools are still running, we're working
  if (toolStack.length > 0) {
    return { state: "working", lastActivity };
  }

  // If we have a tool_end but no stop (or stop is older), we're potentially thinking
  if (lastToolEnd && (!lastStop || lastToolEnd > lastStop)) {
    const timeSinceToolEnd = now - lastToolEnd;
    if (timeSinceToolEnd < THINKING_GRACE_PERIOD_MS) {
      return { state: "thinking", lastActivity };
    }
  }

  // If we have a stop event, check grace period
  if (lastStop) {
    const timeSinceStop = now - lastStop;
    // If stop happened recently after tool activity, might be thinking
    if (
      lastToolEnd &&
      lastStop >= lastToolEnd &&
      timeSinceStop < THINKING_GRACE_PERIOD_MS
    ) {
      return { state: "thinking", lastActivity };
    }
    return { state: "idle", lastActivity };
  }

  // No events = idle
  return { state: "idle", lastActivity: 0 };
}
/**
 * Read all events from the events file with caching and incremental parsing.
 * - Uses mtime/size to detect file changes
 * - Performs incremental reads for append-only updates
 * - Handles file truncation/rotation by resetting cache
 */
export function readEvents(sessionName: string): WorkbenchEvent[] {
  const filePath = getEventsFilePath(sessionName);
  try {
    if (!fs.existsSync(filePath)) {
      eventsCache.delete(sessionName);
      return [];
    }

    const stat = fs.statSync(filePath);
    const cached = eventsCache.get(sessionName);
    const fileIdentityChanged =
      cached &&
      (stat.ino !== cached.ino || stat.birthtimeMs !== cached.birthtime);

    // Case 1: Cache hit with no file changes
    if (
      cached &&
      !fileIdentityChanged &&
      stat.size === cached.size &&
      stat.mtimeMs === cached.mtime
    ) {
      // Return a shallow copy to prevent accidental cache mutation
      return [...cached.events];
    }

    // Case 2: File grew (append-only) - incremental read
    if (
      cached &&
      !fileIdentityChanged &&
      stat.size > cached.size &&
      stat.mtimeMs >= cached.mtime
    ) {
      // Read only the new bytes from the last offset
      const fd = fs.openSync(filePath, "r");
      try {
        const newBytes = stat.size - cached.offset;
        const buffer = Buffer.alloc(newBytes);
        fs.readSync(fd, buffer, 0, newBytes, cached.offset);
        const newContent = buffer.toString("utf-8");

        // Parse new events and append to cache
        const newEvents = parseJsonlContent(newContent);
        cached.events.push(...newEvents);

        // Enforce max cache size - drop oldest events if needed
        if (cached.events.length > MAX_CACHED_EVENTS) {
          const excess = cached.events.length - MAX_CACHED_EVENTS;
          cached.events.splice(0, excess);
        }

        cached.mtime = stat.mtimeMs;
        cached.size = stat.size;
        cached.offset = stat.size;

        // Return a shallow copy to prevent accidental cache mutation
        return [...cached.events];
      } finally {
        fs.closeSync(fd);
      }
    }

    // Case 3: File shrunk (truncated/rotated) or new file - full re-read
    const content = fs.readFileSync(filePath, "utf-8");
    let events = parseJsonlContent(content);

    // Enforce max cache size - keep only recent events
    if (events.length > MAX_CACHED_EVENTS) {
      events = events.slice(-MAX_CACHED_EVENTS);
    }

    eventsCache.set(sessionName, {
      mtime: stat.mtimeMs,
      size: stat.size,
      ino: stat.ino,
      birthtime: stat.birthtimeMs,
      offset: stat.size,
      events,
    });

    // Return a shallow copy to prevent accidental cache mutation
    return [...events];
  } catch {
    eventsCache.delete(sessionName);
    return [];
  }
}

/** Find the most recent result event for an interaction ID */
export function findResultEvent(
  sessionName: string,
  interactionId: string
): ResultEvent | null {
  const events = readEvents(sessionName);
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "result" && event.id === interactionId) return event;
  }
  return null;
}

/** Clear the events file and its cache */
export function clearEvents(sessionName: string): void {
  try {
    // Clear the cache first
    eventsCache.delete(sessionName);
    fs.writeFileSync(getEventsFilePath(sessionName), "", { flag: "w" });
  } catch {
    // Ignore
  }
}

/** Write an event to the events file */
export function writeEvent(
  sessionName: string,
  event:
    | Omit<CreatedEvent, "ts">
    | Omit<ResultEvent, "ts">
    | Omit<ToolStartEvent, "ts">
    | Omit<ToolEndEvent, "ts">
    | Omit<StopEvent, "ts">
): void {
  const filePath = getEventsFilePath(sessionName);
  const eventWithTs = { ...event, ts: Date.now() };
  try {
    fs.appendFileSync(filePath, `${JSON.stringify(eventWithTs)}\n`);
  } catch {
    // Ignore
  }
}

/** Get all pending interactions for a session */
export function getPendingInteractions(sessionName: string): CreatedEvent[] {
  const events = readEvents(sessionName);
  const created = new Map<string, CreatedEvent>();
  const resolved = new Set<string>();

  // Build map of created events and track resolved ones
  for (const event of events) {
    if (event.type === "created") {
      created.set(event.id, event);
    } else if (event.type === "result") {
      resolved.add(event.id);
    }
  }

  // Return created events that haven't been resolved
  const pending: CreatedEvent[] = [];
  for (const [id, event] of created) {
    if (!resolved.has(id)) {
      pending.push(event);
    }
  }

  return pending;
}

/** Get pending messages for a session (messages that haven't been marked as read) */
export function getPendingMessages(sessionName: string): CreatedEvent[] {
  const events = readEvents(sessionName);
  const messages = new Map<string, CreatedEvent>();
  const read = new Set<string>();

  // Build map of message events and track which have been read (have a result)
  for (const event of events) {
    if (event.type === "created" && event.component === "message") {
      messages.set(event.id, event);
    } else if (event.type === "result") {
      read.add(event.id);
    }
  }

  // Return message events that haven't been read, sorted by timestamp
  const pending: CreatedEvent[] = [];
  for (const [id, event] of messages) {
    if (!read.has(id)) {
      pending.push(event);
    }
  }

  return pending.sort((a, b) => a.ts - b.ts);
}

/** Count pending messages for a session */
export function countPendingMessages(sessionName: string): number {
  return getPendingMessages(sessionName).length;
}

/** Mark messages as read by writing result events */
export function markMessagesAsRead(
  sessionName: string,
  messages: CreatedEvent[]
): void {
  const eventsFile = getEventsFilePath(sessionName);
  for (const msg of messages) {
    fs.appendFileSync(
      eventsFile,
      `${JSON.stringify({
        type: "result",
        id: msg.id,
        action: "accept",
        ts: Date.now(),
      })}\n`
    );
  }
}
