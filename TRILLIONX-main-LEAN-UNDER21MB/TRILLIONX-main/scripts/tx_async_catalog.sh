#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== REGISTRY ==="
cat async_registry/TRILLIONX_ASYNC_JOB_REGISTRY.json 2>/dev/null | python3 -m json.tool || true
echo "=== CODECS ==="
cat async_codecs/TRILLIONX_ASYNC_CODEC_CATALOG.json 2>/dev/null | python3 -m json.tool || true
echo "=== DERIVATIVES ==="
cat async_derivatives/TRILLIONX_ASYNC_DERIVATIVE_CATALOG.json 2>/dev/null | python3 -m json.tool || true
