#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
echo '=== node ==='; ps aux --sort=-%cpu|grep -E 'node|app.js|TRILLIONX'|grep -v grep|head -25||true
echo '=== load/mem ==='; uptime||true; free -h||true
echo '=== ports ==='; ss -lntp 2>/dev/null|grep -E ':3000|:3997|:9229|:20[0-9][0-9][0-9]'|head -80||true
echo '=== guard ==='; node controllers/TRILLIONX_RUNTIME_GUARD.js|head -100||true
