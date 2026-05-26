#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

echo "=== TRILLIONX FIRMWARE BOOT SEQUENCE ==="

node TRILLIONX_FIRMWARE_STAGE0.js

echo "=== OPTIONAL MODULE BOOT ==="
./TRILLIONX_20_NODE_VR_MESH_START.sh 2>/dev/null || true
node TRILLIONX_SHARED_VR_CACHE_BUS.js make 2>/dev/null || true
node TRILLIONX_RAID60_PLUS_LOGICAL_STORAGE.js make 2>/dev/null || true
node TRILLIONX_HYPERBOLIC_MICROCONTROLLER_JOKER.js run 2>/dev/null || true

pkill -f "TRILLIONX_USEFUL_WORK_RUNTIME.js server" 2>/dev/null || true
nohup node TRILLIONX_USEFUL_WORK_RUNTIME.js server 3044 > runtime_state/useful_work_runtime.log 2>&1 &

sleep 2
node TRILLIONX_FIRMWARE_STAGE0.js

echo "=== FIRMWARE STATUS ==="
cat firmware/TRILLIONX_FIRMWARE_STAGE0.json | python3 -m json.tool | tail -120
