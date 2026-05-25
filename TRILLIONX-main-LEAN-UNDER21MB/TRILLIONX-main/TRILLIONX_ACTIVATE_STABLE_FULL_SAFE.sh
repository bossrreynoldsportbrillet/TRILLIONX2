#!/usr/bin/env bash
set -u

echo "============================================================"
echo " TRILLIONX2 STABLE FULL SAFE ACTIVATION"
echo "============================================================"

mkdir -p logs reports runtime_state backups

echo "=== 1) BACKUP LEGER ==="
TS="$(date +%Y%m%d_%H%M%S)"
cp app.js "backups/app.before_full_safe_activation_${TS}.js" 2>/dev/null || true

echo "=== 2) ENV ACTIVATION STABLE ==="
cat > .trillionx_stable_activation.env <<ENV
TRILLIONX_MODE=STABLE_FULL_SAFE
TRILLIONX_REAL_ONLY=true
TRILLIONX_NO_FAKE_METRICS=true
TRILLIONX_SAFE_REPAIR_ONLY=true
TRILLIONX_UI_ACTIVE=true
TRILLIONX_API_ACTIVE=true
TRILLIONX_SOCKET_ACTIVE=true
TRILLIONX_RUNTIME_ACTIVE=true
TRILLIONX_MODULES_VISIBLE=true
TRILLIONX_TERMINAL_SAFE=true
TRILLIONX_AUTOGROWTH=false
TRILLIONX_HEAVY_JOBS=false
TRILLIONX_NO_NPM_INSTALL_REQUIRED=true
PORT=3000
ENV

echo "=== 3) STOP DOUBLONS NODE APP.JS ==="
pkill -f "node app.js" 2>/dev/null || true
sleep 1

echo "=== 4) LANCEMENT APP.JS PORT 3000 ==="
PORT=3000 nohup node app.js > logs/trillionx_full_safe_activation_3000.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 3

echo "=== 5) CHECK PORT LOCAL ==="
if curl -I --max-time 5 http://127.0.0.1:3000/ | head -8; then
  HTTP_OK=true
else
  HTTP_OK=false
fi

echo "=== 6) CHECK PROCESS ==="
ps aux | grep -E "node app.js|TRILLIONX|trillionx" | grep -v grep | head -20 || true

echo "=== 7) CHECK ROUTES PRINCIPALES ==="
ROUTES=(
  "/"
  "/api/health"
  "/api/system"
  "/api/cockpit"
  "/api/ports"
  "/api/runtime"
  "/api/capacity"
  "/api/network"
  "/api/modules"
  "/api/repo"
  "/api/security"
  "/api/workload"
)

: > reports/TRILLIONX2_FULL_SAFE_ROUTES_CHECK.txt
for r in "${ROUTES[@]}"; do
  code="$(curl -s -o /tmp/trillionx_route.out -w "%{http_code}" --max-time 5 "http://127.0.0.1:3000$r" || echo "000")"
  echo "$code $r" | tee -a reports/TRILLIONX2_FULL_SAFE_ROUTES_CHECK.txt
done

echo "=== 8) RAPPORT ACTIVATION ==="
cat > reports/TRILLIONX2_STABLE_FULL_SAFE_ACTIVATION.txt <<REPORT
TRILLIONX2_STABLE_FULL_SAFE_ACTIVATION
time_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mode=STABLE_FULL_SAFE
port=3000
http_ok=$HTTP_OK
real_only=true
no_fake_metrics=true
safe_repair_only=true
ui_active=true
api_active=true
socket_expected=true
terminal_safe=true
autogrowth=false
heavy_jobs=false
npm_install_required=false
backup=backups/app.before_full_safe_activation_${TS}.js
REPORT

echo "=== 9) GIT CHECKPOINT ==="
git add .trillionx_stable_activation.env reports/TRILLIONX2_FULL_SAFE_ROUTES_CHECK.txt reports/TRILLIONX2_STABLE_FULL_SAFE_ACTIVATION.txt runtime_state/TRILLIONX_MAIN_PID backups/app.before_full_safe_activation_${TS}.js 2>/dev/null || true
git commit -m "Activate TRILLIONX2 stable full safe mode" || echo "Rien à commit"

echo "============================================================"
echo "✅ ACTIVATION STABLE SAFE TERMINEE"
echo "Ouvre/rafraîchis le port 3000."
echo "Si HTTP 200 + UI visible = stable actif."
echo "============================================================"
