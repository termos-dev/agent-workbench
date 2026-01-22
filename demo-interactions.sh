#!/bin/bash
# Demo script to generate sample interactions for testing the dashboard

# Session directories (simulating different projects)
SESSION1="$HOME/.termos/sessions/-Users-burakemre-Code-mcp-sidecar"
SESSION2="$HOME/.termos/sessions/-Users-burakemre-Code-my-app"
SESSION3="$HOME/.termos/sessions/-Users-burakemre-Code-api-server"

# Create directories
mkdir -p "$SESSION1" "$SESSION2" "$SESSION3"

# Clear existing events
> "$SESSION1/events.jsonl"
> "$SESSION2/events.jsonl"
> "$SESSION3/events.jsonl"

NOW=$(date +%s)000

# mcp-sidecar: Confirm with diff
cat >> "$SESSION1/events.jsonl" << EOF
{"type":"created","id":"int-1","interactionType":"confirm","title":"Apply changes?","prompt":"Apply these changes to config.ts?","ts":$NOW}
EOF

# mcp-sidecar: Select architecture
cat >> "$SESSION1/events.jsonl" << EOF
{"type":"created","id":"int-2","interactionType":"select","title":"Architecture","prompt":"Which caching strategy?","options":[{"label":"Redis","value":"redis"},{"label":"Memcached","value":"memcached"},{"label":"None","value":"none"}],"ts":$NOW}
EOF

# my-app: Confirm deploy
cat >> "$SESSION2/events.jsonl" << EOF
{"type":"created","id":"int-3","interactionType":"confirm","title":"Deploy?","prompt":"Deploy 3 files to production?","ts":$NOW}
EOF

# my-app: Input commit message
cat >> "$SESSION2/events.jsonl" << EOF
{"type":"created","id":"int-4","interactionType":"input","title":"Commit message","prompt":"Enter commit message:","ts":$NOW}
EOF

# api-server: Confirm with error details
cat >> "$SESSION3/events.jsonl" << EOF
{"type":"created","id":"int-5","interactionType":"confirm","title":"Test failed","prompt":"2 tests failed in users.test.ts. Continue anyway?","ts":$NOW}
EOF

echo "Created sample interactions:"
echo ""
echo "mcp-sidecar (2):"
echo "  - Confirm: Apply changes?"
echo "  - Select: Architecture"
echo ""
echo "my-app (2):"
echo "  - Confirm: Deploy?"
echo "  - Input: Commit message"
echo ""
echo "api-server (1):"
echo "  - Confirm: Test failed"
echo ""
echo "Run 'termos tui' to see the TUI"
