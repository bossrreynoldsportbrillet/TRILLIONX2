#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX TERMINAL PROCESS ACCELERATOR"
echo "============================================================"

mkdir -p scripts logs reports history runtime_state .vscode

echo "=== 1) Profil terminal rapide ==="
cat > .trillionx_terminal_fast.env <<'ENV'
export NODE_ENV=production
export PORT=${PORT:-3000}
export TRILLIONX_REAL_ONLY=true
export TRILLIONX_SAFE_REPAIR=true
export TRILLIONX_NO_FAKE_METRICS=true
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}
export NO_UPDATE_NOTIFIER=1
export npm_config_audit=false
export npm_config_fund=false
export npm_config_loglevel=error
ENV

echo "=== 2) Alias rapides TRILLIONX ==="
cat > .trillionx_aliases <<'ALIAS'
alias tx='cd /workspaces/TRILLIONX'
alias txs='cd /workspaces/TRILLIONX && bash scripts/start_safe.sh'
alias txr='cd /workspaces/TRILLIONX && bash scripts/trillionx_resource_percent.sh'
alias txd='cd /workspaces/TRILLIONX && bash scripts/trillionx_disk_guard_safe.sh'
alias txg='cd /workspaces/TRILLIONX && git status --short'
alias txp='cd /workspaces/TRILLIONX && git add -A && git commit -m "Seal TRILLIONX terminal update" || echo "Rien à commit"; git push origin main || git push || true'
alias txk='pkill -f "node .*app.js" 2>/dev/null || true; pkill -f "TRILLIONX_" 2>/dev/null || true'
alias txports='ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" || true'
alias txlog='tail -80 logs/trillionx_instant_restart.log 2>/dev/null || true'
alias txclear='clear && printf "\033[3J"'
ALIAS

grep -q "trillionx_aliases" ~/.bashrc 2>/dev/null || cat >> ~/.bashrc <<'BASHRC'

# TRILLIONX terminal accelerator
[ -f /workspaces/TRILLIONX/.trillionx_terminal_fast.env ] && . /workspaces/TRILLIONX/.trillionx_terminal_fast.env
[ -f /workspaces/TRILLIONX/.trillionx_aliases ] && . /workspaces/TRILLIONX/.trillionx_aliases
BASHRC

echo "=== 3) Démarrage terminal léger ==="
cat > scripts/tx_fast.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f .trillionx_terminal_fast.env ] && . ./.trillionx_terminal_fast.env
clear
printf "\033[3J"
echo "=== TRILLIONX FAST TERMINAL READY ==="
echo "txs=start | txr=resources | txd=disk | txg=git | txk=kill | txports=ports"
SH
chmod +x scripts/tx_fast.sh

echo "=== 4) Lancement rapide sans gros scroll ==="
cat > scripts/start_safe_fastlog.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f .trillionx_terminal_fast.env ] && . ./.trillionx_terminal_fast.env
mkdir -p logs runtime_state

echo "=== TRILLIONX START FASTLOG ==="
node --check app.js || exit 1

if [ -f package.json ] && [ ! -f node_modules/.trillionx_npm_ready ]; then
  npm install --no-audit --no-fund
  mkdir -p node_modules
  date -Iseconds > node_modules/.trillionx_npm_ready 2>/dev/null || true
fi

nohup node --max-old-space-size="${TRILLIONX_MEMORY_LIMIT_MB:-4096}" app.js > logs/trillionx_app_fast.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2
echo "PID=$(cat runtime_state/TRILLIONX_MAIN_PID)"
echo "LOG=logs/trillionx_app_fast.log"
tail -30 logs/trillionx_app_fast.log || true
SH
chmod +x scripts/start_safe_fastlog.sh

echo "=== 5) Statut court instantané ==="
cat > scripts/tx_status.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== TRILLIONX STATUS COURT ==="
echo "--- git ---"; git status --short | head -30
echo "--- disk ---"; df -h .
echo "--- ram/load ---"; free -h 2>/dev/null || true; uptime
echo "--- node ---"; ps aux --sort=-%cpu | grep -E "node|app.js|TRILLIONX" | grep -v grep | head -15 || true
echo "--- ports ---"; ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:30[0-9][0-9]" | head -30 || true
SH
chmod +x scripts/tx_status.sh

echo "=== 6) Rapport ==="
node - <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const rep={
  engine:"TRILLIONX_TERMINAL_PROCESS_ACCELERATOR",
  time:new Date().toISOString(),
  status:"READY",
  safe:true,
  adds:["aliases","fast env","tx_fast","start_safe_fastlog","tx_status"],
  does_not_touch:["app.js","data","raid60_plus","node_modules"],
  commands:{
    txs:"start normal",
    "bash scripts/start_safe_fastlog.sh":"start background less scroll",
    "bash scripts/tx_status.sh":"short status",
    txr:"resource percent",
    txd:"safe disk guard",
    txk:"kill TRILLIONX node"
  }
};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.mkdirSync("reports",{recursive:true});
fs.mkdirSync("history",{recursive:true});
fs.writeFileSync("reports/TRILLIONX_TERMINAL_ACCELERATOR_LATEST.json",JSON.stringify(rep,null,2));
fs.appendFileSync("history/TRILLIONX_TERMINAL_ACCELERATOR_HISTORY.jsonl",JSON.stringify({time:rep.time,status:rep.status,seal:rep.seal})+"\n");
console.log(JSON.stringify(rep,null,2));
NODE

echo "============================================================"
echo "✅ TERMINAL ACCELERATOR OK"
echo "Recharge terminal: source ~/.bashrc"
echo "Puis: tx / txs / txr / txd / txg / txports"
echo "Ou lancement rapide: bash scripts/start_safe_fastlog.sh"
echo "============================================================"
