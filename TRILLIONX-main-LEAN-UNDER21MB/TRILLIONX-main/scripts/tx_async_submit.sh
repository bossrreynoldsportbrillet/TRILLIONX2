#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
mkdir -p async_queue
TYPE="${1:-status}"
ID="$(date +%Y%m%d_%H%M%S)_${TYPE}_$$"
cat > "async_queue/${ID}.json" <<JSON
{
  "id":"$ID",
  "type":"$TYPE",
  "time":"$(date -Iseconds)",
  "policy":"ASYNC_REMOTE_HOST_SAFE"
}
JSON
echo "JOB=$ID TYPE=$TYPE"
echo "Voir: bash scripts/tx_async_status.sh"
