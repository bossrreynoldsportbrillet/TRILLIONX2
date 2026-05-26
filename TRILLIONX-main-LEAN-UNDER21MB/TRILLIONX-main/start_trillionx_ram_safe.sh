#!/usr/bin/env bash
set -a
[ -f .trillionx_ram_guard.env ] && . ./.trillionx_ram_guard.env
set +a

echo "TRILLIONX RAM SAFE START"
echo "PORT=$PORT"
echo "NODE_OPTIONS=$NODE_OPTIONS"
echo "MAX_WORKERS=$TRILLIONX_MAX_WORKERS"
echo "CACHE_MAX_MB=$TRILLIONX_CACHE_MAX_MB"
echo

node app.js
