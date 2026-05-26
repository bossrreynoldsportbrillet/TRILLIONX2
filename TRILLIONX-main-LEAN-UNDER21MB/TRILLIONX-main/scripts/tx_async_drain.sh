#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
TX_ASYNC_MAX_JOBS="${TX_ASYNC_MAX_JOBS:-50}" node scripts/tx_async_drain_registry_codec.js drain
