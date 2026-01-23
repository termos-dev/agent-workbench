# Termos

Your Command Center for Claude Code.

https://github.com/user-attachments/assets/b7882c4f-c2bc-43e6-97bb-eb9353d06f28

## Agent Inbox

Running multiple Claude sessions? Termos gives you a single dashboard to monitor them all. See which agents are running, thinking, waiting, or idle. Respond to interactions when you're ready—agents wait patiently.

```bash
termos tui
```

- **One place for all sessions** - See every Claude instance at a glance
- **Never miss a request** - Interactions queue up until you respond
- **Stay in the loop** - Know what each agent is doing in real-time

## The Problem

Claude Code's built-in `AskUserQuestion` tool blocks execution until you respond. One question at a time. If Claude needs approval mid-task, everything stops.

## The Solution

Termos is a CLI + Claude Code skill for non-blocking interactions. Claude keeps working while you review and respond in your own time via the TUI.

```bash
# Claude runs this (non-blocking)
termos run --title "Deploy" confirm --prompt "Deploy to production?"

# Returns immediately with an ID
# Claude continues working, checks result later
termos wait <id>
```

- **Non-blocking** - Claude asks without stopping
- **Parallel interactions** - Multiple questions queue up in the TUI
- **Rich components** - Diffs, tables, checklists, not just text prompts

## Install

```bash
claude plugins add-marketplace github:termos-dev/termos
claude plugins install termos
```

Then run `/termos:init` in Claude to configure.

## Usage

```bash
# Launch the TUI to monitor and respond
termos tui

# Show help
termos
```

## Components

`confirm` `ask` `checklist` `select` `progress` `diff` `code` `table` `json` `markdown` `chart` `gauge` `tree` `mermaid` `card` `plan-viewer`

Drop custom `.tsx` files in `.termos/interactive/` for your own Ink components.

## License

MIT
