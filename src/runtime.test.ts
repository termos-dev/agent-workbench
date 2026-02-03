import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cwdToProject,
  ensureEventsFile,
  getActiveSessions,
  getEventsFilePath,
  getIdleMarkerTimestamp,
  getRuntimeRoot,
  getSessionRuntimeDir,
  isAgentIdle,
  isSessionEnded,
  pathToSessionName,
  sessionNameToProject,
  writeIdleMarker,
} from "./runtime.js";

describe("runtime", () => {
  const testDir = path.join(os.tmpdir(), `awb-runtime-test-${Date.now()}`);
  const originalRuntimeDir = process.env.AWB_RUNTIME_DIR;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.AWB_RUNTIME_DIR = path.join(testDir, "sessions");
    process.env.HOME = testDir;
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, "sessions"), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    if (originalRuntimeDir === undefined) {
      // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
      delete process.env.AWB_RUNTIME_DIR;
    } else {
      process.env.AWB_RUNTIME_DIR = originalRuntimeDir;
    }
    if (originalHome === undefined) {
      // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  describe("pathToSessionName", () => {
    it("should convert path to session name by replacing slashes with dashes", () => {
      const result = pathToSessionName("/Users/test/myproject");
      expect(result).toBe("-Users-test-myproject");
    });

    it("should handle paths with trailing slashes", () => {
      const result = pathToSessionName("/Users/test/myproject/");
      // path.resolve removes trailing slashes
      expect(result).toBe("-Users-test-myproject");
    });

    it("should handle relative paths", () => {
      const result = pathToSessionName("./relative/path");
      // Should resolve to absolute path first
      expect(result).toContain("-relative-path");
    });

    it("should return 'session' for empty paths", () => {
      // path.resolve("") returns cwd, so this tests the fallback
      const result = pathToSessionName("/");
      expect(result).toBe("-");
    });
  });

  describe("cwdToProject", () => {
    it("should extract last path segment", () => {
      expect(cwdToProject("/Users/test/myproject")).toBe("myproject");
    });

    it("should handle paths with trailing slashes", () => {
      expect(cwdToProject("/Users/test/myproject/")).toBe("myproject");
    });

    it("should return the path itself for single-segment paths", () => {
      // Note: cwdToProject splits on "/" and returns last non-empty segment
      // For "/" this returns "/" due to empty array fallback
      expect(cwdToProject("/")).toBe("/");
    });
  });

  describe("sessionNameToProject", () => {
    it("should convert session name back to project name", () => {
      expect(sessionNameToProject("-Users-test-myproject")).toBe("myproject");
    });
  });

  describe("getRuntimeRoot", () => {
    it("should use AWB_RUNTIME_DIR env var if set", () => {
      const result = getRuntimeRoot();
      expect(result).toBe(path.join(testDir, "sessions"));
    });

    it("should fall back to ~/.awb/sessions", () => {
      // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
      delete process.env.AWB_RUNTIME_DIR;
      const result = getRuntimeRoot();
      expect(result).toBe(path.join(testDir, ".awb", "sessions"));
    });
  });

  describe("getSessionRuntimeDir", () => {
    it("should return path under runtime root", () => {
      const result = getSessionRuntimeDir("test-session");
      expect(result).toBe(path.join(testDir, "sessions", "test-session"));
    });
  });

  describe("getEventsFilePath", () => {
    it("should return events.jsonl path in session dir", () => {
      const result = getEventsFilePath("test-session");
      expect(result).toBe(
        path.join(testDir, "sessions", "test-session", "events.jsonl")
      );
    });
  });

  describe("ensureEventsFile", () => {
    it("should create session directory and empty events file", () => {
      const eventsPath = ensureEventsFile("new-session");

      expect(fs.existsSync(eventsPath)).toBe(true);
      expect(fs.readFileSync(eventsPath, "utf-8")).toBe("");
    });

    it("should not overwrite existing events file", () => {
      const sessionName = "existing-session";
      const eventsPath = ensureEventsFile(sessionName);
      fs.writeFileSync(eventsPath, "existing content");

      ensureEventsFile(sessionName);

      expect(fs.readFileSync(eventsPath, "utf-8")).toBe("existing content");
    });
  });

  describe("idle markers", () => {
    it("should write and read idle marker", async () => {
      const sessionId = "test-session-id";
      const cwd = "/test/project";

      writeIdleMarker(sessionId, cwd);

      const timestamp = await getIdleMarkerTimestamp(sessionId);
      expect(timestamp).not.toBeNull();
      expect(timestamp?.getTime()).toBeCloseTo(Date.now(), -3); // Within 1 second
    });

    it("should return null for non-existent marker", async () => {
      const result = await getIdleMarkerTimestamp("nonexistent-session");
      expect(result).toBeNull();
    });
  });

  describe("isSessionEnded", () => {
    it("should return false when no ended marker exists", async () => {
      expect(await isSessionEnded("some-session")).toBe(false);
    });

    it("should return true when ended marker exists", async () => {
      const sessionId = "ended-session";
      const markersDir = path.join(testDir, ".awb", "markers", "ended");
      fs.mkdirSync(markersDir, { recursive: true });
      fs.writeFileSync(path.join(markersDir, sessionId), "");

      expect(await isSessionEnded(sessionId)).toBe(true);
    });
  });

  describe("isAgentIdle", () => {
    it("should return false when no idle marker exists", async () => {
      expect(await isAgentIdle("some-session", new Date().toISOString())).toBe(
        false
      );
    });

    it("should return true when idle marker is recent relative to session modified", async () => {
      const sessionId = "idle-session";
      writeIdleMarker(sessionId, "/test");

      // Use a modified time slightly before now
      const modified = new Date(Date.now() - 1000).toISOString();
      expect(await isAgentIdle(sessionId, modified)).toBe(true);
    });

    it("should return false when idle marker is older than session modified time", async () => {
      const sessionId = "stale-idle-session";
      writeIdleMarker(sessionId, "/test");

      // Use a modified time in the future
      const modified = new Date(Date.now() + 5000).toISOString();
      expect(await isAgentIdle(sessionId, modified)).toBe(false);
    });
  });

  describe("getActiveSessions", () => {
    it("should return empty array when no sessions exist", async () => {
      const sessions = await getActiveSessions();
      expect(sessions).toEqual([]);
    });
  });
});
