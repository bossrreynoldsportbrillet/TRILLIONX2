#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
export PORT=${PORT:-3000}
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}
export TRILLIONX_REAL_ONLY=true
export TRILLIONX_SAFE_REPAIR=true
export TRILLIONX_NO_FAKE_METRICS=true
node --check app.js || exit 1
echo "Starting TRILLIONX nice mode..."
nohup nice -n 5 node --max-old-space-size="$TRILLIONX_MEMORY_LIMIT_MB" app.js > logs/trillionx_nice.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2
echo "PID=$(cat runtime_state/TRILLIONX_MAIN_PID)"
tail -40 logs/trillionx_nice.log || true
