# Project: mcp-sidecar

## Editor
```yaml
editor: code
type: gui
command: code
lineFormat: "-g {file}:{line}"
```

Opens files externally in VS Code. Press `e` in code viewer to open file.

## Interaction Preferences
Proactive style: Show confirmations, progress, and status frequently to keep the user informed at every step.

## When to Use Termos

### Confirmations
Use `confirm` before:
- Deleting files or directories
- Overwriting existing files
- Running deployment commands
- Database migrations
- Any destructive or irreversible action

Example:
```bash
termos run --title "Delete Files" confirm --prompt "Delete 5 files from src/old/?"
```

### Progress Tracking
Use `progress` for operations with multiple steps (3+ steps):
```bash
termos run --title "Setup" progress --steps "Install deps,Build,Test,Deploy"
```

### Code Review
Use `diff` before committing changes:
```bash
termos run --title "Review Changes" diff --file path/to/file
```

Always show diffs before:
- Committing code
- Merging branches
- Applying patches

### Data Display
Use appropriate components for structured data:
- `table` for tabular data and lists
- `json` for API responses and config files
- `chart` for metrics and statistics

Example:
```bash
termos run --title "API Response" table --data '...'
```

### Plan Mode
When entering plan mode, display the plan file:
```bash
termos run --title "Plan" plan-viewer --file <plan-path>
```

The user can approve (Y) or reject (N) directly from the TUI.

### Command Output
Run commands and display output in the TUI:
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
| ask | Quick questions/check-ins |
| plan-viewer | Plan mode display |
| code | Display file contents |
| json | API responses, configs |
