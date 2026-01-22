#!/bin/bash
# Termos Stop hook - marks agent as idle, checks for messages and plan changes

INPUT=$(cat)

# Extract session_id and cwd
if command -v jq &> /dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$SESSION_ID" ] && exit 0

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Write idle marker
MARKERS_DIR="$HOME/.termos/markers/idle"
mkdir -p "$MARKERS_DIR"
if command -v jq &> /dev/null; then
  jq -n --arg ts "$TIMESTAMP" --arg cwd "${CWD:-unknown}" \
    '{timestamp: $ts, cwd: $cwd}' > "$MARKERS_DIR/$SESSION_ID"
else
  echo "{\"timestamp\":\"$TIMESTAMP\",\"cwd\":\"${CWD:-unknown}\"}" > "$MARKERS_DIR/$SESSION_ID"
fi

# Write stop event for state tracking
if command -v termos &> /dev/null && [ -n "$CWD" ]; then
  cd "$CWD" 2>/dev/null && TERMOS_SESSION_ID="$SESSION_ID" termos event stop 2>/dev/null
fi

# Check for pending messages
if command -v termos &> /dev/null && [ -n "$CWD" ]; then
  cd "$CWD" 2>/dev/null && {
    PENDING=$(termos listen --count 2>/dev/null || echo "0")
    if [ "$PENDING" -gt 0 ]; then
      echo "[termos] $PENDING pending message(s) from dashboard." >&2
    fi
  }
fi

# Check for plan file changes
PLAN_DIR="$HOME/.claude/plans"
MTIME_FILE="$HOME/.termos/markers/plan-mtime/$SESSION_ID"

if [ -d "$PLAN_DIR" ]; then
  mkdir -p "$(dirname "$MTIME_FILE")"

  # Get last check time (seconds since epoch)
  LAST_CHECK=0
  if [ -f "$MTIME_FILE" ]; then
    LAST_CHECK=$(cat "$MTIME_FILE" 2>/dev/null || echo "0")
  fi

  # Current time
  NOW=$(date +%s)

  # Check if any .md file in plans dir was modified since last check
  PLAN_CHANGED=""
  for f in "$PLAN_DIR"/*.md; do
    [ -f "$f" ] || continue
    # Get file mtime (portable across macOS/Linux)
    if stat -f %m "$f" &>/dev/null; then
      FMTIME=$(stat -f %m "$f")  # macOS
    else
      FMTIME=$(stat -c %Y "$f" 2>/dev/null || echo "0")  # Linux
    fi
    if [ "$FMTIME" -gt "$LAST_CHECK" ]; then
      PLAN_CHANGED=$(basename "$f")
      break
    fi
  done

  # Update last check time
  echo "$NOW" > "$MTIME_FILE"

  # Notify if plan changed
  if [ -n "$PLAN_CHANGED" ]; then
    echo "[termos] Plan file modified: $PLAN_CHANGED" >&2
    echo "[termos] Review the updated plan before continuing." >&2
  fi
fi

exit 0
