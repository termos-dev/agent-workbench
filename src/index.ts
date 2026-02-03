#!/usr/bin/env node

/**
 * Agent Workbench CLI - Interactive UI for Claude Code
 *
 * This is the main entry point that dispatches to individual command handlers.
 */

import {
  handleEvent,
  handleListen,
  handleRun,
  handleSetTitle,
  handleSetup,
  handleUI,
  handleWait,
} from "./commands/index.js";
import { loadMergedInstructions } from "./instructions-loader.js";

/**
 * Show main help message.
 */
function showHelp(): void {
  console.log(`
awb - Interactive UI for Claude Code

Usage:
  awb                              Show this help
  awb setup                        Install plugin for Claude Code
  awb ui [options]                 Launch web playground

Agent Commands:
  awb set-title <title>            Set a short title for this session
  awb run --title <t> <component>  Show interactive component
  awb run --title <t> --cmd "..."  Run command, show output
  awb wait <id>                    Wait for user response (includes messages)
  awb wait --all                   Get all results (debugging)
  awb listen                       Block until message arrives (Ctrl+C to cancel)
  awb listen --count               Get pending message count (for hooks)

Playground Options:
  --port <number>    Port to serve on (default: 3847)

Components:
  Interactive: confirm, select, checklist, ask (user responds)
  Display:     code, diff, table, json, markdown, card, progress, chart,
               gauge, tree, mermaid, plan-viewer

Agent Best Practice:
  At the start of a session, set a descriptive title:
    awb set-title "Building Auth System"
  This helps users identify sessions in the playground.

Getting Started:
  1. npm install -g agent-workbench    # Install globally
  2. awb setup                      # Install Claude plugin
  3. Restart Claude Code               # Load the plugin
  4. awb ui                         # Run playground in browser

Examples:
  awb set-title "Refactoring API"
  awb run --title "Confirm" confirm --prompt "Delete files?"
  awb run --title "Status" --cmd "git status"
`);

  const instructions = loadMergedInstructions(process.cwd());
  if (instructions) {
    console.log("\n## Project Instructions\n");
    console.log(instructions);
  }
}

/**
 * Find the closest matching command using Levenshtein distance.
 */
function suggestCommand(input: string): string | null {
  const commands = [
    "run",
    "wait",
    "ui",
    "setup",
    "set-title",
    "listen",
    "event",
    "help",
  ];

  // Levenshtein distance
  const distance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] =
          b[i - 1] === a[j - 1]
            ? matrix[i - 1][j - 1]
            : Math.min(
                matrix[i - 1][j - 1] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j] + 1
              );
      }
    }
    return matrix[b.length][a.length];
  };

  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const cmd of commands) {
    const d = distance(input.toLowerCase(), cmd);
    // Only suggest if distance is reasonable (less than half the command length)
    if (d < bestDist && d <= Math.max(2, Math.floor(cmd.length / 2))) {
      best = cmd;
      bestDist = d;
    }
  }

  return best;
}

/**
 * Main entry point - dispatches to command handlers.
 */
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  // No command or help flags → show help
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    showHelp();
    process.exit(0);
  }

  // Route to command handlers
  switch (cmd) {
    case "ui":
      await handleUI(args.slice(1));
      return;

    case "setup":
      await handleSetup();
      return;

    case "set-title":
      handleSetTitle(args.slice(1));
      return;

    case "run":
      await handleRun(args.slice(1));
      process.exit(0);
      return;

    case "wait":
      await handleWait(args.slice(1));
      return;

    case "listen":
      await handleListen(args.slice(1));
      return;

    case "event":
      handleEvent(args.slice(1));
      return;

    default: {
      // Unknown command - suggest closest match
      const suggestion = suggestCommand(cmd);
      if (suggestion) {
        console.error(`Unknown command: ${cmd}`);
        console.error(`Did you mean 'awb ${suggestion}'?`);
      } else {
        console.error(`Unknown command: ${cmd}`);
        console.error(`Run 'awb help' for usage`);
      }
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
