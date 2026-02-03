import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CreatedEvent,
  type ResultEvent,
  clearEvents,
  countPendingMessages,
  findResultEvent,
  getAgentState,
  getPendingInteractions,
  getPendingMessages,
  readEvents,
  writeEvent,
} from "./events.js";
import { getEventsFilePath } from "./runtime.js";

function emitResultEvent(
  configDir: string,
  id: string,
  action: ResultEvent["action"],
  answers?: Record<string, string | string[]>
): void {
  const filePath = getEventsFilePath(configDir);
  const event = {
    ts: Date.now(),
    type: "result",
    id,
    action,
    ...(answers && { answers }),
  };
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
}

describe("events", () => {
  const runtimeRoot = path.join(os.tmpdir(), "awb-events-test");
  const sessionName = "test-session";
  const originalRuntimeDir = process.env.AWB_RUNTIME_DIR;

  beforeEach(() => {
    process.env.AWB_RUNTIME_DIR = runtimeRoot;
    const eventsFile = getEventsFilePath(sessionName);
    fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
    clearEvents(sessionName);
  });

  afterEach(() => {
    try {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    if (originalRuntimeDir === undefined) {
      process.env.AWB_RUNTIME_DIR = undefined;
    } else {
      process.env.AWB_RUNTIME_DIR = originalRuntimeDir;
    }
  });

  describe("findResultEvent", () => {
    it("should find result event by interaction id", () => {
      emitResultEvent(sessionName, "int-1", "accept", { a: "1" });
      emitResultEvent(sessionName, "int-2", "decline", { b: "2" });
      emitResultEvent(sessionName, "int-3", "cancel");

      const result = findResultEvent(sessionName, "int-2");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("int-2");
      expect(result?.action).toBe("decline");
    });

    it("should return most recent result for same id", () => {
      emitResultEvent(sessionName, "int-1", "cancel");
      emitResultEvent(sessionName, "int-1", "accept", { final: "yes" });

      const result = findResultEvent(sessionName, "int-1");
      expect(result?.action).toBe("accept");
      expect(result?.answers).toEqual({ final: "yes" });
    });

    it("should return null for non-existent id", () => {
      emitResultEvent(sessionName, "int-1", "accept");

      const result = findResultEvent(sessionName, "int-999");
      expect(result).toBeNull();
    });
  });

  describe("readEvents", () => {
    it("should read all events in order", () => {
      emitResultEvent(sessionName, "int-1", "accept");
      emitResultEvent(sessionName, "int-2", "decline");

      const events = readEvents(sessionName);
      expect(events).toHaveLength(2);
      expect((events[0] as ResultEvent).id).toBe("int-1");
      expect((events[1] as ResultEvent).id).toBe("int-2");
    });
  });

  describe("clearEvents", () => {
    it("should clear all events", () => {
      emitResultEvent(sessionName, "a", "accept");
      emitResultEvent(sessionName, "b", "decline");
      expect(readEvents(sessionName)).toHaveLength(2);

      clearEvents(sessionName);
      expect(readEvents(sessionName)).toHaveLength(0);
    });
  });

  describe("writeEvent", () => {
    it("should write a created event", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "test-1",
        component: "confirm",
        title: "Test confirm",
        prompt: "Are you sure?",
      });

      const events = readEvents(sessionName);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("created");
      expect((events[0] as CreatedEvent).id).toBe("test-1");
      expect((events[0] as CreatedEvent).component).toBe("confirm");
      expect((events[0] as CreatedEvent).title).toBe("Test confirm");
    });

    it("should write a result event", () => {
      writeEvent(sessionName, {
        type: "result",
        id: "test-1",
        action: "accept",
        answers: { choice: "yes" },
      });

      const events = readEvents(sessionName);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("result");
      expect((events[0] as ResultEvent).action).toBe("accept");
    });

    it("should add timestamp automatically", () => {
      const before = Date.now();
      writeEvent(sessionName, {
        type: "created",
        id: "test-ts",
        component: "select",
      });
      const after = Date.now();

      const events = readEvents(sessionName);
      expect(events[0].ts).toBeGreaterThanOrEqual(before);
      expect(events[0].ts).toBeLessThanOrEqual(after);
    });
  });

  describe("getPendingInteractions", () => {
    it("should return empty array when no events", () => {
      const pending = getPendingInteractions(sessionName);
      expect(pending).toEqual([]);
    });

    it("should return created events without results", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "int-1",
        component: "confirm",
        title: "Pending 1",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "int-2",
        component: "select",
        title: "Pending 2",
      });

      const pending = getPendingInteractions(sessionName);
      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe("int-1");
      expect(pending[1].id).toBe("int-2");
    });

    it("should exclude resolved interactions", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "int-1",
        component: "confirm",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "int-2",
        component: "select",
      });
      writeEvent(sessionName, {
        type: "result",
        id: "int-1",
        action: "accept",
      });

      const pending = getPendingInteractions(sessionName);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("int-2");
    });

    it("should handle all interactions resolved", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "int-1",
        component: "confirm",
      });
      writeEvent(sessionName, {
        type: "result",
        id: "int-1",
        action: "cancel",
      });

      const pending = getPendingInteractions(sessionName);
      expect(pending).toEqual([]);
    });
  });

  describe("getPendingMessages", () => {
    it("should return empty array when no messages", () => {
      const pending = getPendingMessages(sessionName);
      expect(pending).toEqual([]);
    });

    it("should return only message component events", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "msg-1",
        component: "message",
        args: { content: "Hello" },
      });
      writeEvent(sessionName, {
        type: "created",
        id: "int-1",
        component: "confirm",
      });

      const pending = getPendingMessages(sessionName);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("msg-1");
      expect(pending[0].component).toBe("message");
    });

    it("should exclude read messages", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "msg-1",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "msg-2",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "result",
        id: "msg-1",
        action: "accept",
      });

      const pending = getPendingMessages(sessionName);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("msg-2");
    });

    it("should sort messages by timestamp", () => {
      // Write messages with explicit timestamps via raw file access
      const filePath = getEventsFilePath(sessionName);
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: 3000,
          type: "created",
          id: "msg-3",
          component: "message",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: 1000,
          type: "created",
          id: "msg-1",
          component: "message",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: 2000,
          type: "created",
          id: "msg-2",
          component: "message",
        })}\n`
      );

      const pending = getPendingMessages(sessionName);
      expect(pending).toHaveLength(3);
      expect(pending[0].id).toBe("msg-1");
      expect(pending[1].id).toBe("msg-2");
      expect(pending[2].id).toBe("msg-3");
    });
  });

  describe("countPendingMessages", () => {
    it("should return 0 when no messages", () => {
      expect(countPendingMessages(sessionName)).toBe(0);
    });

    it("should count pending messages", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "msg-1",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "msg-2",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "msg-3",
        component: "message",
      });

      expect(countPendingMessages(sessionName)).toBe(3);
    });

    it("should not count read messages", () => {
      writeEvent(sessionName, {
        type: "created",
        id: "msg-1",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "created",
        id: "msg-2",
        component: "message",
      });
      writeEvent(sessionName, {
        type: "result",
        id: "msg-1",
        action: "accept",
      });

      expect(countPendingMessages(sessionName)).toBe(1);
    });
  });

  describe("readEvents edge cases", () => {
    it("should handle malformed JSON lines gracefully", () => {
      const filePath = getEventsFilePath(sessionName);
      fs.appendFileSync(
        filePath,
        '{"type":"result","id":"1","action":"accept"}\n'
      );
      fs.appendFileSync(filePath, "not valid json\n");
      fs.appendFileSync(
        filePath,
        '{"type":"result","id":"2","action":"decline"}\n'
      );

      const events = readEvents(sessionName);
      expect(events).toHaveLength(2);
      expect((events[0] as ResultEvent).id).toBe("1");
      expect((events[1] as ResultEvent).id).toBe("2");
    });

    it("should return empty array for non-existent session", () => {
      const events = readEvents("non-existent-session");
      expect(events).toEqual([]);
    });
  });

  describe("getAgentState", () => {
    it("should return idle when no events exist", () => {
      const { state, lastActivity } = getAgentState(sessionName);
      expect(state).toBe("idle");
      expect(lastActivity).toBe(0);
    });

    it("should return working when tool_start without tool_end", () => {
      writeEvent(sessionName, {
        type: "tool_start",
        sessionId: "test-session",
        tool: "Bash",
      });

      const { state } = getAgentState(sessionName);
      expect(state).toBe("working");
    });

    it("should return thinking when tool_end is recent (within grace period)", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      // Write tool_start and tool_end with recent timestamp
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 1000,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 500, // 500ms ago - within 3s grace period
          type: "tool_end",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );

      const { state } = getAgentState(sessionName);
      expect(state).toBe("thinking");
    });

    it("should return idle when tool_end is old (past grace period)", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      // Write tool_start and tool_end with old timestamp
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 10000,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 5000, // 5 seconds ago - past 3s grace period
          type: "tool_end",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );

      const { state } = getAgentState(sessionName);
      expect(state).toBe("idle");
    });

    it("should return thinking when stop event is recent after tool activity", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 2000,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Read",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 1500,
          type: "tool_end",
          sessionId: "test-session",
          tool: "Read",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 1000, // Stop 1s ago, after tool_end - within grace period
          type: "stop",
          sessionId: "test-session",
        })}\n`
      );

      const { state } = getAgentState(sessionName);
      expect(state).toBe("thinking");
    });

    it("should return idle when stop event is old", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 10000,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Read",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 9000,
          type: "tool_end",
          sessionId: "test-session",
          tool: "Read",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 8000, // Stop 8s ago - past grace period
          type: "stop",
          sessionId: "test-session",
        })}\n`
      );

      const { state } = getAgentState(sessionName);
      expect(state).toBe("idle");
    });

    it("should handle multiple tool cycles and return correct state", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      // First tool cycle (old)
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 10000,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 9000,
          type: "tool_end",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );

      // Second tool cycle (recent, still running)
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: now - 100,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Read",
        })}\n`
      );

      const { state } = getAgentState(sessionName);
      expect(state).toBe("working");
    });

    it("should track lastActivity correctly", () => {
      const now = Date.now();
      const filePath = getEventsFilePath(sessionName);

      const toolStartTs = now - 2000;
      const toolEndTs = now - 1000;

      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: toolStartTs,
          type: "tool_start",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );
      fs.appendFileSync(
        filePath,
        `${JSON.stringify({
          ts: toolEndTs,
          type: "tool_end",
          sessionId: "test-session",
          tool: "Bash",
        })}\n`
      );

      const { lastActivity } = getAgentState(sessionName);
      expect(lastActivity).toBe(toolEndTs);
    });
  });
});
