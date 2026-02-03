import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const runtimeDir =
  process.env.AWB_RUNTIME_DIR ||
  process.env.WB_RUNTIME_DIR ||
  path.join(repoRoot, ".tmp", "awb-e2e");
const nodeBin = process.execPath;
const cliPath = path.join(repoRoot, "dist", "index.js");
const fixturesDir = path.join(repoRoot, "tests", "fixtures");

function ensureRuntimeDir() {
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function runCli(args: string[]) {
  const output = execFileSync(nodeBin, [cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AWB_RUNTIME_DIR: runtimeDir },
  }).toString();

  const match = output.match(/\{[^}]*"status":"started"[^}]*\}/);
  if (!match) {
    throw new Error(`Failed to parse CLI output: ${output}`);
  }
  return JSON.parse(match[0]) as { id: string; session: string };
}

async function waitForWelcome(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() =>
    Boolean((window as { awbRespond?: unknown }).awbRespond)
  );
}

test.describe("Agent Workbench UI", () => {
  test.beforeEach(async ({ page }) => {
    ensureRuntimeDir();
    await waitForWelcome(page);
  });

  test("renders code from file", async ({ page }) => {
    const codeFile = path.join(fixturesDir, "code.ts");
    runCli(["run", "--title", "Code File", "code", "--file", codeFile]);
    await expect(page.getByText("export const answer = 42")).toBeVisible();
  });

  test("renders markdown from file", async ({ page }) => {
    const markdownFile = path.join(fixturesDir, "markdown.md");
    runCli([
      "run",
      "--title",
      "Markdown File",
      "markdown",
      "--file",
      markdownFile,
    ]);
    await expect(
      page.getByRole("heading", { name: "Hello Markdown" })
    ).toBeVisible();
  });

  test("renders table from JSON file", async ({ page }) => {
    const tableFile = path.join(fixturesDir, "table.json");
    runCli(["run", "--title", "Table File", "table", "--file", tableFile]);
    await expect(page.getByText("Alice")).toBeVisible();
    await expect(page.getByRole("cell", { name: "30" })).toBeVisible();
  });

  test("renders chart from JSON file", async ({ page }) => {
    const chartFile = path.join(fixturesDir, "chart.json");
    runCli(["run", "--title", "Chart File", "chart", "--file", chartFile]);
    await expect(page.getByText("Mon")).toBeVisible();
    await expect(page.getByText("Tue")).toBeVisible();
  });

  test("renders tree from JSON file", async ({ page }) => {
    const treeFile = path.join(fixturesDir, "tree.json");
    runCli(["run", "--title", "Tree File", "tree", "--file", treeFile]);
    await expect(page.getByText("src")).toBeVisible();
    await expect(page.getByText("index.ts")).toBeVisible();
  });

  test("renders plan viewer from file", async ({ page }) => {
    const planFile = path.join(fixturesDir, "plan.md");
    runCli(["run", "--title", "Plan File", "plan-viewer", "--file", planFile]);
    await expect(
      page.getByRole("heading", { name: "Plan Title" })
    ).toBeVisible();
  });

  test("kills a running command via API", async ({ page }) => {
    const child = spawn(
      nodeBin,
      [cliPath, "run", "--title", "Sleep", "--cmd", "sleep 10"],
      {
        cwd: repoRoot,
        env: { ...process.env, AWB_RUNTIME_DIR: runtimeDir },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let buffer = "";
    const interaction = await new Promise<{ id: string; session: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for CLI output"));
        }, 5000);

        child.stdout?.on("data", (data) => {
          buffer += data.toString();
          const match = buffer.match(/\{[^}]*"status":"started"[^}]*\}/);
          if (match) {
            clearTimeout(timeout);
            resolve(JSON.parse(match[0]) as { id: string; session: string });
          }
        });

        child.on("error", reject);
      }
    );

    await expect
      .poll(
        async () => {
          const response = await page.request.post("/api/kill", {
            data: {
              interactionId: interaction.id,
              sessionName: interaction.session,
            },
          });
          const result = await response.json();
          return result.success === true;
        },
        { timeout: 5000 }
      )
      .toBe(true);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Process did not exit after kill"));
      }, 5000);

      child.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).not.toBeNull();
  });
});
