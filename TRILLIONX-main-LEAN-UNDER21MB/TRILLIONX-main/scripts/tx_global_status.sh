#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
node scripts/tx_async_global_drain_v2.js status | tee reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_STATUS.txt
