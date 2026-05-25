#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== μ-PACKET LATEST ==="
cat reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json 2>/dev/null | python3 -m json.tool | head -120 || echo "Pas encore de packet"
echo "=== LOG COURT ==="
tail -20 logs/tx_micro_sync.log 2>/dev/null || true
