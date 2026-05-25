#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX PROCESS TOOLKIT SAFE"
echo "============================================================"

mkdir -p scripts logs reports history runtime_state

echo "=== 1) start rapide avec priorité douce ==="
cat > scripts/tx_start_nice.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
export PORT=${PORT:-3000}
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}
export TRILLIONX_REAL_ONLY=true
export TRILLIONX_SAFE_REPAIR=true
export TRILLIONX_NO_FAKE_METRICS=true
node --check app.js || exit 1
echo "Starting TRILLIONX nice mode..."
nohup nice -n 5 node --max-old-space-size="$TRILLIONX_MEMORY_LIMIT_MB" app.js > logs/trillionx_nice.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2
echo "PID=$(cat runtime_state/TRILLIONX_MAIN_PID)"
tail -40 logs/trillionx_nice.log || true
SH
chmod +x scripts/tx_start_nice.sh

echo "=== 2) stop propre ==="
cat > scripts/tx_stop.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "Stopping TRILLIONX..."
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then
  kill "$(cat runtime_state/TRILLIONX_MAIN_PID)" 2>/dev/null || true
fi
pkill -f "node .*app.js" 2>/dev/null || true
pkill -f "TRILLIONX_" 2>/dev/null || true
sleep 1
echo "Ports after stop:"
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" || echo "No TRILLIONX ports visible"
SH
chmod +x scripts/tx_stop.sh

echo "=== 3) watchdog léger ==="
cat > scripts/tx_watchdog.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state reports
PORT=${PORT:-3000}
while true; do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "$(date -Iseconds) OK port $PORT" >> logs/tx_watchdog.log
  else
    echo "$(date -Iseconds) RESTART port $PORT" >> logs/tx_watchdog.log
    bash scripts/tx_stop.sh >/dev/null 2>&1 || true
    bash scripts/tx_start_nice.sh >/dev/null 2>&1 || true
  fi
  sleep "${TRILLIONX_WATCHDOG_INTERVAL:-30}"
done
SH
chmod +x scripts/tx_watchdog.sh

echo "=== 4) lancement watchdog arrière-plan ==="
cat > scripts/tx_watchdog_start.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
nohup bash scripts/tx_watchdog.sh > logs/tx_watchdog.out 2>&1 &
echo $! > runtime_state/TRILLIONX_WATCHDOG_PID
echo "watchdog PID=$(cat runtime_state/TRILLIONX_WATCHDOG_PID)"
SH
chmod +x scripts/tx_watchdog_start.sh

echo "=== 5) statut processus condensé ==="
cat > scripts/tx_process_status.sh <<'SH'
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
SH
chmod +x scripts/tx_process_status.sh

echo "=== 6) logs rotation simple ==="
cat > scripts/tx_log_rotate.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs
find logs -type f -name "*.log" -size +20M -exec sh -c 'tail -500 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
find logs -type f -name "*.out" -size +20M -exec sh -c 'tail -500 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
echo "Log rotation OK"
du -sh logs 2>/dev/null || true
SH
chmod +x scripts/tx_log_rotate.sh

echo "=== 7) rapport ==="
node - <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const rep={
  engine:"TRILLIONX_PROCESS_TOOLKIT_SAFE",
  time:new Date().toISOString(),
  status:"READY",
  safe:true,
  adds:[
    "tx_start_nice.sh",
    "tx_stop.sh",
    "tx_watchdog.sh",
    "tx_watchdog_start.sh",
    "tx_process_status.sh",
    "tx_log_rotate.sh"
  ],
  improves:[
    "process restart",
    "terminal noise reduction",
    "watchdog auto recovery",
    "log anti-bloat",
    "nice priority to protect Codespaces UI"
  ],
  does_not_touch:["app.js","data","raid60_plus","node_modules"]
};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.writeFileSync("reports/TRILLIONX_PROCESS_TOOLKIT_LATEST.json",JSON.stringify(rep,null,2));
fs.appendFileSync("history/TRILLIONX_PROCESS_TOOLKIT_HISTORY.jsonl",JSON.stringify({time:rep.time,status:rep.status,seal:rep.seal})+"\n");
console.log(JSON.stringify(rep,null,2));
NODE

git add scripts/tx_*.sh reports/TRILLIONX_PROCESS_TOOLKIT_LATEST.json history/TRILLIONX_PROCESS_TOOLKIT_HISTORY.jsonl 2>/dev/null || true
git commit -m "Add TRILLIONX safe process toolkit" || echo "Rien à commit"

echo "============================================================"
echo "✅ TOOLKIT OK"
echo "Start doux      : bash scripts/tx_start_nice.sh"
echo "Stop propre     : bash scripts/tx_stop.sh"
echo "Status court    : bash scripts/tx_process_status.sh"
echo "Watchdog start  : bash scripts/tx_watchdog_start.sh"
echo "Logs rotation   : bash scripts/tx_log_rotate.sh"
echo "============================================================"
