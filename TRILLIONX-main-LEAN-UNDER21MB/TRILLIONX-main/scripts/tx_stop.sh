#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "Stopping TRILLIONX..."
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then
  kill "$(cat runtime_state/TRILLIONX_MAIN_PID)" 2>/dev/null || true
fi
pkill -f "node .*app.js" 2>/dev/null || true
pkill -f "TRILLIONX_" 2>/dev/null || true
sleep 1
echo "Ports after stop:"
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" || echo "No TRILLIONX ports visible"
