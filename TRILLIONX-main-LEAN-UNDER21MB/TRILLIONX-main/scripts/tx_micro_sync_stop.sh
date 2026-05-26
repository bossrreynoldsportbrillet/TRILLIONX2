#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_micro_sync_daemon.js" 2>/dev/null || true
echo "MICRO_SYNC_STOPPED"
