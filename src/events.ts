import * as fs from "fs";
import { getEventsFilePath } from "./runtime.js";
import { THINKING_GRACE_PERIOD_MS } from "./constants.js";

/**
 * Component types supported by termos
 */
export type ComponentType =
  | "confirm" | "select" | "checklist" | "ask" | "card"  // Interactive
  | "code" | "diff" | "markdown" | "mermaid"    // Display
  | "table" | "tree" | "json" | "chart" | "gauge" | "progress"  // Data display
  | "output" | "editor"  // Command output and file editor
  | "message";  // User message to agent

/**
 * Event types for the termos events file
 */
type TermosEventType = "created" | "result" | "tool_start" | "tool_end" | "stop";

export interface TermosEventBase {
  ts: number;
  type: TermosEventType;
}

/**
 * Event emitted when a component is created
 */
export interface CreatedEvent extends TermosEventBase {
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

export interface ResultEvent extends TermosEventBase {
  type: "result";
  id: string;
  action: "accept" | "decline" | "cancel" | "timeout";
  answers?: Record<string, string | string[]>;
  result?: unknown;
  feedback?: string;  // User feedback text for display components
}

/**
 * Event emitted when a tool starts executing
 */
export interface ToolStartEvent extends TermosEventBase {
  type: "tool_start";
  sessionId: string;
  tool?: string;
}

/**
 * Event emitted when a tool finishes executing
 */
export interface ToolEndEvent extends TermosEventBase {
  type: "tool_end";
  sessionId: string;
  tool?: string;
}

/**
 * Event emitted when agent yields control (Stop hook)
 */
export interface StopEvent extends TermosEventBase {
  type: "stop";
  sessionId: string;
}

export type TermosEvent = CreatedEvent | ResultEvent | ToolStartEvent | ToolEndEvent | StopEvent;

/**
 * Agent state based on event stream analysis
 */
export type AgentState = 'working' | 'thinking' | 'idle';

/**
 * Get the current state of an agent based on event stream analysis.
 *
 * State machine:
 * - working: Tool is currently executing (tool_start without tool_end)
 * - thinking: Tool just finished, waiting to see if more tools follow (grace period)
 * - idle: Agent has stopped and grace period has passed
 */
export function getAgentState(sessionName: string): { state: AgentState; lastActivity: number } {
  const events = readEvents(sessionName);

  let lastToolStart: number | null = null;
  let lastToolEnd: number | null = null;
  let lastStop: number | null = null;

  // Track tool execution state per session
  const toolStack: number[] = [];  // Timestamps of unfinished tool_start events

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
  const lastActivity = Math.max(lastToolStart || 0, lastToolEnd || 0, lastStop || 0);

  // If tools are still running, we're working
  if (toolStack.length > 0) {
    return { state: 'working', lastActivity };
  }

  // If we have a tool_end but no stop (or stop is older), we're potentially thinking
  if (lastToolEnd && (!lastStop || lastToolEnd > lastStop)) {
    const timeSinceToolEnd = now - lastToolEnd;
    if (timeSinceToolEnd < THINKING_GRACE_PERIOD_MS) {
      return { state: 'thinking', lastActivity };
    }
  }

  // If we have a stop event, check grace period
  if (lastStop) {
    const timeSinceStop = now - lastStop;
    // If stop happened recently after tool activity, might be thinking
    if (lastToolEnd && lastStop >= lastToolEnd && timeSinceStop < THINKING_GRACE_PERIOD_MS) {
      return { state: 'thinking', lastActivity };
    }
    return { state: 'idle', lastActivity };
  }

  // No events = idle
  return { state: 'idle', lastActivity: 0 };
}
/** Read all events from the events file */
export function readEvents(sessionName: string): TermosEvent[] {
  const filePath = getEventsFilePath(sessionName);
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return content.trim().split("\n").filter(Boolean).map(line => {
      try { return JSON.parse(line) as TermosEvent; }
      catch { return null; }
    }).filter((e): e is TermosEvent => e !== null);
  } catch {
    return [];
  }
}

/** Find the most recent result event for an interaction ID */
export function findResultEvent(sessionName: string, interactionId: string): ResultEvent | null {
  const events = readEvents(sessionName);
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "result" && event.id === interactionId) return event;
  }
  return null;
}

/** Clear the events file */
export function clearEvents(sessionName: string): void {
  try {
    fs.writeFileSync(getEventsFilePath(sessionName), "", { flag: "w" });
  } catch {
    // Ignore
  }
}

/** Write an event to the events file */
export function writeEvent(
  sessionName: string,
  event: Omit<CreatedEvent, "ts"> | Omit<ResultEvent, "ts"> | Omit<ToolStartEvent, "ts"> | Omit<ToolEndEvent, "ts"> | Omit<StopEvent, "ts">
): void {
  const filePath = getEventsFilePath(sessionName);
  const eventWithTs = { ...event, ts: Date.now() };
  try {
    fs.appendFileSync(filePath, JSON.stringify(eventWithTs) + "\n");
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
export function markMessagesAsRead(sessionName: string, messages: CreatedEvent[]): void {
  const eventsFile = getEventsFilePath(sessionName);
  for (const msg of messages) {
    fs.appendFileSync(
      eventsFile,
      JSON.stringify({
        type: "result",
        id: msg.id,
        action: "accept",
        ts: Date.now(),
      }) + "\n"
    );
  }
}
