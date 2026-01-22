/**
 * Dashboard command handler - launches the interactive TUI.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

  // Get the ink-runner directory to find the tsconfig.json with correct JSX settings
  const inkRunnerDir = path.dirname(path.dirname(path.dirname(targetPath)));
  const tsconfigPath = path.join(inkRunnerDir, "tsconfig.json");

  // Use --tsconfig flag if the config exists, otherwise tsx will use default settings
  const tsxArgs = fs.existsSync(tsconfigPath)
    ? ["tsx", "--tsconfig", tsconfigPath, targetPath, ...args]
    : ["tsx", targetPath, ...args];

  const result = spawnSync("npx", tsxArgs, {
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  process.exit(result.status ?? 0);
}
