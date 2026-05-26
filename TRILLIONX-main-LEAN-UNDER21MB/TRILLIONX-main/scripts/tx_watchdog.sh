#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state reports
PORT=${PORT:-3000}
while true; do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "$(date -Iseconds) OK port $PORT" >> logs/tx_watchdog.log
  else
    echo "$(date -Iseconds) RESTART port $PORT" >> logs/tx_watchdog.log
    bash scripts/tx_stop.sh >/dev/null 2>&1 || true
    bash scripts/tx_start_nice.sh >/dev/null 2>&1 || true
  fi
  sleep "${TRILLIONX_WATCHDOG_INTERVAL:-30}"
done
