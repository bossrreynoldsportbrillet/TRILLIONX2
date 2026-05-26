#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

mkdir -p logs runtime_state mesh_nodes controllers data

echo "=== STOP OLD PORT KEEPALIVE ==="
pkill -f "TRILLIONX_PORT_KEEPALIVE_ALL.js" 2>/dev/null || true
sleep 1

echo "=== CHECK ==="
node --check TRILLIONX_PORT_KEEPALIVE_ALL.js

echo "=== FIRST CYCLE ==="
node TRILLIONX_PORT_KEEPALIVE_ALL.js 20000 once

echo "=== START DAEMON ==="
nohup node TRILLIONX_PORT_KEEPALIVE_ALL.js 20000 daemon > logs/port_keepalive_all.log 2>&1 &
echo $! > runtime_state/port_keepalive_all.pid

sleep 3

echo "=== PORT STATUS ==="
ss -lntp 2>/dev/null | grep -E "3000|301[0-9]|302[0-9]|3033|3044" || true

echo "=== REPORT ==="
cat data/trillionx_port_keepalive_all_latest.json | python3 -m json.tool | tail -120
