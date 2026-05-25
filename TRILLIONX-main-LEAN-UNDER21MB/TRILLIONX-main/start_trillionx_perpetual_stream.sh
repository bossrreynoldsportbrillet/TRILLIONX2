#!/usr/bin/env bash
export TRILLIONX_STRUCTURE_LOCK=1
export TRILLIONX_REAL_ONLY_OR_UNAVAILABLE=1
export TRILLIONX_NO_DELETE=1
export TRILLIONX_MEMORY_MODE=PERPETUAL_STREAM_MICRO_PACKETS
export TRILLIONX_STREAM_CHUNK_KB=8
export TRILLIONX_NO_FULL_LOAD=1

echo "============================================================"
echo " TRILLIONX PERPETUAL STREAM START"
echo "============================================================"
echo "Mode      : micro-paquets perpétuels"
echo "RAM       : mémoire reconnue seulement"
echo "Fichiers  : mémoire froide active"
echo "Résultat  : compact runtime_state"
echo "No delete : true"
echo "============================================================"

node memory_fabric/trillionx_perpetual_stream_runtime.js --loop
