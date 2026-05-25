#!/usr/bin/env bash
set -u

ROOT="$(pwd)"
echo "=== TRILLIONX REACTIVATE ALL SAFE ==="
echo "ROOT=$ROOT"

mkdir -p logs runtime_state reports history async_results

echo
echo "=== 1) APP PRINCIPALE ==="
if ss -lntp 2>/dev/null | grep -q ':3000'; then
  echo "✅ port 3000 déjà actif"
else
  echo "PORT 3000 non actif -> lancement app.js"
  PORT=3000 nohup node app.js > logs/trillionx_reactivate_app.log 2>&1 &
  echo $! > runtime_state/TRILLIONX_MAIN_PID
  sleep 3
fi

echo
echo "=== 2) CHECK LOCAL HTTP ==="
curl -I --max-time 4 http://127.0.0.1:3000/ | head -8 || true
curl -sS --max-time 4 http://127.0.0.1:3000/api/health | head -c 500 || true
echo

echo
echo "=== 3) ROUTES API DISPONIBLES DANS app.js ==="
grep -nE "app\.(get|post|put|delete)\(" app.js \
  | sed -E "s/^[[:space:]]*//" \
  | head -300 \
  > reports/TRILLIONX_ROUTES_REACTIVATED.txt
wc -l reports/TRILLIONX_ROUTES_REACTIVATED.txt
head -60 reports/TRILLIONX_ROUTES_REACTIVATED.txt

echo
echo "=== 4) BOUTONS UI DETECTES ==="
grep -nE "<button|onclick=|load\(" app.js \
  | head -500 \
  > reports/TRILLIONX_UI_BUTTONS_REACTIVATED.txt
wc -l reports/TRILLIONX_UI_BUTTONS_REACTIVATED.txt
head -80 reports/TRILLIONX_UI_BUTTONS_REACTIVATED.txt

echo
echo "=== 5) SCRIPTS EXECUTABLES PRESENTS ==="
find . -maxdepth 3 -type f \( -name "*.sh" -o -name "*.js" \) \
  | sort \
  > reports/TRILLIONX_EXECUTABLE_CATALOG.txt
wc -l reports/TRILLIONX_EXECUTABLE_CATALOG.txt
head -120 reports/TRILLIONX_EXECUTABLE_CATALOG.txt

echo
echo "=== 6) DAEMONS EXISTANTS : relance douce si connus ==="
for f in \
  scripts/tx_micro_sync_daemon.js \
  scripts/tx_parallel_micro_sync.js \
  scripts/tx_watchdog.sh
do
  if [ -f "$f" ]; then
    if pgrep -af "$f" >/dev/null 2>&1; then
      echo "✅ déjà actif: $f"
    else
      echo "▶ lancement doux: $f"
      case "$f" in
        *.js) nohup node "$f" > "logs/$(basename "$f").log" 2>&1 & ;;
        *.sh) nohup bash "$f" > "logs/$(basename "$f").log" 2>&1 & ;;
      esac
      echo $! > "runtime_state/$(basename "$f").pid"
    fi
  else
    echo "absent: $f"
  fi
done

echo
echo "=== 7) ETAT PROCESSUS TRILLIONX/NODE ==="
ps aux | grep -E "node app.js|tx_|TRILLIONX|watchdog|micro" | grep -v grep | head -80 || true

echo
echo "=== 8) PORTS ==="
ss -lntp | grep -E ':3000|:3001|:3002|:3003|:400[0-9]|:401[0-9]' || true

echo
echo "=== 9) DISQUE / GIT ==="
df -h .
git status --short | wc -l || true
git status --short | head -80 || true

echo
echo "=== 10) RAPPORT JSON ==="
cat > reports/TRILLIONX_REACTIVATE_ALL_SAFE_LATEST.json <<JSON
{
  "engine":"TRILLIONX_REACTIVATE_ALL_SAFE",
  "time":"$(date -Iseconds)",
  "root":"$ROOT",
  "policy":{
    "no_delete":true,
    "no_clean":true,
    "no_node_modules_remove":true,
    "safe_reactivate_only":true
  },
  "checks":{
    "app_js_present":$(test -f app.js && echo true || echo false),
    "port_3000_listening":$(ss -lntp 2>/dev/null | grep -q ':3000' && echo true || echo false),
    "routes_catalog":"reports/TRILLIONX_ROUTES_REACTIVATED.txt",
    "ui_buttons_catalog":"reports/TRILLIONX_UI_BUTTONS_REACTIVATED.txt",
    "executable_catalog":"reports/TRILLIONX_EXECUTABLE_CATALOG.txt"
  }
}
JSON

cat reports/TRILLIONX_REACTIVATE_ALL_SAFE_LATEST.json

echo
echo "✅ REACTIVATION SAFE TERMINEE"
echo "Si HTTP/1.1 200 est visible, rafraîchis seulement l’URL -3000.app.github.dev."
