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
  handleStatus,
  handleUI,
  handleWait,
} from "./commands/index.js";
import { loadMergedInstructions } from "./instructions-loader.js";
import {
  getTmuxSessionName,
  isTmuxAvailable,
  tmuxSessionExists,
} from "./runtime.js";

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
  awb status [--json]              Show all sessions and processes

Agent Commands:
  awb set-title <title>            Set a short title for this session
  awb run --title <t> <component>  Show interactive component
  awb wait <id>                    Wait for user response

User Messages (playground → agent):
  Users can send messages from playground to notify/wake the agent.
  The agent-idle hook checks for pending messages automatically.
  awb listen --count               Get pending message count (used by hooks)
  awb listen                       Block until message arrives (rarely needed)

UI Options:
  awb ui --open      Auto-open browser

Components:
  Interactive: confirm, checklist, ask (user responds)
  Display:     code, table, markdown, html, plan-viewer

Agent Best Practice:
  At the start of a session, set a descriptive title:
    awb set-title "Building Auth System"
  This helps users identify sessions in the playground.

Examples:
  awb set-title "Refactoring API"
  awb run --title "Confirm" confirm --prompt "Delete files?"
`);

  // Show tmux information if available
  if (isTmuxAvailable()) {
    const sessionName = getTmuxSessionName();
    const inTmux = !!process.env.TMUX;
    const sessionExists = sessionName ? tmuxSessionExists(sessionName) : false;

    console.log("## tmux Integration\n");
    if (inTmux) {
      console.log(`  Currently in tmux session: ${sessionName}`);
    } else {
      console.log(`  tmux session for this directory: ${sessionName}`);
      console.log(`  Session exists: ${sessionExists ? "yes" : "no"}`);
    }
    console.log(`
  tmux Commands for Background Processes:

  Setup & Create:
    tmux new-session -A -d -s ${sessionName}
    tmux new-window -t ${sessionName} -n "dev" "npm run dev"

  Capture Output (no PTY needed):
    tmux capture-pane -t ${sessionName}:dev -p              # Get current pane content
    tmux capture-pane -t ${sessionName}:dev -p -S -100      # Last 100 lines

  Send Input:
    tmux send-keys -t ${sessionName}:dev "npm test" Enter   # Run a command

  Status:
    tmux list-windows -t ${sessionName}                     # List windows
    tmux list-panes -t ${sessionName}:dev                   # List panes

  Cleanup:
    tmux kill-window -t ${sessionName}:dev
`);
  }

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
    "status",
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

    case "status":
      await handleStatus(args.slice(1));
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
