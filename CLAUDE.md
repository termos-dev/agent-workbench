# Claude IDE Project Instructions

## Auto-approve Termos Built-in Components

To allow Claude to run termos built-in components without permission prompts, add to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(termos *)"
    ]
  }
}
```

Custom `.tsx` files will still require permission. Add to `~/.claude/settings.json` for global settings.

## Local Development

For local development, use npm link:

```bash
cd /Users/burakemre/Code/ai-experiments/mcp-sidecar
npm run build
npm link
```

Then `termos` command is available globally.

## Testing

When testing from different directories, clear the plugin cache first:
```bash
rm -rf ~/.claude/plugins/cache/termos
```

Then test with Claude Code:
```bash
cd /path/to/project
# Claude will use the updated plugin
```

## Termos Interactive Components

This project uses termos for interactive UI. Read `termos.md` for interaction preferences.

Workflow:
1. `termos run ...` writes event, returns interaction ID
2. `termos wait <id>` blocks until user responds in TUI

- **USE termos components** for confirmations, progress, and user engagement
- **Show plan files** during plan mode (if enabled in termos.md)
- **Display task progress** visually for multi-step operations

Run `termos` for help, `termos run --help` for component details. Always use `--title`.
