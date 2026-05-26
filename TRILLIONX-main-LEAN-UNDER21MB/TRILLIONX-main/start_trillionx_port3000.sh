#!/usr/bin/env bash
set -a
[ -f .env.trillionx ] && . ./.env.trillionx
set +a

echo "============================================================"
echo " TRILLIONX START PORT 3000 — NETWORK PORTS UPGRADED"
echo "============================================================"
echo "SUBJECT              : ${TRILLIONX_SUBJECT:-TRILLIONX_X10_EXASCALE_QN_COPROCESSOR_PARALLEL_MIRROR_NETWORK}"
echo "PORT                 : ${PORT:-3000}"
echo "PRIMARY_PORT         : ${TRILLIONX_PRIMARY_PORT:-3000}"
echo "PORT_3000_PRIORITY   : ${TRILLIONX_PORT_3000_PRIORITY:-1}"
echo "NETWORK_PORTS        : ${TRILLIONX_NETWORK_PORTS_ACTIVE:-1}"
echo "ALL_PORTS_SCAN       : ${TRILLIONX_ALL_PORTS_SCAN_ACTIVE:-1}"
echo "PROCESS_EXACT        : ${TRILLIONX_PROCESS_EXACT:-1}"
echo "PORT_SCAN            : ${TRILLIONX_PORT_SCAN:-REAL_SS_ONLY}"
echo "PROCESS_SCAN         : ${TRILLIONX_PROCESS_SCAN:-REAL_PS_ONLY}"
echo "NETWORK_MODE         : ${TRILLIONX_NETWORK_MODE:-TRILLIONX_NETWORK_PORTS_ALL_RECOGNIZED}"
echo "BENCH_INTEGRATION    : NO"
echo "AUTO_PUSH            : NO"
echo "REAL_ONLY            : ${TRILLIONX_REAL_ONLY_OR_UNAVAILABLE:-1}"
echo "============================================================"

node TRILLIONX_ACTIVATE_ALL_NEW_SET.js >/dev/null 2>&1 || true
node TRILLIONX_NETWORK_PORTS_UPGRADE.js >/dev/null 2>&1 || true
PORT="${PORT:-3000}" node app.js
