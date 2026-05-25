#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

mkdir -p logs runtime_state mesh_1x10 data

echo "=== STOP OLD 1x10 ==="
pkill -f "TRILLIONX_1X10_NODE_MASTER.js" 2>/dev/null || true
sleep 1

echo "=== CHECK ==="
node --check TRILLIONX_1X10_NODE_MASTER.js

echo "=== START 10 NODES 3110-3119 ==="
for i in $(seq 0 9); do
  nohup node TRILLIONX_1X10_NODE_MASTER.js node "$i" > "logs/1x10_node_${i}.log" 2>&1 &
  echo $! > "runtime_state/1x10_node_${i}.pid"
done

sleep 4

echo "=== START MASTER 3150 ==="
nohup node TRILLIONX_1X10_NODE_MASTER.js master > logs/1x10_master.log 2>&1 &
echo $! > runtime_state/1x10_master.pid

sleep 3

echo "=== FIRST AGGREGATE ==="
node TRILLIONX_1X10_NODE_MASTER.js once || true

echo "=== CURL MASTER ==="
curl -fsS http://127.0.0.1:3150/api/1x10 | python3 -m json.tool || true

echo "=== PORTS ==="
ss -lntp 2>/dev/null | grep -E "311[0-9]|3150" || true
