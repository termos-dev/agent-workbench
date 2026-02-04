#!/bin/bash
# AWB SessionStart hook - shows tmux session info for this directory

INPUT=$(cat)

# Extract cwd
if command -v jq &> /dev/null; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
else
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$CWD" ] && exit 0

# Only show if awb is available
command -v awb &> /dev/null || exit 0

cd "$CWD" 2>/dev/null || exit 0

# Get tmux session name
SESSION=$(awb --help 2>&1 | grep "tmux session for this directory:" | sed 's/.*: //')

if [ -n "$SESSION" ]; then
  echo "[awb] tmux session: $SESSION" >&2
  echo "[awb] Use: tmux new-window -t $SESSION -n \"name\" \"command\"" >&2
fi

exit 0
