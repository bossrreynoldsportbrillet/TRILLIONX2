#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_async_global_drain_v2.js daemon" 2>/dev/null || true
echo "GLOBAL_DRAIN_DAEMON_STOPPED"
