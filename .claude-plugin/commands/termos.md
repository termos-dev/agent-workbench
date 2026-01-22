---
allowed-tools: Bash
description: Interactive TUI components (confirm, progress, diff, table, code, json). Use when user mentions termos or needs visual UI elements.
---

Use this skill when the user asks about termos, wants to use termos components, or when you need interactive UI elements like confirmations, progress tracking, diffs, tables, or user input.

# Termos Interactive TUI

Termos enhances Claude Code with rich visual components for interactive workflows.

## Workflow
1. `termos run --title "Title" <component> [args]` - sends interaction, returns ID
2. `termos wait <id>` - blocks until user responds in TUI

The user runs `termos tui` in a separate terminal to see and respond to interactions.

## Components

| Component | Use Case | Example |
|-----------|----------|---------|
| confirm | Yes/no before destructive actions | `termos run --title "Delete" confirm --prompt "Delete 5 files?"` |
| ask | User questions (1-4) | `termos run --title "Input" ask --questions '[{"question":"Enter value:","header":"value"}]'` |
| checklist | Interactive task list | `termos run --title "Tasks" checklist --items "Build,Test,Deploy"` |
| select | Single-item picker | `termos run --title "Choose" select --items "Option A,Option B"` |
| progress | Multi-step task tracking | `termos run --title "Setup" progress --steps "Install,Build,Test"` |
| diff | Code review before commits | `termos run --title "Review" diff --file path/to/file` |
| code | Syntax-highlighted files (press 'e' to edit) | `termos run --title "Code" code --file path/to/file` |
| table | Structured data display | `termos run --title "Data" table --data '[{"name":"foo"}]'` |
| json | API responses, configs | `termos run --title "Config" json --data '{"key":"value"}'` |
| markdown | Render markdown content | `termos run --title "Docs" markdown --file README.md` |
| chart | Terminal charts | `termos run --title "Stats" chart --data "[5,10,15]" --type sparkline` |
| gauge | Visual meter/progress | `termos run --title "CPU" gauge --value 75 --label "CPU Usage"` |
| tree | Directory tree viewer | `termos run --title "Tree" tree --path ./src` |
| mermaid | ASCII diagrams | `termos run --title "Flow" mermaid --code "flowchart LR; A-->B"` |
| card | Markdown with action buttons | `termos run --title "Notice" card --content "# Alert"` |
| plan-viewer | Plan mode display | `termos run --title "Plan" plan-viewer --file plan.md` |

## When to Use Termos

- **Confirmations**: Before delete, deploy, overwrite, or any destructive operation
- **Progress**: For multi-step tasks (builds, migrations, installations)
- **Diff**: Before git commits to review changes visually
- **Table/JSON**: For displaying structured data in a readable format
- **Code**: For showing file contents with syntax highlighting
- **Ask**: When you need specific input from the user

Always include `--title` for context. Run `termos --help` or `termos run --help` for full details.

## Now

Based on the user's request, use the appropriate termos component. If they just asked what termos is, explain it. If they want to use a component, run the appropriate command.
