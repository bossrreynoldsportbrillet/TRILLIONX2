#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
[ -f runtime_state/TRILLIONX_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)" 2>/dev/null || true
nohup node scripts/tx_micro_sync_daemon.js > logs/tx_micro_sync_daemon.out 2>&1 &
echo $! > runtime_state/TRILLIONX_MICRO_SYNC_PID
echo "MICRO_SYNC_PID=$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)"
echo "Log: tail -f logs/tx_micro_sync.log"
