---
allowed-tools: Bash
description: Interactive UI components (confirm, progress, diff, table, code, json). Use when user mentions awb or needs visual UI elements.
---

Use this skill when the user asks about awb, wants to use awb components, or when you need interactive UI elements like confirmations, progress tracking, diffs, tables, or user input.

# Agent Workbench Interactive UI

Agent Workbench enhances Claude Code with rich visual components for interactive workflows.

## Workflow
1. `awb run --title "Title" <component> [args]` - sends interaction, returns ID
2. `awb wait <id>` - blocks until user responds in playground

The user runs `awb ui` to open the playground and respond to interactions.

## Components

| Component | Use Case | Example |
|-----------|----------|---------|
| confirm | Yes/no before destructive actions | `awb run --title "Delete" confirm --prompt "Delete 5 files?"` |
| ask | User questions (1-4) | `awb run --title "Input" ask --questions '[{"question":"Enter value:","header":"value"}]'` |
| checklist | Interactive task list | `awb run --title "Tasks" checklist --items "Build,Test,Deploy"` |
| select | Single-item picker | `awb run --title "Choose" select --items "Option A,Option B"` |
| progress | Multi-step task tracking | `awb run --title "Setup" progress --steps "Install,Build,Test"` |
| diff | Code review before commits | `awb run --title "Review" diff --file path/to/file` |
| code | Syntax-highlighted files (press 'e' to edit) | `awb run --title "Code" code --file path/to/file` |
| table | Structured data display | `awb run --title "Data" table --data '[{"name":"foo"}]'` |
| json | API responses, configs | `awb run --title "Config" json --data '{"key":"value"}'` |
| markdown | Render markdown content | `awb run --title "Docs" markdown --file README.md` |
| chart | Terminal charts | `awb run --title "Stats" chart --data "[5,10,15]" --type sparkline` |
| gauge | Visual meter/progress | `awb run --title "CPU" gauge --value 75 --label "CPU Usage"` |
| tree | Directory tree viewer | `awb run --title "Tree" tree --path ./src` |
| mermaid | ASCII diagrams | `awb run --title "Flow" mermaid --code "flowchart LR; A-->B"` |
| card | Markdown with action buttons | `awb run --title "Notice" card --content "# Alert"` |
| plan-viewer | Plan mode display | `awb run --title "Plan" plan-viewer --file plan.md` |

## When to Use Agent Workbench

- **Confirmations**: Before delete, deploy, overwrite, or any destructive operation
- **Progress**: For multi-step tasks (builds, migrations, installations)
- **Diff**: Before git commits to review changes visually
- **Table/JSON**: For displaying structured data in a readable format
- **Code**: For showing file contents with syntax highlighting
- **Ask**: When you need specific input from the user

Always include `--title` for context. Run `awb --help` or `awb run --help` for full details.

## Now

Based on the user's request, use the appropriate awb component. If they just asked what awb is, explain it. If they want to use a component, run the appropriate command.
