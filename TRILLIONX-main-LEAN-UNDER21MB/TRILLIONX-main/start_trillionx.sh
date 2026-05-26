#!/usr/bin/env bash
set +e

cd "$(dirname "$0")"

mkdir -p logs runtime_state

echo "=== TRILLIONX START UI ==="

# Stop ancien app.js seulement
pkill -f "PORT=3000 node app.js" 2>/dev/null || true
pkill -f "node app.js" 2>/dev/null || true

# Installe seulement si node_modules absent/incomplet
if [ ! -d node_modules/express ] || [ ! -d node_modules/socket.io ]; then
  echo "=== npm install minimal local ==="
  npm install --no-audit --no-fund dotenv express socket.io axios systeminformation web3 body-parser cors helmet compression morgan ws
else
  echo "=== node_modules OK ==="
fi

# Lance UI
PORT=3000 nohup node app.js > logs/trillionx_ui_3000.log 2>&1 &
echo $! > runtime_state/TRILLIONX_UI_3000.pid

sleep 3

echo "=== PORT 3000 ==="
ss -lntp | grep ':3000' || true

echo "=== HTTP CHECK ==="
curl -I --max-time 5 http://127.0.0.1:3000/ | head -8 || true

echo "=== LOG ==="
tail -40 logs/trillionx_ui_3000.log
