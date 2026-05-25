#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
TX_DRAIN_MAX="${TX_DRAIN_MAX:-100}" node scripts/tx_async_global_drain_v2.js drain
