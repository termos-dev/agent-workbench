# Claude IDE Project Instructions

## Auto-approve Agent Workbench Built-in Components

To allow Claude to run awb built-in components without permission prompts, add to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(awb *)"
    ]
  }
}
```

Custom `.tsx` files will still require permission. Add to `~/.claude/settings.json` for global settings.

## Local Development

For local development, use npm link:

```bash
cd /Users/burakemre/Code/ai-experiments/agent-workbench
npm run build
npm link
```

Then `awb` command is available globally.

## Testing

When testing from different directories, clear the plugin cache first:
```bash
rm -rf ~/.claude/plugins/cache/awb
```

Then test with Claude Code:
```bash
cd /path/to/project
# Claude will use the updated plugin
```

## Agent Workbench Interactive Components

This project uses awb for interactive UI. Read `awb.md` for interaction preferences.

Workflow:
1. `awb run ...` writes event, returns interaction ID
2. `awb wait <id>` blocks until user responds in playground

- **USE awb components** for confirmations, progress, and user engagement
- **Show plan files** during plan mode (if enabled in awb.md)
- **Display task progress** visually for multi-step operations

Run `awb` for help, `awb run --help` for component details. Always use `--title`.
