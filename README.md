# Agent Workbench

Your Command Center for Claude Code.

https://github.com/user-attachments/assets/b7882c4f-c2bc-43e6-97bb-eb9353d06f28

## Agent Inbox

Running multiple Claude sessions? Agent Workbench gives you a single playground to monitor them all. See which agents are running, thinking, waiting, or idle. Respond to interactions when you're ready—agents wait patiently.

```bash
awb ui
```

- **One place for all sessions** - See every Claude instance at a glance
- **Never miss a request** - Interactions queue up until you respond
- **Stay in the loop** - Know what each agent is doing in real-time

## The Problem

Claude Code's built-in `AskUserQuestion` tool blocks execution until you respond. One question at a time. If Claude needs approval mid-task, everything stops.

## The Solution

Agent Workbench is a CLI + Claude Code skill for non-blocking interactions. Claude keeps working while you review and respond in your own time via the web playground.

```bash
# Claude runs this (non-blocking)
awb run --title "Deploy" confirm --prompt "Deploy to production?"

# Returns immediately with an ID
# Claude continues working, checks result later
awb wait <id>
```

- **Non-blocking** - Claude asks without stopping
- **Parallel interactions** - Multiple questions queue up in the playground
- **Rich components** - Diffs, tables, checklists, not just text prompts

## Install

```bash
claude plugins add-marketplace github:termos-dev/agent-workbench
claude plugins install awb
```

Then run `/awb:init` in Claude to configure.

## Usage

```bash
# Launch the playground to monitor and respond
awb ui

# Show help
awb
```

## Components

`confirm` `ask` `checklist` `select` `progress` `diff` `code` `table` `json` `markdown` `chart` `gauge` `tree` `mermaid` `card` `plan-viewer`

## License

MIT
