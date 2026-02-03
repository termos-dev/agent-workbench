---
allowed-tools: Bash
description: Open awb web playground for floating interaction panels
---

Use this skill when the user wants to open the awb web playground or needs a visual interface for interactions.

# Agent Workbench Web Playground

Opens a web-based playground with floating panels for Claude interactions.

## Usage

```bash
awb ui --open
```

This will:
1. Start the UI server (serves pre-built React bundle)
2. Auto-open browser to http://localhost:3847
3. Display floating panels for any pending interactions

## How It Works

- Interactions created with `awb run <component>` appear as floating panels
- User responds in the playground, panels dismiss automatically
- WebSocket connection keeps UI in sync with session state

## When to Use

- User explicitly asks to open the playground
- User prefers visual/graphical interface
- Multi-monitor setup where playground can run on separate screen

## Now

If the user wants to open the web playground, run:
```bash
awb ui --open
```
