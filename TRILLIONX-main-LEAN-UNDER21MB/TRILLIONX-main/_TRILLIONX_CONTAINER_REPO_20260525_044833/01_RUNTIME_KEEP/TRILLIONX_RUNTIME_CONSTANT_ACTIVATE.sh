#!/usr/bin/env bash
set -e
cd /workspaces/TRILLIONX

echo "=== STOP OLD CONSTANT ACTIVATOR ==="
pkill -f "TRILLIONX_RUNTIME_CONSTANT_ACTIVATOR.js" 2>/dev/null || true
sleep 1

echo "=== SYNTAX CHECK ==="
node --check TRILLIONX_RUNTIME_CONSTANT_ACTIVATOR.js

echo "=== FIRST ACTIVATION CYCLE ==="
node TRILLIONX_RUNTIME_CONSTANT_ACTIVATOR.js 15000 once

echo "=== START DAEMON ==="
nohup node TRILLIONX_RUNTIME_CONSTANT_ACTIVATOR.js 15000 daemon > logs/runtime_constant_activator.log 2>&1 &

sleep 3

echo "=== STATUS ==="
cat data/trillionx_runtime_constant_activator_latest.json | python3 -m json.tool | tail -120

echo "=== PORTS ==="
ss -lntp 2>/dev/null | grep -E "3000|301[0-9]|302[0-9]|3033|3044" || true

echo "=== DONE ==="
