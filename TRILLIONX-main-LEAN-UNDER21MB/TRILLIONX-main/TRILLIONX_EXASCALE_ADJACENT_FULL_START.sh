#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX
mkdir -p logs runtime_state data wasm

echo "=== STOP OLD EXASCALE-ADJACENT FULL ==="
pkill -f "TRILLIONX_EXASCALE_ADJACENT_FULL_RUNTIME.js" 2>/dev/null || true
sleep 1

echo "=== CHECK ==="
node --check TRILLIONX_EXASCALE_ADJACENT_FULL_RUNTIME.js

echo "=== ONCE TEST ==="
TRX_EXA_WORKERS=2 TRX_EXA_PACKET=128 node TRILLIONX_EXASCALE_ADJACENT_FULL_RUNTIME.js once 3055 > logs/exascale_adjacent_once.log 2>&1 || true
tail -80 logs/exascale_adjacent_once.log || true

echo "=== START FULL DAEMON ==="
TRX_EXA_WORKERS=2 TRX_EXA_PACKET=128 TRX_EXA_TICK_MS=5000 \
nohup node TRILLIONX_EXASCALE_ADJACENT_FULL_RUNTIME.js server 3055 > logs/exascale_adjacent_full_runtime.log 2>&1 &
echo $! > runtime_state/exascale_adjacent_full_runtime.pid

sleep 4
curl -fsS http://127.0.0.1:3055/api/exascale-adjacent | python3 -m json.tool | tail -100 || true

echo "=== DONE ==="
