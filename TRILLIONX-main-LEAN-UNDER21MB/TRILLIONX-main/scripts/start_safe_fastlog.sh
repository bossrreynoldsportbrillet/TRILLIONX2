#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f .trillionx_terminal_fast.env ] && . ./.trillionx_terminal_fast.env
mkdir -p logs runtime_state

echo "=== TRILLIONX START FASTLOG ==="
node --check app.js || exit 1

if [ -f package.json ] && [ ! -f node_modules/.trillionx_npm_ready ]; then
  npm install --no-audit --no-fund
  mkdir -p node_modules
  date -Iseconds > node_modules/.trillionx_npm_ready 2>/dev/null || true
fi

nohup node --max-old-space-size="${TRILLIONX_MEMORY_LIMIT_MB:-4096}" app.js > logs/trillionx_app_fast.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2
echo "PID=$(cat runtime_state/TRILLIONX_MAIN_PID)"
echo "LOG=logs/trillionx_app_fast.log"
tail -30 logs/trillionx_app_fast.log || true
