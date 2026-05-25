#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== TRILLIONX STATUS COURT ==="
echo "--- git ---"; git status --short | head -30
echo "--- disk ---"; df -h .
echo "--- ram/load ---"; free -h 2>/dev/null || true; uptime
echo "--- node ---"; ps aux --sort=-%cpu | grep -E "node|app.js|TRILLIONX" | grep -v grep | head -15 || true
echo "--- ports ---"; ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" | head -30 || true
