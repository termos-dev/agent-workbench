# Reddit Post Draft for r/ClaudeAI

---

## Title Options (pick one):

1. **I built Termos - floating panes that keep Claude Code interactive while it works**
2. **Termos: Approve plans, review diffs, stay in control while Claude Code runs (open source)**
3. **"Autonomous, not absent" - I built a plugin so Claude Code can ask questions without blocking**

---

## Post Body (recommended version):

**The Problem**

Claude Code's `AskUserQuestion` tool blocks execution until you respond. One question at a time. Need to approve a deploy while also reviewing a diff? Everything stops.

Worse: you often have no visibility into what Claude is doing until it's done. You're trusting, not verifying.

**The Solution**

I built [Termos](https://github.com/termos-dev/termos) - a CLI + Claude Code plugin that spawns **floating terminal panes** for interactions. Claude keeps working while you review and respond in your own time.

The tagline is "Autonomous, not absent" - Claude stays autonomous, but you're never left in the dark.

```bash
# Install
claude plugins add-marketplace github:termos-dev/termos
claude plugins install termos
```

Then run `/termos:init` in Claude to configure.

**Why use it:**

- **Approve, don't hope** - Review plans, confirm deploys, approve destructive commands before they run
- **Evidence, not faith** - See diffs, test results, and data tables as Claude works. Verify before proceeding
- **Stay in sync** - Quick check-ins keep you informed. No more "wait, what did Claude just do?"
- **Side-by-side workflow** - Run a Zellij session alongside Claude with your dev servers, logs, etc.

**15 Built-in Components:**

`confirm` `ask` `checklist` `select` `diff` `code` `table` `json` `markdown` `progress` `chart` `gauge` `tree` `mermaid` `plan-viewer`

Need more? Drop custom `.tsx` Ink components in `.termos/interactive/`.

**How it works:**

```bash
# Terminal 1: Run Claude Code
claude

# Terminal 2: Attach to the termos session
termos attach
```

`/termos:init` asks about your project's background processes (dev server, API, logs) and generates a custom Zellij layout. Interactions appear as floating panes.

**Platform Support:**

- **macOS**: Native support (Ghostty or Terminal.app - floating windows)
- **Linux/Windows**: Requires [Zellij](https://zellij.dev/)

Works with any editor: VS Code, Cursor, nvim, vim, emacs, etc.

**Demo video**: https://github.com/termos-dev/termos

MIT licensed. Would love feedback!

---

## Short version (for quick sharing):

**Title:** Termos - Keep Claude Code interactive while it works

**Body:**

Built this because I got tired of Claude Code stopping every time it needed to ask me something, and having no visibility into what it was doing.

[Termos](https://github.com/termos-dev/termos) spawns floating terminal panes for interactions. Review diffs, approve deploys, check progress - all while Claude keeps working.

15 built-in components: confirm, diff, table, progress, checklist, etc. Drop custom React/Ink components for more.

```bash
claude plugins add-marketplace github:termos-dev/termos
claude plugins install termos
```

macOS native, Linux/Windows via Zellij. MIT license.

GitHub: https://github.com/termos-dev/termos

---

## Twitter/X version:

Shipped Termos - floating terminal panes for Claude Code

"Autonomous, not absent"

- Approve plans before they run
- See diffs as Claude works
- 15 components: confirm, diff, table, chart...
- Custom React/Ink components

macOS native, Linux via Zellij

https://github.com/termos-dev/termos
