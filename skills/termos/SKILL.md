---
name: termos
description: Run Termos interactive UI components. Use when the user asks for interactive questions, confirmations, checklists, tables, code/diff/markdown/mermaid views, or any Termos UI.
---

# Termos

## Quick Start

```bash
termos run --title "Confirm" confirm --prompt "Proceed?"
termos wait <id>  # blocks until user responds
```

## REQUIRED: Learn Component Args

Before using any component, run:
```bash
termos run --help
```

This prints all component arguments. Do NOT guess argument names.

`--title` is required for all `termos run` invocations.

## Running Commands

Use `--cmd` or `-- <command>` to run shell commands:

```bash
# Run a command (blocking, captures output)
termos run --title "HTTP Server" --cmd "python3 -m http.server 8080"

# Using -- separator
termos run --title "HTTP Server" -- python3 -m http.server 8080

# Live streaming output (non-blocking)
termos run --title "Build" --live --cmd "npm run build"
```

## Async Workflow (IMPORTANT)

`termos run` returns immediately with an interaction ID. You can wait for results or check them later.

**Correct pattern:**
```bash
# Fire multiple interactions at once
termos run --title "Q1" confirm --prompt "Approve?"
termos run --title "Q2" checklist --items "A,B,C"
# Continue working, then wait for results:
termos wait <id1>
termos wait <id2>
```

**Anti-pattern (don't do this):**
- Run command → wait for result → run next command

## Ask component

The `ask` component displays 1-4 questions at once. All questions are visible and navigable with Tab/Shift+Tab.

Single question (text input):
```bash
termos run --title "Question" ask --questions '[{"question":"What is your name?","header":"name","placeholder":"Enter your name..."}]'
```

Single question with choices:
```bash
termos run --title "Question" ask --questions '[{"question":"Favorite language?","header":"lang","options":[{"label":"TypeScript"},{"label":"Python"},{"label":"Go"}]}]'
```

Multiple questions at once:
```bash
termos run --title "Setup" ask --questions '[{"question":"Auth method?","header":"auth","options":[{"label":"OAuth","description":"Industry standard"},{"label":"JWT","description":"Stateless"}]},{"question":"Database?","header":"db","options":[{"label":"PostgreSQL"},{"label":"MongoDB"}]}]'
```

Multi-select (checkboxes):
```bash
termos run --title "Features" ask --questions '[{"question":"Select features","header":"features","multiSelect":true,"options":[{"label":"Auth"},{"label":"API"},{"label":"Dashboard"}]}]'
```
