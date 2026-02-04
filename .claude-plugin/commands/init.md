---
allowed-tools: Bash, AskUserQuestion, Write, Read
description: Initialize awb.md with project-specific settings and preferences
---

Initialize awb.md with project-specific instructions and preferences.

# Agent Workbench Init

Generate a `awb.md` file in the project root with project-specific instructions.

## Step 0: Check for Existing awb.md

```bash
if [ -f "awb.md" ]; then
  echo "EXISTING_CONFIG=yes"
  cat awb.md
else
  echo "EXISTING_CONFIG=no"
fi
```

If `awb.md` exists, parse current settings to use as defaults.

## Step 1: Environment Detection

```bash
# Detect available editors
EDITORS=""

# Terminal editors
which nvim > /dev/null 2>&1 && EDITORS="$EDITORS nvim"
which vim > /dev/null 2>&1 && EDITORS="$EDITORS vim"
which hx > /dev/null 2>&1 && EDITORS="$EDITORS hx"

# GUI editors
which code > /dev/null 2>&1 && EDITORS="$EDITORS code"
which cursor > /dev/null 2>&1 && EDITORS="$EDITORS cursor"

# macOS app detection
[ -d "/Applications/Visual Studio Code.app" ] && ! echo "$EDITORS" | grep -q "code" && EDITORS="$EDITORS code"
[ -d "/Applications/Cursor.app" ] && ! echo "$EDITORS" | grep -q "cursor" && EDITORS="$EDITORS cursor"

echo "Editors:$EDITORS"
```

## Step 2: Ask User Preferences

Use AskUserQuestion to gather preferences.

### Question 1: Preferred Editor
Based on detected editors, ask which editor they prefer for opening files.

Editor reference:
| Editor | Type | Command | Line Format |
|--------|------|---------|-------------|
| nvim | Terminal | `nvim` | `+{line}` |
| vim | Terminal | `vim` | `+{line}` |
| hx | Terminal | `hx` | `{file}:{line}` |
| code | GUI | `code` | `-g {file}:{line}` |
| cursor | GUI | `cursor` | `-g {file}:{line}` |

### Question 2: Interaction Style
- **Proactive**: Show confirmations and status frequently
- **Minimal**: Only show interactions when essential
- **Balanced**: Show for important decisions, skip trivial ones

### Question 3: Use Cases (multi-select)
- **Confirmations**: Before destructive actions (delete, overwrite, deploy)
- **File viewing**: Show code/markdown files in the playground
- **Data display**: Tables for structured data

### Question 4: Plan Mode Display
- **Yes (Recommended)**: Display plan file during plan mode
- **No**: Keep plans in the editor only

## Step 3: Generate awb.md

Based on answers, generate `awb.md`:

```markdown
# Project: {project_name}

## Editor
```yaml
editor: {editor}
type: {terminal|gui}
command: {editor_command}
lineFormat: "{line_format}"
```

Opens files externally in {editor}. Press `e` in code viewer to open file.

## Interaction Preferences
{based on style choice}

## When to Use Agent Workbench

### Confirmations
{if selected: Use `confirm` before destructive actions.}

Example:
```bash
awb run --title "Delete Files" confirm --prompt "Delete 5 files?"
```

### Data Display
{if selected: Use `table` for structured data.}

### File Viewing
{if selected: Use `code` or `markdown` to show files in the playground.}

Example:
```bash
awb run --title "Source" code --file path/to/file
```

### Plan Mode
{if selected: Display plan file during plan mode:}
```bash
awb run --title "Plan" plan-viewer --file <plan-path>
```

### Background Processes with tmux
For long-running processes, use tmux directly:
```bash
tmux new-window -t <session> -n "dev" "npm run dev"
tmux capture-pane -t <session>:dev -p              # Get output
```
Run `awb --help` to see your tmux session name.

## Quick Reference

| Component | Use Case |
|-----------|----------|
| confirm | Before destructive actions |
| table | Structured data display |
| ask | Multi-question forms (1-4 questions) |
| code | Display file contents |
| html | Interactive HTML playgrounds |
| markdown | Render markdown content |
| plan-viewer | Plan mode display |
```

## Step 4: Write the File

Write `awb.md` to the project root.

Confirm with user before writing:
```bash
awb run --title "Confirm" confirm --prompt "Create awb.md with these settings?"
```

## Step 5: Update CLAUDE.md

If `CLAUDE.md` exists, append awb instructions:

```bash
if [ -f "CLAUDE.md" ]; then
  cat >> CLAUDE.md << 'EOF'

## Agent Workbench Interactive Components

This project uses awb for interactive UI. Read `awb.md` for interaction preferences.

Workflow:
1. `awb run ...` writes event, returns interaction ID
2. `awb wait <id>` blocks until user responds in playground

- **USE awb components** for confirmations and user engagement
- **Show plan files** during plan mode (if enabled in awb.md)

Run `awb` for help, `awb run --help` for component details. Always use `--title`.
EOF
fi
```

## Step 6: Final Output

```
Agent Workbench initialized!

Created files:
- awb.md (interaction preferences)

Usage:
  awb ui      # Launch playground to respond to interactions
  awb         # Show help

Run `awb run --help` for all available components.
```
