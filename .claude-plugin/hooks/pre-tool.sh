#!/bin/bash
# AWB PreToolUse hook - updates status and writes session markers
# Consolidates pre-bash.sh functionality

INPUT=$(cat)

# Extract tool name and session info
if command -v jq &> /dev/null; then
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
else
  TOOL=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$SESSION_ID" ] || [ -z "$CWD" ] && exit 0

# For Bash commands: write active session marker (moved from pre-bash.sh)
if [ "$TOOL" = "Bash" ]; then
  ACTIVE_DIR="$HOME/.awb/markers/active"
  mkdir -p "$ACTIVE_DIR"
  ENCODED_PATH=$(echo "$CWD" | sed 's|/|-|g')
  echo "$SESSION_ID" > "$ACTIVE_DIR/$ENCODED_PATH"
fi

# Map tool to status message
case "$TOOL" in
  Bash)      STATUS="Running command..." ;;
  Read)      STATUS="Reading files..." ;;
  Edit)      STATUS="Editing code..." ;;
  Write)     STATUS="Writing file..." ;;
  Grep)      STATUS="Searching..." ;;
  Glob)      STATUS="Finding files..." ;;
  Task)      STATUS="Running agent..." ;;
  WebFetch)  STATUS="Fetching URL..." ;;
  LSP)       STATUS="Analyzing code..." ;;
  TodoWrite) STATUS="Updating todos..." ;;
  *)         STATUS="" ;;
esac

# Update status
if [ -n "$STATUS" ] && command -v awb &> /dev/null; then
  cd "$CWD" 2>/dev/null && AWB_SESSION_ID="$SESSION_ID" awb set-title "$STATUS" 2>/dev/null
fi

# Write tool_start event for state tracking
if command -v awb &> /dev/null; then
  cd "$CWD" 2>/dev/null && AWB_SESSION_ID="$SESSION_ID" awb event tool_start "$TOOL" 2>/dev/null
fi

exit 0
