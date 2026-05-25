#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== ASYNC QUEUE ==="
ls -1 async_queue 2>/dev/null | tail -20 || true
echo "=== RUNNING ==="
ls -1 async_jobs 2>/dev/null | tail -20 || true
echo "=== RESULTS ==="
ls -1t async_results 2>/dev/null | head -10 || true
echo "=== LAST RESULT ==="
LAST=$(ls -1t async_results/*.json 2>/dev/null | head -1 || true)
[ -n "$LAST" ] && cat "$LAST" | python3 -m json.tool | head -80 || true
echo "=== DAEMON LOG ==="
tail -30 logs/tx_async_daemon.log 2>/dev/null || true
