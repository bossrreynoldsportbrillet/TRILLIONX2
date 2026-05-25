#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX
mkdir -p logs runtime_state data memory_fabric/spill

echo "=== STOP OLD MEMORY FABRIC ==="
pkill -f "TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js" 2>/dev/null || true
sleep 1

echo "=== CHECK ==="
node --check TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js

echo "=== ONCE TEST ==="
node TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js once | tee logs/memory_fabric_once.log

echo "=== START MEMORY FABRIC DAEMON 3160 ==="
nohup node TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js server 3160 > logs/memory_fabric_hbm3e_hamram.log 2>&1 &
echo $! > runtime_state/memory_fabric_hbm3e_hamram.pid

sleep 3
curl -fsS http://127.0.0.1:3160/api/memory-fabric | python3 -m json.tool | tail -100 || true

echo "=== PORT ==="
ss -lntp 2>/dev/null | grep 3160 || true
