#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

echo "=== STOP OLD 10/20 NODE MESH ==="
pkill -f "TRILLIONX_10_NODE_MESH.js node" 2>/dev/null || true
pkill -f "TRILLIONX_20_NODE_VR_MESH.js node" 2>/dev/null || true
sleep 2

mkdir -p mesh_nodes

echo "=== START 20 TRILLIONX VR NODES ==="
for i in $(seq 0 19); do
  nohup node TRILLIONX_20_NODE_VR_MESH.js node "$i" > "mesh_nodes/vr_node_${i}.log" 2>&1 &
  echo $! > "mesh_nodes/vr_node_${i}.pid"
done

sleep 5

echo "=== AGGREGATE 20 NODES ==="
node TRILLIONX_20_NODE_VR_MESH.js aggregate

echo "=== PORTS 3010-3029 ==="
ss -lntp 2>/dev/null | grep -E "30(1[0-9]|2[0-9])" || true
