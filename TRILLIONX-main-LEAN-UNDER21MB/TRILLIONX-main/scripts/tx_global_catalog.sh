#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
cat async_registry/TRILLIONX_GLOBAL_ASYNC_REGISTRY_V2.json | python3 -m json.tool
