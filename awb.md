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

### Data Display
Use `table` for structured data display:
```bash
awb run --title "API Response" table --data '[{"name":"Alice","age":30}]'
```

### Plan Mode
In plan mode, commands cannot execute. Use native `AskUserQuestion` tool for clarifications during planning.

After writing the plan, display it for approval:
```bash
awb run --title "Plan" plan-viewer --file <plan-path>
```

The user can approve (Y) or reject (N) directly from the playground.

### Background Processes with tmux

For long-running processes (dev servers, watchers, builds), use tmux directly. The playground auto-discovers and displays tmux windows.

**Get your tmux session name:**
```bash
awb --help  # Shows tmux session name for current directory
```

**Create and manage background processes:**
```bash
# Ensure session exists (idempotent - safe to run multiple times)
tmux new-session -A -d -s <session-name>

# Start a dev server in a new window
tmux new-window -t <session-name> -n "dev" "npm run dev"

# Start another process
tmux new-window -t <session-name> -n "build" "npm run build --watch"

# List windows
tmux list-windows -t <session-name>

# Kill a window when done
tmux kill-window -t <session-name>:dev
```

**Capture output (no PTY needed):**
```bash
# Get current pane content
tmux capture-pane -t <session-name>:dev -p

# Get last 100 lines of output
tmux capture-pane -t <session-name>:dev -p -S -100

# Send input to a running process
tmux send-keys -t <session-name>:dev "npm test" Enter
```

**Why tmux?**
- Processes survive terminal disconnects
- User can interact directly via `tmux attach`
- Playground auto-shows all tmux windows as interactive terminals

**Tips:**
- Use descriptive window names (`-n "dev"`, `-n "test"`)
- All agents in the same directory share the same tmux session
- The playground will show tmux windows as tabs with terminal output

### User Messages (Playground → Agent)

Users can send messages from the playground to notify or wake the agent:
- Messages appear in the playground chat input
- The agent-idle hook automatically checks for pending messages
- Hook notifies: `[awb] N pending message(s) from playground.`
- Just read the message and respond - no special commands needed

## Interactive HTML Playgrounds

Use `html` to create interactive UI experiences where users can configure options and submit results back to the agent.

### window.awb API

HTML content automatically has access to the `window.awb` API:

**awb.submit(data)** - Send data back to the agent:
```javascript
// User clicks a button to confirm their selection
awb.submit({
  theme: selectedTheme,
  options: { darkMode: true, fontSize: 14 }
});
```

**awb.copyToClipboard(text, button)** - Copy with visual feedback:
```javascript
<button onclick="awb.copyToClipboard(generatedCode, this)">Copy</button>
```

### Example: Configuration Playground

```bash
awb run --title "Theme Config" html --content '<!DOCTYPE html>
<html>
<head><style>
  body { font-family: system-ui; padding: 20px; background: #1a1a2e; color: #eee; }
  button { padding: 10px 20px; margin: 5px; cursor: pointer; }
  .selected { border: 2px solid #4CAF50; }
</style></head>
<body>
  <h2>Select Theme</h2>
  <button onclick="selectTheme(this, \"light\")">Light</button>
  <button onclick="selectTheme(this, \"dark\")">Dark</button>
  <button onclick="awb.submit({theme: selectedTheme})" style="margin-top: 20px;">Confirm</button>
  <script>
    let selectedTheme = "light";
    function selectTheme(btn, theme) {
      document.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTheme = theme;
    }
  </script>
</body>
</html>'
```

The `awb wait` command returns the submitted data:
```json
{"action": "accept", "result": {"theme": "dark"}}
```

## Quick Reference

| Component | Use Case |
|-----------|----------|
| confirm | Before destructive actions |
| ask | Quick questions/check-ins (1-4) |
| checklist | Interactive task lists |
| code | Display file contents (press 'e' to edit) |
| table | Structured data display |
| markdown | Render markdown content |
| html | Interactive HTML playgrounds |
| plan-viewer | Plan mode display |
