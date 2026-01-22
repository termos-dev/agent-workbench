import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectClaudeSessionId,
  getAgentSessionId,
  readActiveSessionMarker,
} from "./session-utils.js";

describe("session-utils", () => {
  const testDir = path.join(os.tmpdir(), `termos-session-test-${Date.now()}`);
  const originalHome = process.env.HOME;
  const originalSessionId = process.env.TERMOS_SESSION_ID;

  beforeEach(() => {
    process.env.HOME = testDir;
    // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
    delete process.env.TERMOS_SESSION_ID;
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    if (originalHome === undefined) {
      // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalSessionId === undefined) {
      // biome-ignore lint/performance/noDelete: delete is required for process.env to actually unset the variable
      delete process.env.TERMOS_SESSION_ID;
    } else {
      process.env.TERMOS_SESSION_ID = originalSessionId;
    }
  });

  describe("readActiveSessionMarker", () => {
    it("should return undefined when marker does not exist", () => {
      const result = readActiveSessionMarker();
      expect(result).toBeUndefined();
    });

    it("should return undefined for stale markers (older than 5 seconds)", async () => {
      const cwd = process.cwd();
      const encodedPath = cwd.replace(/[/\\]/g, "-");
      const markerDir = path.join(testDir, ".termos", "markers", "active");
      const markerPath = path.join(markerDir, encodedPath);

      fs.mkdirSync(markerDir, { recursive: true });
      fs.writeFileSync(markerPath, "test-session-id");

      // Set mtime to 10 seconds ago
      const oldTime = new Date(Date.now() - 10000);
      fs.utimesSync(markerPath, oldTime, oldTime);

      const result = readActiveSessionMarker();
      expect(result).toBeUndefined();
    });

    it("should return session ID for fresh markers", () => {
      const cwd = process.cwd();
      const encodedPath = cwd.replace(/[/\\]/g, "-");
      const markerDir = path.join(testDir, ".termos", "markers", "active");
      const markerPath = path.join(markerDir, encodedPath);

      fs.mkdirSync(markerDir, { recursive: true });
      fs.writeFileSync(markerPath, "fresh-session-id");

      const result = readActiveSessionMarker();
      expect(result).toBe("fresh-session-id");
    });
  });

  describe("detectClaudeSessionId", () => {
    it("should return undefined when sessions-index.json does not exist", () => {
      const result = detectClaudeSessionId();
      expect(result).toBeUndefined();
    });

    it("should return the most recently modified session", () => {
      const cwd = process.cwd();
      const encodedPath = cwd.replace(/[/\\]/g, "-");
      const projectDir = path.join(testDir, ".claude", "projects", encodedPath);
      const indexPath = path.join(projectDir, "sessions-index.json");

      fs.mkdirSync(projectDir, { recursive: true });

      const now = new Date();
      const older = new Date(Date.now() - 60000);

      fs.writeFileSync(
        indexPath,
        JSON.stringify({
          entries: [
            { sessionId: "old-session", modified: older.toISOString() },
            { sessionId: "new-session", modified: now.toISOString() },
          ],
        })
      );

      const result = detectClaudeSessionId();
      expect(result).toBe("new-session");
    });

    it("should return undefined for empty entries", () => {
      const cwd = process.cwd();
      const encodedPath = cwd.replace(/[/\\]/g, "-");
      const projectDir = path.join(testDir, ".claude", "projects", encodedPath);
      const indexPath = path.join(projectDir, "sessions-index.json");

      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(indexPath, JSON.stringify({ entries: [] }));

      const result = detectClaudeSessionId();
      expect(result).toBeUndefined();
    });
  });

  describe("getAgentSessionId", () => {
    it("should prioritize TERMOS_SESSION_ID env var", () => {
      process.env.TERMOS_SESSION_ID = "env-session-id";

      const result = getAgentSessionId();
      expect(result).toBe("env-session-id");
    });

    it("should return undefined when no session can be detected", () => {
      const result = getAgentSessionId();
      expect(result).toBeUndefined();
    });

    it("should use active marker when env var is not set", () => {
      const cwd = process.cwd();
      const encodedPath = cwd.replace(/[/\\]/g, "-");
      const markerDir = path.join(testDir, ".termos", "markers", "active");
      const markerPath = path.join(markerDir, encodedPath);

      fs.mkdirSync(markerDir, { recursive: true });
      fs.writeFileSync(markerPath, "marker-session-id");

      const result = getAgentSessionId();
      expect(result).toBe("marker-session-id");
    });
  });
});
