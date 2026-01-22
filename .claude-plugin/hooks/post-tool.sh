#!/bin/bash
# Termos PostToolUse hook - resets status and writes tool_end event

INPUT=$(cat)

# Extract session info and tool name
if command -v jq &> /dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  TOOL=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$SESSION_ID" ] || [ -z "$CWD" ] && exit 0

# Write tool_end event for state tracking
if command -v termos &> /dev/null; then
  cd "$CWD" 2>/dev/null && TERMOS_SESSION_ID="$SESSION_ID" termos event tool_end "$TOOL" 2>/dev/null
fi

exit 0
