#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== PARALLEL μ-PACKET LATEST ==="
cat reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json 2>/dev/null | python3 -m json.tool | head -140 || echo "Pas encore de packet"
echo "=== LOG COURT ==="
tail -25 logs/tx_parallel_micro_sync.log 2>/dev/null || true
