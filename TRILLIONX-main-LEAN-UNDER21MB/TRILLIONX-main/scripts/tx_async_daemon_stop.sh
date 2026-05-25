#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_ASYNC_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_async_runner.js" 2>/dev/null || true
echo "ASYNC DAEMON STOPPED"
