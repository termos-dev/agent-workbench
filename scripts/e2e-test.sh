#!/bin/bash
set -e

# E2E Test Script for Agent Workbench
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
  echo "Running Agent Workbench E2E Tests..."
  echo "=========================================="

  local failed=0
  local passed=0

  echo -n "Test 1: confirm component... "
  result=$(awb run confirm --title "E2E-Confirm" --prompt "Test?" 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 2: checklist component... "
  result=$(awb run checklist --title "E2E-Checklist" --items '["A","B"]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 3: ask component... "
  result=$(awb run ask --title "E2E-Ask" --questions '[{"question":"Name?","header":"name"}]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 4: table component... "
  result=$(awb run table --title "E2E-Table" --data '[{"x":1}]' 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 5: code component... "
  result=$(awb run code --title "E2E-Code" --file package.json 2>&1)
  if echo "$result" | grep -q '"status":"started"'; then
    echo "✓ PASS"
    ((passed++))
  else
    echo "✗ FAIL"
    ((failed++))
  fi

  echo -n "Test 6: markdown component... "
  result=$(awb run markdown --title "E2E-Markdown" --file README.md 2>&1)
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
  capture_component "confirm" "awb run confirm --title \"Deploy\" --prompt \"Deploy to production?\""
  capture_component "ask" "awb run ask --title \"Name\" --questions \"[{\\\"question\\\":\\\"What is your name?\\\",\\\"header\\\":\\\"name\\\"}]\""
  capture_component "checklist" "awb run checklist --title \"Tasks\" --items \"[\\\"Build application\\\",\\\"Run tests\\\",\\\"Deploy to staging\\\",\\\"Notify team\\\"]\""
  capture_component "table" "awb run table --title \"Users\" --data \"[{\\\"name\\\":\\\"Alice\\\",\\\"role\\\":\\\"Admin\\\",\\\"status\\\":\\\"Active\\\"},{\\\"name\\\":\\\"Bob\\\",\\\"role\\\":\\\"User\\\",\\\"status\\\":\\\"Active\\\"},{\\\"name\\\":\\\"Charlie\\\",\\\"role\\\":\\\"User\\\",\\\"status\\\":\\\"Inactive\\\"}]\""
  capture_component "code" "awb run code --title \"Code\" --file README.md"
  capture_component "markdown" "awb run markdown --title \"Docs\" --file README.md"
  capture_component "html" "awb run html --title \"Dashboard\" --content \"<!DOCTYPE html><html><body><h1>Dashboard</h1></body></html>\""
  capture_component "plan-viewer" "awb run plan-viewer --title \"Plan\" --file README.md"

  echo ""
  echo "=========================================="
  echo "Screenshots saved to docs/images/components/"
  echo "=========================================="
}

if [ "$SCREENSHOTS" = true ]; then
  cd "$TEST_PATH"

  # Build awb if needed
  if ! command -v awb >/dev/null 2>&1; then
    echo "Building awb..."
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

  docker build -f Dockerfile.test -t awb-test . >/dev/null 2>&1
  docker rm -f awb-test 2>/dev/null || true
  docker run -d -v "$(pwd)":/workspace -w /workspace --name awb-test awb-test sleep infinity >/dev/null

  echo "Installing dependencies..."
  docker exec awb-test bash -c 'npm install --silent && npm run build --silent && npm link --silent' 2>&1 | tail -1

  echo "Running tests in Docker..."
  docker exec awb-test bash -c 'cd /workspace && ./scripts/e2e-test.sh'
  exit_code=$?

  echo ""
  echo "Cleanup: docker rm -f awb-test"
  docker rm -f awb-test 2>/dev/null || true
  exit $exit_code
fi

#######################################
# LOCAL MODE
#######################################
cd "$TEST_PATH"

# Build awb if needed
if ! command -v awb >/dev/null 2>&1; then
  echo "Building awb..."
  npm run build --silent 2>&1 | tail -1
  npm link --silent 2>&1 | tail -1
fi

run_tests
exit $?
