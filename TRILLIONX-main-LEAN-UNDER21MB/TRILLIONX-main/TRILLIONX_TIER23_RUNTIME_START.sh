#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX
mkdir -p logs runtime_state data history

pkill -f "TRILLIONX_TIER23_RUNTIME.js" 2>/dev/null || true
sleep 1

node --check TRILLIONX_TIER23_RUNTIME.js

nohup node TRILLIONX_TIER23_RUNTIME.js 3100 > logs/tier23_runtime.log 2>&1 &
echo $! > runtime_state/tier23_runtime.pid

sleep 3
curl -fsS http://127.0.0.1:3100/api/tier23 | python3 -m json.tool | tail -120 || true
ss -lntp 2>/dev/null | grep 3100 || true
