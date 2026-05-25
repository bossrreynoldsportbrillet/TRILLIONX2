#!/usr/bin/env bash
set -a
[ -f .trillionx_512gb_ram_target.env ] && . ./.trillionx_512gb_ram_target.env
set +a

echo "============================================================"
echo " TRILLIONX START — 512GB DDR5 TARGET PROFILE / SAFE CACHE"
echo "============================================================"
echo "Doctrine      : REAL_ONLY_OR_UNAVAILABLE"
echo "Port          : $PORT"
echo "Target RAM    : ${TRILLIONX_TARGET_RAM_GB}GB ${TRILLIONX_TARGET_DDR}-${TRILLIONX_TARGET_MEM_SPEED_MT} C${TRILLIONX_TARGET_CAS}"
echo "Voltage       : ${TRILLIONX_TARGET_VOLTAGE}V SAFE"
echo "Channels      : ${TRILLIONX_TARGET_CHANNELS}"
echo "Cache mode    : ${TRILLIONX_CACHE_SYSTEM}"
echo "Node options  : $NODE_OPTIONS"
echo "Workers       : $TRILLIONX_MAX_WORKERS"
echo "Important     : target profile, not fake Codespaces RAM"
echo "============================================================"

node tools/ram_512_profile_status.js
echo
node app.js
