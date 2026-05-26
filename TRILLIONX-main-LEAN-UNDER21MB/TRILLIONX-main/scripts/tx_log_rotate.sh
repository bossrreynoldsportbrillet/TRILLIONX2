#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs
find logs -type f -name "*.log" -size +20M -exec sh -c 'tail -500 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
find logs -type f -name "*.out" -size +20M -exec sh -c 'tail -500 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
echo "Log rotation OK"
du -sh logs 2>/dev/null || true
