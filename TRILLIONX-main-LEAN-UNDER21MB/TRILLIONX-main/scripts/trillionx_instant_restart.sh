#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX INSTANT RESTART"
echo "============================================================"

mkdir -p logs runtime_state reports history

echo "=== 1) STOP NODE/TRILLIONX SAFE ==="
pkill -f "node .*app.js" 2>/dev/null || true
pkill -f "TRILLIONX_97_PORT_PROCESS" 2>/dev/null || true
pkill -f "TRILLIONX_FIRE_DICT" 2>/dev/null || true
sleep 1

echo "=== 2) PORTS APRES STOP ==="
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:20[0-9][0-9][0-9]" || echo "ports TRILLIONX libérés ou invisibles"

echo "=== 3) DISK/RAM CHECK ==="
df -h .
free -h 2>/dev/null || true

echo "=== 4) NPM READY ==="
if [ -f package.json ]; then
  if [ ! -d node_modules ] || [ ! -f node_modules/.trillionx_npm_ready ]; then
    npm install --no-audit --no-fund || npm install || exit 1
    mkdir -p node_modules
    date -Iseconds > node_modules/.trillionx_npm_ready 2>/dev/null || true
  else
    echo "npm déjà prêt"
  fi
fi

echo "=== 5) APP CHECK ==="
node --check app.js || exit 1

echo "=== 6) START BACKGROUND ==="
export PORT=${PORT:-3000}
export TRILLIONX_REAL_ONLY=true
export TRILLIONX_SAFE_REPAIR=true
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}
export TRILLIONX_NO_FAKE_METRICS=true

nohup bash scripts/start_safe.sh > logs/trillionx_instant_restart.log 2>&1 &
PID=$!
echo "$PID" > runtime_state/TRILLIONX_MAIN_PID

sleep 3

echo "=== 7) RESULT ==="
echo "PID=$PID"
tail -40 logs/trillionx_instant_restart.log || true

echo "=== 8) PORTS ==="
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:20[0-9][0-9][0-9]" || true

node - <<'NODE'
const fs=require("fs"),os=require("os"),crypto=require("crypto");
const rep={
  engine:"TRILLIONX_INSTANT_RESTART",
  time:new Date().toISOString(),
  status:"RESTART_COMMAND_SENT",
  pid:fs.existsSync("runtime_state/TRILLIONX_MAIN_PID")?fs.readFileSync("runtime_state/TRILLIONX_MAIN_PID","utf8").trim():null,
  cpu:os.cpus()[0]?.model||"unknown",
  logical_cpu:os.cpus().length,
  load:os.loadavg(),
  ram_free_gb:+(os.freemem()/1073741824).toFixed(3),
  command:"nohup bash scripts/start_safe.sh"
};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.writeFileSync("reports/TRILLIONX_INSTANT_RESTART_LATEST.json",JSON.stringify(rep,null,2));
console.log(JSON.stringify(rep,null,2));
NODE

echo "✅ TRILLIONX relance instant demandée"
echo "Voir log : tail -f logs/trillionx_instant_restart.log"
