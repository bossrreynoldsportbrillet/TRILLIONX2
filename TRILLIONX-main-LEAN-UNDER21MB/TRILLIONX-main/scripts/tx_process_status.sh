#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== CPU/RAM/DISK ==="
uptime
free -h 2>/dev/null || true
df -h .
echo
echo "=== TRILLIONX PROCESSES ==="
ps -eo pid,ppid,ni,%cpu,%mem,rss,cmd --sort=-%cpu | grep -E "node|TRILLIONX|app.js" | grep -v grep | head -25 || true
echo
echo "=== PORTS ==="
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" | head -80 || true
echo
echo "=== LOG COURT ==="
tail -40 logs/trillionx_nice.log 2>/dev/null || tail -40 logs/trillionx_instant_restart.log 2>/dev/null || true
