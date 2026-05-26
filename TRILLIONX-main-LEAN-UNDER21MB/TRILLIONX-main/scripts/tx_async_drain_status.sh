#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
node scripts/tx_async_drain_registry_codec.js status | tee reports/TRILLIONX_ASYNC_DRAIN_STATUS_LAST.txt
