#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
[ -f runtime_state/TRILLIONX_ASYNC_DRAIN_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_ASYNC_DRAIN_DAEMON_PID)" 2>/dev/null || true
nohup node scripts/tx_async_drain_registry_codec.js daemon > logs/tx_async_drain_daemon.out 2>&1 &
echo $! > runtime_state/TRILLIONX_ASYNC_DRAIN_DAEMON_PID
echo "ASYNC_DRAIN_DAEMON_PID=$(cat runtime_state/TRILLIONX_ASYNC_DRAIN_DAEMON_PID)"
