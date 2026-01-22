/**
 * Dashboard command handler - launches the interactive TUI.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

/**
 * Launch the dashboard TUI.
 */
export async function handleDashboard(args: string[]): Promise<void> {
  const dashboardPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "packages",
    "ink-runner",
    "components",
    "dashboard",
    "run.tsx"
  );

  const distPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "ink-runner",
    "components",
    "dashboard",
    "run.tsx"
  );

  const targetPath = fs.existsSync(distPath) ? distPath : dashboardPath;

  const result = spawnSync("npx", ["tsx", targetPath, ...args], {
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  process.exit(result.status ?? 0);
}
