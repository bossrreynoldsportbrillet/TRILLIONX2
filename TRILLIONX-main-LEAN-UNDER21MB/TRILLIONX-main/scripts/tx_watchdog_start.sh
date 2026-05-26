#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
nohup bash scripts/tx_watchdog.sh > logs/tx_watchdog.out 2>&1 &
echo $! > runtime_state/TRILLIONX_WATCHDOG_PID
echo "watchdog PID=$(cat runtime_state/TRILLIONX_WATCHDOG_PID)"
