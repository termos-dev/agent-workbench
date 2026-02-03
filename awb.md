# Project: agent-workbench

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

## When to Use Agent Workbench

### Confirmations
Use `confirm` before:
- Deleting files or directories
- Overwriting existing files
- Running deployment commands
- Database migrations
- Any destructive or irreversible action

Example:
```bash
awb run --title "Delete Files" confirm --prompt "Delete 5 files from src/old/?"
```

### Progress Tracking
Use `progress` for operations with multiple steps (3+ steps):
```bash
awb run --title "Setup" progress --steps "Install deps,Build,Test,Deploy"
```

### Code Review
Use `diff` before committing changes:
```bash
awb run --title "Review Changes" diff --file path/to/file
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
awb run --title "API Response" table --data '...'
```

### Plan Mode
In plan mode, commands cannot execute. Use native `AskUserQuestion` tool for clarifications during planning.

After writing the plan, display it for approval:
```bash
awb run --title "Plan" plan-viewer --file <plan-path>
```

The user can approve (Y) or reject (N) directly from the playground.

### Command Output
Run commands and display output in the playground:
```bash
awb run --title "Git Status" --cmd "git status"
```

## Quick Reference

| Component | Use Case |
|-----------|----------|
| confirm | Before destructive actions |
| ask | Quick questions/check-ins (1-4) |
| checklist | Interactive task lists |
| select | Single-item picker |
| progress | Multi-step operations |
| diff | Code review before commits |
| code | Display file contents (press 'e' to edit) |
| table | Structured data display |
| json | API responses, configs |
| markdown | Render markdown content |
| chart | Terminal charts (bar, sparkline, line) |
| gauge | Visual meter/progress |
| tree | Directory tree viewer |
| mermaid | ASCII diagrams |
| card | Markdown with action buttons |
| plan-viewer | Plan mode display |
