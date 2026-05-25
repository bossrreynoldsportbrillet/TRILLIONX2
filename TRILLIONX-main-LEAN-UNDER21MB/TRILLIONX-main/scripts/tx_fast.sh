#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f .trillionx_terminal_fast.env ] && . ./.trillionx_terminal_fast.env
clear
printf "\033[3J"
echo "=== TRILLIONX FAST TERMINAL READY ==="
echo "txs=start | txr=resources | txd=disk | txg=git | txk=kill | txports=ports"
