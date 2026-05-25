#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_parallel_micro_sync.js" 2>/dev/null || true
echo "PARALLEL_MICRO_SYNC_STOPPED"
