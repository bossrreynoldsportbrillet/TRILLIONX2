#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
if [ -f runtime_state/TRILLIONX_ASYNC_DAEMON_PID ]; then
  OLD="$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID 2>/dev/null || true)"
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null || true
fi
nohup node scripts/tx_async_runner.js > logs/tx_async_daemon.log 2>&1 &
echo $! > runtime_state/TRILLIONX_ASYNC_DAEMON_PID
echo "ASYNC_DAEMON_PID=$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID)"
