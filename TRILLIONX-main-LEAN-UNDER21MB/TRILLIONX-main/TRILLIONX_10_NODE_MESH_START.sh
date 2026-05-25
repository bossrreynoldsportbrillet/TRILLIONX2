#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

echo "=== STOP OLD MESH ==="
pkill -f "TRILLIONX_10_NODE_MESH.js node" 2>/dev/null || true
sleep 2

echo "=== START 10 TRILLIONX NODES ==="
for i in $(seq 0 9); do
  nohup node TRILLIONX_10_NODE_MESH.js node "$i" > "mesh_nodes/node_${i}.log" 2>&1 &
  echo $! > "mesh_nodes/node_${i}.pid"
done

sleep 4

echo "=== AGGREGATE ==="
node TRILLIONX_10_NODE_MESH.js aggregate

echo "=== PORTS ==="
ss -lntp 2>/dev/null | grep -E "301[0-9]" || true
