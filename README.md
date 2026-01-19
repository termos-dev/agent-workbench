# Termos

Keep Claude Code interactive while it works.

https://github.com/user-attachments/assets/724385fc-6f1e-4983-b7fc-04801b41a703

## The Problem

Claude Code's built-in `AskUserQuestion` tool blocks execution until you respond. One question at a time. If Claude needs approval mid-task, everything stops.

## The Solution

Termos is a CLI + Claude Code skill that spawns **floating terminal panes** for interactions. Claude keeps working while you review and respond in your own time.

```bash
# Claude runs this (non-blocking)
termos run confirm --prompt "Deploy to production?"

# Returns immediately with an ID
# Claude continues working, checks result later
termos wait <id>
```

- **Non-blocking** - Claude asks without stopping
- **Parallel interactions** - Multiple panes, multiple questions
- **Rich components** - Diffs, tables, checklists, not just text prompts
- **Side-by-side workflow** - Run a Zellij session alongside Claude with your dev servers

## Install

```bash
claude plugins add-marketplace github:termos-dev/termos
claude plugins install termos
```

Then run `/termos:init` in Claude to configure.

## Side-by-Side Workflow

Run a Zellij session alongside Claude with your background processes:

```bash
# Terminal 1: Claude Code
claude

# Terminal 2: View interactions + run dev servers
termos attach
```

`/termos:init` asks about your project's background processes (dev server, API, logs) and generates a custom layout. When you run `termos attach`, everything starts automatically.

```bash
termos attach              # Start session with default layout
termos attach -l debug     # Use a different layout
termos status              # Check session status
termos stop                # Kill the session
```

## Components

`confirm` `ask` `checklist` `select` `diff` `code` `table` `json` `markdown` `progress` `chart` `gauge` `tree` `mermaid` `plan-viewer`

Drop custom `.tsx` files in `.termos/interactive/` for your own Ink components.

## Requirements

- **macOS**: Native support (Ghostty or Terminal.app)
- **Linux/Windows**: Requires [Zellij](https://zellij.dev/)

## License

MIT
