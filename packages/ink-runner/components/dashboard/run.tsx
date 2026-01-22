#!/usr/bin/env npx tsx
/**
 * Dashboard runner - standalone entry point for the termos tui command.
 * Run with: npx tsx packages/ink-runner/components/dashboard/run.tsx
 */

import { render } from "ink";
import React from "react";
import {
  deleteDashboardMarker,
  writeDashboardMarker,
} from "../../../../src/runtime.js";
import Dashboard from "./dashboard.js";

interface Args {
  refresh?: string;
  session?: string;
  global?: boolean;
  project?: string;
  currentProject?: string;
}

// Parse CLI arguments
function parseArgs(): Args {
  const cliArgs = process.argv.slice(2);
  const result: Args = {};

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i];

    if (arg.startsWith("--refresh=")) {
      result.refresh = arg.slice("--refresh=".length);
    } else if (arg === "--refresh" && cliArgs[i + 1]) {
      result.refresh = cliArgs[++i];
    } else if (arg.startsWith("--session=")) {
      result.session = arg.slice("--session=".length);
    } else if (arg === "--session" && cliArgs[i + 1]) {
      result.session = cliArgs[++i];
    } else if (arg === "--global") {
      result.global = true;
    } else if (arg.startsWith("--project=")) {
      result.project = arg.slice("--project=".length);
    } else if (arg === "--project" && cliArgs[i + 1]) {
      result.project = cliArgs[++i];
    }
  }

  // Derive current project from cwd
  const cwd = process.cwd();
  const parts = cwd.split("/").filter(Boolean);
  result.currentProject = parts[parts.length - 1] || undefined;

  return result;
}

// Parse CLI args
const args = parseArgs();

// Handle signals
["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"].forEach((signal) => {
  process.on(signal as NodeJS.Signals, () => {
    process.exit(0);
  });
});

// Handle stream errors (EIO when terminal disconnects)
process.stdin.on("error", () => process.exit(0));
process.stdout.on("error", () => process.exit(0));
process.stderr.on("error", () => process.exit(0));

async function main(): Promise<void> {
  // Write marker so termos run knows dashboard is handling interactions
  writeDashboardMarker();

  const cleanup = () => {
    deleteDashboardMarker();
  };

  // Ensure cleanup on exit
  process.on("exit", cleanup);

  // Handle non-TTY (piped output, CI) - use debug mode to append frames instead of overwriting
  if (!process.stdout.isTTY) {
    const { waitUntilExit } = render(
      React.createElement(Dashboard, {
        args: {
          global: args.global,
          currentProject: args.currentProject,
        },
      }),
      { debug: true }
    );
    await waitUntilExit();
    cleanup();
    return;
  }

  // Pass args via props (dependency injection) instead of globals
  const { waitUntilExit } = render(
    React.createElement(Dashboard, {
      args: {
        global: args.global,
        currentProject: args.currentProject,
      },
    })
  );

  await waitUntilExit();
  cleanup();
}

main().catch((err) => {
  console.error(
    "Fatal error:",
    err instanceof Error ? err.stack || err.message : String(err)
  );
  process.exit(1);
});

// Catch unhandled rejections and exceptions
process.on("uncaughtException", (err) => {
  // Write to stderr and a log file for debugging
  const msg = `Uncaught exception: ${err.stack || err.message}`;
  console.error(msg);
  try {
    require("node:fs").appendFileSync(
      "/tmp/termos-crash.log",
      `${new Date().toISOString()} ${msg}\n`
    );
  } catch {}
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const msg = `Unhandled rejection: ${reason}`;
  console.error(msg);
  try {
    require("node:fs").appendFileSync(
      "/tmp/termos-crash.log",
      `${new Date().toISOString()} ${msg}\n`
    );
  } catch {}
  process.exit(1);
});
