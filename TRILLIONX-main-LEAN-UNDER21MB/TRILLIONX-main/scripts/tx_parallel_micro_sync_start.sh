#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
[ -f runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID)" 2>/dev/null || true
CMD="node scripts/tx_parallel_micro_sync.js"
if nice -n -5 true 2>/dev/null; then
  nohup nice -n -5 $CMD > logs/tx_parallel_micro_sync_daemon.out 2>&1 &
else
  echo "nice -5 non autorisé, fallback nice 0"
  nohup $CMD > logs/tx_parallel_micro_sync_daemon.out 2>&1 &
fi
echo $! > runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID
echo "PARALLEL_MICRO_SYNC_PID=$(cat runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID)"
echo "Status: bash scripts/tx_parallel_micro_sync_status.sh"
