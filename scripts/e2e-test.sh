#!/bin/bash
set -e

# E2E Test Script for Termos
# Automatically uses Zellij (creates session if needed) or runs in Docker

USE_DOCKER=false
TEST_PATH="."
SESSION_NAME="termos-e2e"
PROMPT=""
RECORD=false
RECORD_OUTPUT="demo.cast"
HEADLESS=false
SCREENSHOTS=false
COLS=120
ROWS=40

while [[ $# -gt 0 ]]; do
  case $1 in
    --docker)
      USE_DOCKER=true
      shift
      ;;
    --path)
      TEST_PATH="$2"
      shift 2
      ;;
    --session|-s)
      SESSION_NAME="$2"
      shift 2
      ;;
    --prompt|-p)
      PROMPT="$2"
      shift 2
      ;;
    --record|-r)
      RECORD=true
      shift
      ;;
    --output|-o)
      RECORD_OUTPUT="$2"
      shift 2
      ;;
    --headless|-H)
      HEADLESS=true
      shift
      ;;
    --screenshots)
      SCREENSHOTS=true
      shift
      ;;
    --cols)
      COLS="$2"
      shift 2
      ;;
    --rows)
      ROWS="$2"
      shift 2
      ;;
    *)
      # Treat as prompt if not a flag
      if [[ ! "$1" =~ ^-- ]]; then
        PROMPT="$1"
      fi
      shift
      ;;
  esac
done

TMUX_SESSION="termos-tmux-$$"
ZELLIJ_SESSION="$SESSION_NAME"

# Check if we're inside Zellij
in_zellij() {
  [ -n "$ZELLIJ_SESSION_NAME" ]
}

# Dismiss Zellij welcome/onboarding screens
dismiss_zellij_welcome() {
  for i in {1..20}; do
    zellij action dump-screen /tmp/zellij-screen.txt 2>/dev/null || true
    if grep -qE "Welcome to Zellij|Release Notes" /tmp/zellij-screen.txt 2>/dev/null; then
      zellij action write-chars $'\e' 2>/dev/null || true
      sleep 0.3
      continue
    fi
    if grep -q "Choose the text style" /tmp/zellij-screen.txt 2>/dev/null; then
      zellij action write-chars '1' 2>/dev/null || true
      zellij action write-chars $'\r' 2>/dev/null || true
      sleep 0.3
      continue
    fi
    break
  done
  rm -f /tmp/zellij-screen.txt
}

# Wait for Claude to be ready and dismiss first-run screens
wait_for_claude() {
  echo "Waiting for Claude to be ready..."
  for i in {1..60}; do
    zellij action dump-screen /tmp/claude-screen.txt 2>/dev/null || true

    # Dismiss first-run screens
    if grep -qE "Security notes|Press .*Enter.*to continue" /tmp/claude-screen.txt 2>/dev/null; then
      zellij action write-chars $'\r' 2>/dev/null || true
      sleep 0.3
      continue
    fi
    if grep -qE "Ready to code|permission to work|Yes, continue" /tmp/claude-screen.txt 2>/dev/null; then
      zellij action write-chars '1' 2>/dev/null || true
      zellij action write-chars $'\r' 2>/dev/null || true
      sleep 0.3
      continue
    fi
    if grep -qE "Choose the text style|Welcome to Claude" /tmp/claude-screen.txt 2>/dev/null; then
      zellij action write-chars '1' 2>/dev/null || true
      zellij action write-chars $'\r' 2>/dev/null || true
      sleep 0.3
      continue
    fi

    # Check if Claude is ready
    if grep -qE "^> |^› |^❯ |Recent activity|Welcome back|Claude Code" /tmp/claude-screen.txt 2>/dev/null; then
      rm -f /tmp/claude-screen.txt
      echo "Claude is ready."
      return 0
    fi
    sleep 0.5
  done
  rm -f /tmp/claude-screen.txt
  echo "Warning: Claude prompt not detected, continuing anyway..."
  return 0
}

# Verify floating pane appeared in layout (only works when run FROM WITHIN Zellij)
verify_pane_in_layout() {
  local pane_name="$1"
  # Only verify if we're actually inside a Zellij client (not just session name set)
  if [ -z "$ZELLIJ" ]; then
    # Outside Zellij client - can't verify layout, just return success
    return 0
  fi
  sleep 1
  layout=$(timeout 3 zellij action dump-layout 2>/dev/null || true)
  if echo "$layout" | grep -q "name=\"$pane_name\""; then
    return 0
  fi
  return 1
}

# Run tests (called from within Zellij or native mode)
run_tests() {
  echo ""
  echo "Running Termos E2E Tests..."
  if [ -n "$ZELLIJ" ]; then
    echo "Mode: Zellij (with layout verification)"
  else
    echo "Mode: Native/Ghostty (output verification only)"
  fi
  echo "=========================================="

  local failed=0
  local passed=0
  local verify_msg=""
  [ -n "$ZELLIJ" ] && verify_msg=" + layout verified" || verify_msg=""

  echo -n "Test 1: --cmd execution... "
  result=$(termos run --title "E2E-CMD" --cmd "echo hello" 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-CMD"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 2: confirm component... "
  result=$(termos run confirm --title "E2E-Confirm" --prompt "Test?" 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-Confirm"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 3: checklist component... "
  result=$(termos run checklist --title "E2E-Checklist" --items '["A","B"]' 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-Checklist"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 4: table component... "
  result=$(termos run table --title "E2E-Table" --data '[{"x":1}]' 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-Table"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 5: progress component... "
  result=$(termos run progress --title "E2E-Progress" --steps '["Step 1"]' 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-Progress"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 6: code component... "
  result=$(termos run code --title "E2E-Code" --file package.json 2>&1)
  if echo "$result" | grep -q '"status":"started"' && verify_pane_in_layout "E2E-Code"; then
    echo "✓ PASS${verify_msg}"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo ""
  echo "=========================================="
  echo "Results: $passed passed, $failed failed"
  [ -z "$ZELLIJ" ] && echo "Note: Run inside Zellij for full layout verification"
  echo "=========================================="

  [ "$failed" -eq 0 ]
}

#######################################
# SCREENSHOT MODE
# Captures SVG screenshots of all components
#######################################
capture_component() {
  local name="$1"
  local cmd="$2"
  local output="docs/images/components/${name}.svg"
  local cast_file="/tmp/${name}.cast"

  # Use termtosvg to record the component directly to SVG
  # Run in a subshell with timeout
  if command -v termtosvg >/dev/null 2>&1; then
    # termtosvg records directly to SVG
    timeout 5 termtosvg --still-frame -g 100x24 "$output" \
      -c "bash -c '$cmd --position inline 2>/dev/null || $cmd 2>/dev/null; sleep 1'" 2>/dev/null || true
  else
    # Fallback: use asciinema + svg-term
    asciinema rec --overwrite --cols 100 --rows 24 \
      -c "bash -c '$cmd --position inline 2>/dev/null || $cmd 2>/dev/null; sleep 1'" \
      "$cast_file" 2>/dev/null || true

    # Convert to SVG (at 1000ms to capture rendered state)
    if command -v svg-term >/dev/null 2>&1; then
      svg-term --in "$cast_file" --out "$output" --at 1000 \
        --window --no-cursor --padding 16 --padding-x 20 --padding-y 16 2>/dev/null || {
        echo "  ⚠ svg-term failed for $name"
      }
    fi
  fi

  if [ -f "$output" ]; then
    echo "✓ $name"
  else
    echo "⚠ $name (no output)"
  fi
}

capture_screenshots() {
  echo ""
  echo "Capturing Component Screenshots"
  echo "=========================================="

  # Ensure output directory exists
  mkdir -p docs/images/components

  # Check for svg-term
  if ! command -v svg-term >/dev/null 2>&1; then
    echo "⚠ svg-term-cli not installed. Install with: npm install -g svg-term-cli"
    echo "  Continuing anyway, will save .cast files..."
  fi

  echo ""

  # Capture each component with sample data
  capture_component "confirm" "termos run confirm --title 'Deploy' --prompt 'Deploy to production?'"
  capture_component "ask" "termos run ask --title 'Name' --prompt 'What is your name?'"
  capture_component "checklist" "termos run checklist --title 'Tasks' --items '[\"Build application\",\"Run tests\",\"Deploy to staging\",\"Notify team\"]'"
  capture_component "select" "termos run select --title 'Choose' --prompt 'Select environment' --items '[\"Development\",\"Staging\",\"Production\"]'"
  capture_component "table" "termos run table --title 'Users' --data '[{\"name\":\"Alice\",\"role\":\"Admin\",\"status\":\"Active\"},{\"name\":\"Bob\",\"role\":\"User\",\"status\":\"Active\"},{\"name\":\"Charlie\",\"role\":\"User\",\"status\":\"Inactive\"}]'"
  capture_component "progress" "termos run progress --title 'Build' --steps '[\"Installing dependencies\",\"Compiling TypeScript\",\"Running tests\",\"Building bundle\"]'"
  capture_component "code" "termos run code --title 'Code' --content 'function hello(name: string) {\n  console.log(\"Hello, \" + name);\n}\n\nhello(\"World\");' --lang typescript"
  capture_component "diff" "termos run diff --title 'Changes' --content '--- a/config.ts\n+++ b/config.ts\n@@ -1,3 +1,4 @@\n export const config = {\n   port: 3000,\n+  debug: true,\n };'"
  capture_component "markdown" "termos run markdown --title 'Docs' --content '# Welcome\n\nThis is **bold** and *italic* text.\n\n- Item 1\n- Item 2\n\n\`\`\`js\nconsole.log(\"hi\");\n\`\`\`'"
  capture_component "mermaid" "termos run mermaid --title 'Flow' --content 'graph LR\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]'"
  capture_component "chart" "termos run chart --title 'Stats' --type bar --data '[{\"label\":\"Mon\",\"value\":10},{\"label\":\"Tue\",\"value\":25},{\"label\":\"Wed\",\"value\":15},{\"label\":\"Thu\",\"value\":30},{\"label\":\"Fri\",\"value\":20}]'"
  capture_component "json" "termos run json --title 'Data' --data '{\"user\":{\"name\":\"Alice\",\"email\":\"alice@example.com\"},\"settings\":{\"theme\":\"dark\",\"notifications\":true}}'"
  capture_component "tree" "termos run tree --title 'Files' --data '{\"src\":{\"index.ts\":null,\"utils\":{\"helper.ts\":null,\"format.ts\":null}},\"package.json\":null}'"
  capture_component "gauge" "termos run gauge --title 'CPU' --value 75 --max 100 --label 'CPU Usage'"
  capture_component "plan-viewer" "termos run plan-viewer --title 'Plan' --file README.md"

  echo ""
  echo "=========================================="
  echo "Screenshots saved to docs/images/components/"
  echo "=========================================="
}

if [ "$SCREENSHOTS" = true ]; then
  cd "$TEST_PATH"

  # Build termos if needed
  if ! command -v termos >/dev/null 2>&1; then
    echo "Building termos..."
    npm run build --silent 2>&1 | tail -1
    npm link --silent 2>&1 | tail -1
  fi

  capture_screenshots
  exit 0
fi

#######################################
# DOCKER MODE
#######################################
if [ "$USE_DOCKER" = true ]; then
  echo "Setting up Docker environment..."

  docker build -f Dockerfile.test -t termos-test . >/dev/null 2>&1
  docker rm -f termos-test 2>/dev/null || true
  docker run -d -v "$(pwd)":/workspace -w /workspace --name termos-test termos-test sleep infinity >/dev/null

  echo "Installing dependencies..."
  docker exec termos-test bash -c 'npm install --silent && npm run build --silent && npm link --silent' 2>&1 | tail -1

  # Run tests via Zellij inside Docker
  docker exec -it termos-test bash -c "
    zellij attach --create $SESSION_NAME &
    sleep 2
    export ZELLIJ_SESSION_NAME=$SESSION_NAME
    # Run tests here
  "

  echo ""
  echo "Cleanup: docker rm -f termos-test"
  exit 0
fi

#######################################
# LOCAL MODE
#######################################
cd "$TEST_PATH"

# Build termos if needed
if ! command -v termos >/dev/null 2>&1; then
  echo "Building termos..."
  npm run build --silent 2>&1 | tail -1
  npm link --silent 2>&1 | tail -1
fi

# If already in Zellij, just run tests
if in_zellij; then
  echo "Already in Zellij session: $ZELLIJ_SESSION_NAME"
  run_tests
  exit $?
fi

#######################################
# HEADLESS MODE (tmux → zellij → claude)
# Use this from non-TTY environments like Claude Code
#######################################
if [ "$HEADLESS" = true ]; then
  echo "Headless mode: tmux → zellij → claude"
  echo "=========================================="

  # Cleanup function
  cleanup_headless() {
    echo "Cleaning up..."
    tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
    zellij kill-session "$ZELLIJ_SESSION" 2>/dev/null || true
  }
  trap cleanup_headless EXIT

  # Kill any existing sessions
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  zellij kill-session "$ZELLIJ_SESSION" 2>/dev/null || true
  sleep 1

  # Create tmux session
  echo "Creating tmux session: $TMUX_SESSION"
  tmux new-session -d -s "$TMUX_SESSION" -x "$COLS" -y "$ROWS"

  # Start zellij inside tmux
  echo "Starting zellij session: $ZELLIJ_SESSION"
  tmux send-keys -t "$TMUX_SESSION" "cd $(pwd) && zellij --session $ZELLIJ_SESSION" Enter
  sleep 3

  # Dismiss zellij welcome screen
  tmux send-keys -t "$TMUX_SESSION" Escape
  sleep 1

  # Start Claude
  echo "Starting Claude..."
  tmux send-keys -t "$TMUX_SESSION" "claude --dangerously-skip-permissions" Enter

  # Wait for Claude to be ready
  echo "Waiting for Claude to be ready..."
  for i in {1..30}; do
    screen=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null || true)
    if echo "$screen" | grep -qE "^> |^› |Claude Code"; then
      echo "Claude is ready."
      break
    fi
    sleep 1
  done

  # Inject prompt if provided
  if [ -n "$PROMPT" ]; then
    echo "Injecting prompt..."
    sleep 2
    tmux send-keys -t "$TMUX_SESSION" "$PROMPT"
    sleep 1
    tmux send-keys -t "$TMUX_SESSION" Enter
    # Press Enter again to make sure it submits
    sleep 1
    tmux send-keys -t "$TMUX_SESSION" Enter
  fi

  echo ""
  echo "=========================================="
  echo "Session ready!"
  echo ""
  echo "View output:  tmux capture-pane -t $TMUX_SESSION -p"
  echo "Attach:       tmux attach -t $TMUX_SESSION"
  echo "Kill:         tmux kill-session -t $TMUX_SESSION"
  echo "=========================================="

  # If recording, attach with asciinema
  if [ "$RECORD" = true ]; then
    echo ""
    echo "Recording to: $RECORD_OUTPUT"
    echo "Detach with Ctrl+B then D when done."
    echo ""
    asciinema rec \
      --overwrite \
      --cols "$COLS" \
      --rows "$ROWS" \
      -c "tmux attach -t $TMUX_SESSION" \
      "$RECORD_OUTPUT"
    echo ""
    echo "Recording saved to: $RECORD_OUTPUT"
    exit 0
  fi

  # Otherwise wait for user to attach or timeout
  echo ""
  echo "Run 'tmux attach -t $TMUX_SESSION' to interact."
  echo "Session will auto-cleanup in 5 minutes or when you detach."
  echo ""

  # Wait for Claude to process, then show output
  echo "Waiting for Claude to process (30s)..."
  sleep 30
  echo "Current screen:"
  echo "----------------------------------------"
  tmux capture-pane -t "$TMUX_SESSION" -p -S -40 | tail -30
  echo "----------------------------------------"

  # Keep session alive for manual attachment
  echo ""
  echo "Session still running. Attach with: tmux attach -t $TMUX_SESSION"
  # Don't exit - let trap handle cleanup when script is killed
  sleep 300
fi

# Check if we have a TTY (interactive terminal)
if [ -t 0 ] && [ -t 1 ]; then
  # Interactive terminal - create Zellij session and attach
  echo "Creating Zellij session: $SESSION_NAME"
  echo "=========================================="

  # Check if session already exists
  if zellij list-sessions 2>/dev/null | grep -q "$SESSION_NAME"; then
    echo "Session '$SESSION_NAME' exists, attaching..."
    exec zellij attach "$SESSION_NAME"
  fi

  # Create new session in background
  zellij --session "$SESSION_NAME" --new-session-with-layout default &
  ZELLIJ_PID=$!
  sleep 2

  # Wait for session to be ready
  for i in {1..20}; do
    if zellij list-sessions 2>/dev/null | grep -q "$SESSION_NAME"; then
      break
    fi
    sleep 0.5
  done

  export ZELLIJ_SESSION_NAME="$SESSION_NAME"

  # Dismiss welcome screens
  dismiss_zellij_welcome

  # Start Claude in the main pane
  echo "Starting Claude..."
  zellij action write-chars "claude --dangerously-skip-permissions"
  zellij action write-chars $'\n'

  # Wait for Claude to be ready
  wait_for_claude

  # Inject prompt if provided
  if [ -n "$PROMPT" ]; then
    echo "Injecting prompt..."
    zellij action write-chars "$PROMPT"
    zellij action write-chars $'\n'
  fi

  echo ""
  echo "=========================================="
  echo "Zellij session '$SESSION_NAME' is ready!"
  echo ""
  echo "To attach: zellij attach $SESSION_NAME"
  echo "To kill:   zellij kill-session $SESSION_NAME"
  echo "=========================================="

  # Attach to the session (with optional recording)
  if [ "$RECORD" = true ]; then
    echo ""
    echo "Recording to: $RECORD_OUTPUT"
    echo "Press Ctrl+D or type 'exit' when done to stop recording."
    echo ""
    asciinema rec \
      --overwrite \
      --cols 120 \
      --rows 35 \
      -c "zellij attach $SESSION_NAME" \
      "$RECORD_OUTPUT"
    echo ""
    echo "Recording saved to: $RECORD_OUTPUT"
  else
    exec zellij attach "$SESSION_NAME"
  fi
else
  # Non-interactive (e.g., CI, Claude) - run tests in native mode (Ghostty/Terminal)
  echo "Non-interactive mode detected - running tests in native mode"
  run_tests
  exit $?
fi
