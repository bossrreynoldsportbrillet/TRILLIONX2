#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
TX_ASYNC_KEEP_RESULTS="${TX_ASYNC_KEEP_RESULTS:-200}" node scripts/tx_async_drain_registry_codec.js clear
