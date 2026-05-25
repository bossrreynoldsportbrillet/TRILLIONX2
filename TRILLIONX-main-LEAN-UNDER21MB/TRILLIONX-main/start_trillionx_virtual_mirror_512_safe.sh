#!/usr/bin/env bash
export PORT=3000
export TRILLIONX_STRUCTURE_LOCK=1
export TRILLIONX_REAL_ONLY_OR_UNAVAILABLE=1
export TRILLIONX_NO_DELETE=1

export TRILLIONX_MEMORY_MODE=VIRTUAL_MIRROR
export TRILLIONX_VIRTUAL_MIRROR_RAM_GB=512
export TRILLIONX_VIRTUAL_MIRROR_PROFILE=DDR5_7200_C26_OCTO_X4_1V1_SAFE
export TRILLIONX_CACHE_SYSTEM=SAFE_BOUNDED_MIRROR
export TRILLIONX_MAX_WORKERS=1
export TRILLIONX_MAX_PARALLEL_JOBS=1
export TRILLIONX_CACHE_MAX_MB=256
export TRILLIONX_OUTPUT_LIMIT=60000
export TRILLIONX_HEAVY_BENCH=0
export NODE_OPTIONS=--max-old-space-size=2048

echo "============================================================"
echo " TRILLIONX START — 512GB VIRTUAL MIRROR RAM SAFE"
echo "============================================================"
echo "Real host RAM      : measured"
echo "Virtual mirror RAM : 512GB logical"
echo "Physical claim     : false"
echo "DDR profile        : DDR5 7200 C26 octo-channel x4 1.1V SAFE"
echo "Cache              : bounded 256MB real RAM window + disk spill"
echo "============================================================"

node tools/virtual_mirror_ram_status.js
echo
node app.js
