#!/bin/bash
# Termos SessionEnd hook - marks session as ended

INPUT=$(cat)

# Extract session_id
if command -v jq &> /dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$SESSION_ID" ] && exit 0

# Write ended marker
mkdir -p "$HOME/.termos/markers/ended"
date -u +%Y-%m-%dT%H:%M:%S.000Z > "$HOME/.termos/markers/ended/$SESSION_ID"

# Clean up idle and plan-mtime markers
rm -f "$HOME/.termos/markers/idle/$SESSION_ID"
rm -f "$HOME/.termos/markers/plan-mtime/$SESSION_ID"

exit 0
