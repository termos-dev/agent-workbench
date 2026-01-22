---
allowed-tools: Bash, AskUserQuestion, Write, Read
description: Initialize termos.md with project-specific settings and preferences
---

Initialize termos.md with project-specific instructions and preferences.

# Termos Init

Generate a `termos.md` file in the project root with project-specific instructions.

## Step 0: Check for Existing termos.md

```bash
if [ -f "termos.md" ]; then
  echo "EXISTING_CONFIG=yes"
  cat termos.md
else
  echo "EXISTING_CONFIG=no"
fi
```

If `termos.md` exists, parse current settings to use as defaults.

## Step 1: Environment Detection

```bash
# Detect available editors
EDITORS=""

# TUI editors
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
| nvim | TUI | `nvim` | `+{line}` |
| vim | TUI | `vim` | `+{line}` |
| hx | TUI | `hx` | `{file}:{line}` |
| code | GUI | `code` | `-g {file}:{line}` |
| cursor | GUI | `cursor` | `-g {file}:{line}` |

### Question 2: Interaction Style
- **Proactive**: Show confirmations, progress, and status frequently
- **Minimal**: Only show interactions when essential
- **Balanced**: Show for important decisions, skip trivial ones

### Question 3: Use Cases (multi-select)
- **Confirmations**: Before destructive actions (delete, overwrite, deploy)
- **Multi-step tasks**: Show progress for long-running operations
- **Code review**: Show diffs before commits
- **Data display**: Tables, charts, JSON viewers

### Question 4: Plan Mode Display
- **Yes (Recommended)**: Display plan file during plan mode
- **No**: Keep plans in the editor only

## Step 3: Generate termos.md

Based on answers, generate `termos.md`:

```markdown
# Project: {project_name}

## Editor
```yaml
editor: {editor}
type: {tui|gui}
command: {editor_command}
lineFormat: "{line_format}"
```

Opens files externally in {editor}. Press `e` in code viewer to open file.

## Interaction Preferences
{based on style choice}

## When to Use Termos

### Confirmations
{if selected: Use `confirm` before destructive actions.}

Example:
```bash
termos run --title "Delete Files" confirm --prompt "Delete 5 files?"
```

### Progress Tracking
{if selected: Use `progress` for multi-step tasks.}

Example:
```bash
termos run --title "Setup" progress --steps "Install deps,Build,Test,Deploy"
```

### Code Review
{if selected: Use `diff` before committing changes.}

Example:
```bash
termos run --title "Review Changes" diff --file path/to/file
```

### Data Display
{if selected: Use `table`, `json`, `chart` for structured data.}

### Plan Mode
{if selected: Display plan file during plan mode:}
```bash
termos run --title "Plan" plan-viewer --file <plan-path>
```

### Command Output
Run commands and display output:
```bash
termos run --title "Git Status" --cmd "git status"
```

## Quick Reference

| Component | Use Case |
|-----------|----------|
| confirm | Before destructive actions |
| progress | Multi-step operations |
| diff | Code review before commits |
| table | Structured data display |
| ask | Multi-question forms (1-4 questions) |
| code | Display file contents |
| json | API responses, configs |
```

## Step 4: Write the File

Write `termos.md` to the project root.

Confirm with user before writing:
```bash
termos run --title "Confirm" confirm --prompt "Create termos.md with these settings?"
```

## Step 5: Update CLAUDE.md

If `CLAUDE.md` exists, append termos instructions:

```bash
if [ -f "CLAUDE.md" ]; then
  cat >> CLAUDE.md << 'EOF'

## Termos Interactive Components

This project uses termos for interactive UI. Read `termos.md` for interaction preferences.

Workflow:
1. `termos run ...` writes event, returns interaction ID
2. `termos wait <id>` blocks until user responds in TUI

- **USE termos components** for confirmations, progress, and user engagement
- **Show plan files** during plan mode (if enabled in termos.md)
- **Display task progress** visually for multi-step operations

Run `termos` for help, `termos run --help` for component details. Always use `--title`.
EOF
fi
```

## Step 6: Final Output

```
Termos initialized!

Created files:
- termos.md (interaction preferences)

Usage:
  termos tui     # Launch TUI to respond to interactions
  termos         # Show help

Run `termos run --help` for all available components.
```
