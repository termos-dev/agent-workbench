---
name: awb
description: Run Agent Workbench (awb) interactive UI components from Codex or the CLI. Use when the user needs a confirmation, checklist, input, table, code or markdown view, or a visual playground. Always follow interactive runs with awb wait and the returned ID. Use tmux for long-running commands (see awb --help).
---

# Agent Workbench (awb)

## Quick Start

1. Ensure the user has the playground open with `awb ui`.
2. Run a component with `awb run --title "..." <component> [args]`.
3. Always call `awb wait <id>` and read the JSON response.

## Components

Interactive: `confirm`, `checklist`, `ask`
Display: `code`, `table`, `markdown`, `plan-viewer`, `html`

## Essential Rules

- Require `--title` for every `awb run`.
- Run `awb run --help` before using a component you are unsure about.
- If `awb` is not on PATH, ask the user to install or run the local CLI.

## Interactive Runs (Always wait)

`awb run` returns immediately with an ID. Always call `awb wait <id>` to get the response.

```bash
ID=$(awb run --title "Q1" confirm --prompt "Approve?")
awb wait $ID
```

Fire multiple at once, then wait for each:

```bash
ID1=$(awb run --title "Q1" confirm --prompt "Approve?")
ID2=$(awb run --title "Q2" checklist --items "A,B,C")
awb wait $ID1
awb wait $ID2
```

## Wait Results

`awb wait <id>` returns JSON with the user's response:

```json
{"confirmed": true}
{"items": [{"text":"A","checked":true}]}
{"answers": {"key": "value"}}
```

## Examples

confirm
```bash
awb run --title "Deploy" confirm --prompt "Deploy to production?"
```

checklist
```bash
awb run --title "Tasks" checklist --items "Build,Test,Deploy"
```

ask (1-4 questions)
```bash
awb run --title "Name" ask --questions '[{"question":"Your name?","header":"name"}]'
awb run --title "Pick" ask --questions '[{"question":"Language?","header":"lang","options":[{"label":"TypeScript"},{"label":"Python"}]}]'
awb run --title "Features" ask --questions '[{"question":"Enable?","header":"feat","multiSelect":true,"options":[{"label":"Auth"},{"label":"API"}]}]'
```

table
```bash
awb run --title "Data" table --data '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'
```

code (file only)
```bash
awb run --title "Source" code --file ./src/index.ts
```

markdown
```bash
awb run --title "Docs" markdown --file ./README.md
awb run --title "Notes" markdown --content "# Hello\n\nWorld"
```

html
```bash
awb run --title "Config" html --content '<html>...</html>'
```

plan-viewer
```bash
awb run --title "Plan" plan-viewer --file ./plan.md
```

## Background Processes with tmux

Use tmux for long-running processes. Run `awb --help` to see your tmux session name.

```bash
tmux new-session -A -d -s <session-name>
tmux new-window -t <session-name> -n "dev" "npm run dev"
tmux capture-pane -t <session-name>:dev -p
tmux send-keys -t <session-name>:dev "npm test" Enter
tmux kill-window -t <session-name>:dev
```
