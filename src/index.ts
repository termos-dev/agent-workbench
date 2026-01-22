#!/usr/bin/env node

/**
 * Termos CLI - Interactive TUI for Claude Code
 *
 * This is the main entry point that dispatches to individual command handlers.
 */

import {
  handleRun,
  handleWait,
  handleListen,
  handleSetup,
  handleDashboard,
  handleSetTitle,
  handleEvent,
} from "./commands/index.js";
import { loadMergedInstructions } from "./instructions-loader.js";

/**
 * Show main help message.
 */
function showHelp(): void {
  console.log(`
termos - Interactive UI for Claude Code

Usage:
  termos                              Show this help
  termos setup                        Install plugin for Claude Code
  termos tui [options]                Launch interactive TUI

Agent Commands:
  termos set-title <title>            Set a short title for this session
  termos run --title <t> <component>  Show interactive component in TUI
  termos run --title <t> --cmd "..."  Run command, show output in TUI
  termos wait <id>                    Wait for user response (includes messages)
  termos wait --all                   Get all results (debugging)
  termos listen                       Block until message arrives (Ctrl+C to cancel)
  termos listen --count               Get pending message count (for hooks)

TUI Options:
  --refresh <sec>    Refresh interval in seconds (default: 1)
  --global           Show all projects with tabs (default: only current directory)
  --project <name>   Focus on specific project tab

Components:
  Interactive: confirm, select, checklist, ask (user responds)
  Display:     code, table, json, output, etc. (user dismisses with 'd')

Agent Best Practice:
  At the start of a session, set a descriptive title:
    termos set-title "Building Auth System"
  This helps users identify sessions in the TUI dashboard.

Getting Started:
  1. npm install -g @termosdev/cli    # Install globally
  2. termos setup                      # Install Claude plugin
  3. Restart Claude Code               # Load the plugin
  4. termos tui                        # Run TUI in separate terminal

Examples:
  termos set-title "Refactoring API"
  termos run --title "Confirm" confirm --prompt "Delete files?"
  termos run --title "Status" --cmd "git status"
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
    "tui",
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
  let bestDist = Infinity;

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
    case "tui":
      await handleDashboard(args.slice(1));
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

    case "wait":
      await handleWait(args.slice(1));
      return;

    case "listen":
      await handleListen(args.slice(1));
      return;

    case "event":
      handleEvent(args.slice(1));
      return;

    default:
      // Unknown command - suggest closest match
      const suggestion = suggestCommand(cmd);
      if (suggestion) {
        console.error(`Unknown command: ${cmd}`);
        console.error(`Did you mean 'termos ${suggestion}'?`);
      } else {
        console.error(`Unknown command: ${cmd}`);
        console.error(`Run 'termos help' for usage`);
      }
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
