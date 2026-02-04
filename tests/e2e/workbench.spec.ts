import { execFileSync } from "node:child_process";
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

  test("renders html from content", async ({ page }) => {
    runCli([
      "run",
      "--title",
      "HTML Panel",
      "html",
      "--content",
      "<h1>Hello HTML</h1>",
    ]);
    await expect(
      page
        .frameLocator('iframe[title="HTML Panel"]')
        .getByRole("heading", { name: "Hello HTML" })
    ).toBeVisible();
  });

  test("renders plan viewer from file", async ({ page }) => {
    const planFile = path.join(fixturesDir, "plan.md");
    runCli(["run", "--title", "Plan File", "plan-viewer", "--file", planFile]);
    await expect(
      page.getByRole("heading", { name: "Plan Title" })
    ).toBeVisible();
  });
});
