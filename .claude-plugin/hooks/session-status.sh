#!/bin/bash
# Termos session awareness hook - runs on SessionStart
# Outputs session status to Claude's context

# Check if termos is available
if ! command -v termos &> /dev/null; then
  exit 0
fi

# Get session status
STATUS=$(termos status 2>/dev/null)

# Only output if session is running
if echo "$STATUS" | grep -q "Status: running"; then
  echo "Termos session active:"
  echo "$STATUS"
  echo ""
  echo "Use 'termos status' to refresh. Use 'zellij --session <name> action dump-screen /tmp/pane.txt' to get pane logs."
fi
