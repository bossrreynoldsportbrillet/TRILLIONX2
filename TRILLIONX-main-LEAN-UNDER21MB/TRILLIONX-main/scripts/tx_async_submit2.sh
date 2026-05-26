#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
TYPE="${1:-status}"
node scripts/tx_async_drain_registry_codec.js submit "$TYPE"
