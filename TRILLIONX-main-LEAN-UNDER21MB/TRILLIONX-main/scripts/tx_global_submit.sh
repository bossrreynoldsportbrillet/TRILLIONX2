#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
node scripts/tx_async_global_drain_v2.js submit "${1:-status}"
