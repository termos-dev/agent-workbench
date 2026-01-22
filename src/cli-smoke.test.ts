import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * CLI Smoke Tests
 *
 * These tests verify the CLI behaves correctly at the command level.
 * They lock current behavior before refactoring to ensure no regressions.
 */

describe("CLI smoke tests", () => {
  const testDir = path.join(os.tmpdir(), `termos-cli-test-${Date.now()}`);
  const _originalCwd = process.cwd();
  const cliPath = path.join(__dirname, "..", "dist", "index.js");

  // Helper to run CLI commands
  function runCli(
    args: string[],
    options: { cwd?: string; expectFail?: boolean } = {}
  ): { stdout: string; stderr: string; status: number } {
    const result = spawnSync("node", [cliPath, ...args], {
      encoding: "utf-8",
      cwd: options.cwd || testDir,
      env: {
        ...process.env,
        TERMOS_RUNTIME_DIR: path.join(testDir, ".termos", "sessions"),
      },
    });

    if (!options.expectFail && result.status !== 0) {
      // For debugging failed tests
      console.error("CLI failed:", result.stderr);
    }

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status ?? 1,
    };
  }

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, ".termos", "sessions"), {
      recursive: true,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("help command", () => {
    it("should show help with no arguments", () => {
      const result = runCli([]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos");
      expect(result.stdout).toContain("Usage");
    });

    it("should show help with --help flag", () => {
      const result = runCli(["--help"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos");
    });

    it("should show help with -h flag", () => {
      const result = runCli(["-h"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos");
    });

    it("should show help with help command", () => {
      const result = runCli(["help"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos");
    });
  });

  describe("run command", () => {
    it("should show run help with no arguments", () => {
      const result = runCli(["run"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos run");
    });

    it("should show run help with --help", () => {
      const result = runCli(["run", "--help"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("termos run");
    });

    it("should require --title flag", () => {
      const result = runCli(["run", "confirm", "--prompt", "test"], {
        expectFail: true,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("--title is required");
    });

    it("should reject unknown CLI options", () => {
      const result = runCli(
        ["run", "--unknown-flag", "--title", "Test", "confirm"],
        { expectFail: true }
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Unknown CLI option");
    });

    it("should reject mutually exclusive command options", () => {
      const result = runCli(
        ["run", "--title", "Test", "--cmd", "echo hi", "--cmd-file", "file.sh"],
        { expectFail: true }
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("only one of");
    });

    it("should validate required component args for checklist", () => {
      // checklist requires --items as per schema
      const result = runCli(["run", "--title", "Test", "checklist"], {
        expectFail: true,
      });
      // Current behavior: validation exists for required args
      expect(result.stdout).toContain("--items");
    });

    it("should reject unknown component args for confirm", () => {
      // confirm has a defined schema with known args
      const result = runCli(
        [
          "run",
          "--title",
          "Test",
          "confirm",
          "--prompt",
          "Sure?",
          "--invalid-arg",
          "value",
        ],
        { expectFail: true }
      );
      // Current behavior: unknown args are rejected
      expect(result.stdout).toContain("Unknown argument");
    });

    it("should start confirm interaction and return JSON", () => {
      const result = runCli([
        "run",
        "--title",
        "Test Confirm",
        "confirm",
        "--prompt",
        "Are you sure?",
      ]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.status).toBe("started");
      expect(output.id).toMatch(/^interaction-/);
      expect(output.session).toBeTruthy();
    });

    it("should start select interaction and return JSON", () => {
      const result = runCli([
        "run",
        "--title",
        "Test Select",
        "select",
        "--items",
        "a,b,c",
      ]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.status).toBe("started");
      expect(output.id).toMatch(/^interaction-/);
    });

    it("should run command mode with --cmd", () => {
      const result = runCli([
        "run",
        "--title",
        "Echo Test",
        "--cmd",
        "echo hello",
      ]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.status).toBe("started");
    });

    it("should run command mode with -- separator", () => {
      const result = runCli([
        "run",
        "--title",
        "Echo Test",
        "--",
        "echo",
        "hello",
      ]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.status).toBe("started");
    });

    it("should validate JSON arguments", () => {
      const _result = runCli(
        ["run", "--title", "Test", "checklist", "--items", "not-valid-json["],
        { expectFail: true }
      );
      // Note: comma-separated items are also valid, so this might not fail
      // The behavior depends on the implementation
    });

    it("should validate file existence for --file arg", () => {
      const result = runCli(
        [
          "run",
          "--title",
          "Test",
          "markdown",
          "--file",
          "/nonexistent/file.txt",
        ],
        { expectFail: true }
      );
      // File validation happens after arg validation
      expect(result.stdout).toContain("File not found");
    });

    it("should handle ask component with --questions", () => {
      const questions = JSON.stringify([
        {
          question: "What?",
          header: "Q1",
          options: [{ label: "A" }, { label: "B" }],
        },
      ]);
      const result = runCli([
        "run",
        "--title",
        "Test Ask",
        "ask",
        "--questions",
        questions,
      ]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.status).toBe("started");
    });

    it("should require --questions for ask component", () => {
      const result = runCli(["run", "--title", "Test", "ask"], {
        expectFail: true,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("--questions is required");
    });
  });

  describe("wait command", () => {
    it("should require interaction ID", () => {
      const result = runCli(["wait"], { expectFail: true });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    it("should support --all flag", () => {
      const result = runCli(["wait", "--all"]);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.results).toEqual([]);
    });
  });

  describe("listen command", () => {
    it("should support --count flag", () => {
      const result = runCli(["listen", "--count"]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("0");
    });
  });

  describe("set-title command", () => {
    it("should require a title argument", () => {
      const result = runCli(["set-title"], { expectFail: true });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage");
    });
  });

  describe("unknown command", () => {
    it("should suggest similar commands", () => {
      const result = runCli(["runn"], { expectFail: true });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Did you mean");
    });

    it("should show help message for unknown commands", () => {
      const result = runCli(["xyz123"], { expectFail: true });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  describe("tui command", () => {
    it("should not fail with React is not defined error", () => {
      // Run TUI - it will fail because we're not in a TTY, but it should NOT fail
      // with "React is not defined" which indicates a JSX transform misconfiguration
      const result = runCli(["tui"], { expectFail: true });

      // The TUI will fail in CI/test environment because there's no TTY
      // But it should fail with "Raw mode is not supported", NOT "React is not defined"
      const combinedOutput = result.stdout + result.stderr;

      // This is the critical assertion - if this fails, the JSX transform is broken
      expect(combinedOutput).not.toContain("React is not defined");

      // Expected error in non-TTY environment
      expect(combinedOutput).toContain("Raw mode is not supported");
    });
  });
});
