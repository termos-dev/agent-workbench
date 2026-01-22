#!/bin/bash
set -e

# E2E Test Script for Termos
# Runs component tests in native mode or Docker

USE_DOCKER=false
TEST_PATH="."
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
      shift
      ;;
  esac
done

# Run tests (called from within the test environment)
run_tests() {
  echo ""
  echo "Running Termos E2E Tests..."
  echo "=========================================="

  local failed=0
  local passed=0

  echo -n "Test 1: --cmd execution... "
  result=$(termos run --title "E2E-CMD" --cmd "echo hello" 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 2: confirm component... "
  result=$(termos run confirm --title "E2E-Confirm" --prompt "Test?" 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 3: checklist component... "
  result=$(termos run checklist --title "E2E-Checklist" --items '["A","B"]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 4: table component... "
  result=$(termos run table --title "E2E-Table" --data '[{"x":1}]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 5: progress component... "
  result=$(termos run progress --title "E2E-Progress" --steps '["Step 1"]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 6: code component... "
  result=$(termos run code --title "E2E-Code" --file package.json 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo ""
  echo "=========================================="
  echo "Results: $passed passed, $failed failed"
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
  if command -v termtosvg >/dev/null 2>&1; then
    timeout 5 termtosvg --still-frame -g 100x24 "$output" \
      -c "bash -c '$cmd 2>/dev/null; sleep 1'" 2>/dev/null || true
  else
    # Fallback: use asciinema + svg-term
    asciinema rec --overwrite --cols 100 --rows 24 \
      -c "bash -c '$cmd 2>/dev/null; sleep 1'" \
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

  echo "Running tests in Docker..."
  docker exec termos-test bash -c 'cd /workspace && ./scripts/e2e-test.sh'
  exit_code=$?

  echo ""
  echo "Cleanup: docker rm -f termos-test"
  docker rm -f termos-test 2>/dev/null || true
  exit $exit_code
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

run_tests
exit $?
