---
name: awb
description: Workbench runs interactive UI components and background processes. UI: confirmations, checklists, questions, tables, code views - ALWAYS use `awb wait <id>` after. Background: `--cmd` blocks until complete, so run with `&` for dev servers and long tasks. Triggers: "show table", "ask user", "confirm before", "run server", "workbench".
---

# Workbench

## Available Components

`ask`, `confirm`, `checklist`, `select`, `table`, `code`, `diff`, `markdown`, `mermaid`, `chart`, `progress`, `gauge`, `tree`, `json`, `card`, `plan-viewer`, `html`

## Quick Reference

```bash
awb --help              # all commands
awb run --help          # component args (REQUIRED before using)
awb run --title "X" <component> [args]
awb wait <id>           # blocks until user responds, returns JSON
```

`--title` is required for all `awb run` invocations.

## Interactive Components (ALWAYS wait)

`awb run` for UI components returns immediately with an ID. You **MUST** call `awb wait <id>` to get the user's response:

```bash
ID=$(awb run --title "Q1" confirm --prompt "Approve?")
awb wait $ID  # REQUIRED - blocks until user responds
```

Fire multiple at once, then wait for each:

```bash
ID1=$(awb run --title "Q1" confirm --prompt "Approve?")
ID2=$(awb run --title "Q2" checklist --items "A,B,C")
# Continue working, then collect results:
awb wait $ID1
awb wait $ID2
```

**Anti-pattern:** Forgetting to `awb wait` - user response is lost

## Wait Results

`awb wait <id>` returns JSON with the user's response:

```json
{"confirmed": true}                    // confirm
{"items": [{"text":"A","checked":true}]}  // checklist
{"selected": "Option1"}                // select
{"answers": {"key": "value"}}          // ask
```

## Component Examples

### confirm
```bash
awb run --title "Deploy" confirm --prompt "Deploy to production?"
```

### checklist
```bash
awb run --title "Tasks" checklist --items "Build,Test,Deploy"
```

### ask (1-4 questions)
```bash
# Text input
awb run --title "Name" ask --questions '[{"question":"Your name?","header":"name"}]'

# Single choice
awb run --title "Pick" ask --questions '[{"question":"Language?","header":"lang","options":[{"label":"TypeScript"},{"label":"Python"}]}]'

# Multi-select
awb run --title "Features" ask --questions '[{"question":"Enable?","header":"feat","multiSelect":true,"options":[{"label":"Auth"},{"label":"API"}]}]'
```

### select
```bash
awb run --title "Choose" select --options "Option1,Option2,Option3"
```

### table
```bash
awb run --title "Data" table --data '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'
```

### code
```bash
awb run --title "Source" code --file ./src/index.ts
awb run --title "Snippet" code --content "console.log('hello')" --language typescript
```

### diff
```bash
awb run --title "Changes" diff --file ./changes.patch
```

### markdown
```bash
awb run --title "Docs" markdown --file ./README.md
awb run --title "Notes" markdown --content "# Hello\n\nWorld"
```

### mermaid
```bash
awb run --title "Flow" mermaid --content "graph TD; A-->B; B-->C;"
```

### progress
```bash
awb run --title "Build" progress --steps "Install,Build,Test,Deploy" --current 2
```

### chart
```bash
awb run --title "Stats" chart --data '[{"label":"Jan","value":10},{"label":"Feb","value":20}]'
```

### gauge
```bash
awb run --title "CPU" gauge --value 75 --max 100
```

### tree
```bash
awb run --title "Files" tree --path ./src
```

### json
```bash
awb run --title "Config" json --file ./package.json
```

## Running Shell Commands (Background Processes)

`--cmd` blocks until the command completes. For long-running processes, run in background with `&`:

```bash
# Short tasks (blocking is fine)
awb run --title "Build" --cmd "npm run build"

# Long-running servers - MUST use & to avoid blocking
awb run --title "Dev Server" --cmd "npm run dev" &
awb run --title "API" -- python3 -m http.server 8080 &
```
