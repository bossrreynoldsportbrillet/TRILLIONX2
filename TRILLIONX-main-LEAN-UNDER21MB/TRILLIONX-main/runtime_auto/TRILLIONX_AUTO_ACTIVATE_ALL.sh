#!/usr/bin/env bash

ROOT="$(pwd)"

safe_run(){
  CMD="$1"
  echo
  echo "[RUN] $CMD"
  timeout 20 bash -lc "$CMD" || true
}

detect_bin(){
  command -v "$1" >/dev/null 2>&1
}

echo "======================================="
echo " TRILLIONX AUTO DETECTION ENGINE"
echo "======================================="

DATE=$(date +%s)

export TRILLIONX_AUTO_MODE=1
export TRILLIONX_REAL_ONLY=1
export TRILLIONX_RUNTIME_ACTIVE=1
export TRILLIONX_AUTO_RUNTIME_SCAN=1

AUTO_JSON="reports/runtime_auto/TRILLIONX_AUTO_STATUS_${DATE}.json"

CPU=$(nproc 2>/dev/null || echo 1)
RAM=$(free -g 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)

NODE_OK=0
PM2_OK=0
DOCKER_OK=0
GIT_OK=0
GPU_OK=0
PYTHON_OK=0

detect_bin node && NODE_OK=1
detect_bin pm2 && PM2_OK=1
detect_bin docker && DOCKER_OK=1
detect_bin git && GIT_OK=1
detect_bin python3 && PYTHON_OK=1

if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_OK=1
fi

cat > "$AUTO_JSON" <<JSON
{
 "time":"$(date -Iseconds)",
 "cpu_threads":"$CPU",
 "ram_gb":"$RAM",
 "node":"$NODE_OK",
 "pm2":"$PM2_OK",
 "docker":"$DOCKER_OK",
 "git":"$GIT_OK",
 "gpu":"$GPU_OK",
 "python":"$PYTHON_OK",
 "mode":"FULL_AUTO_DETECTION"
}
JSON

echo
echo "======================================="
echo " AUTO ACTIVATION"
echo "======================================="

mkdir -p runtime_state logs mesh_nodes

safe_run "pkill -f tx_watchdog.sh"
safe_run "pkill -f tx_parallel_micro_sync.js"
safe_run "pkill -f tx_micro_sync_daemon.js"
safe_run "pkill -f trillionx_network_runtime.js"

if [ -f scripts/tx_watchdog_start.sh ]; then
  nohup bash scripts/tx_watchdog_start.sh \
  > logs/watchdog.log 2>&1 &
  echo $! > runtime_state/WATCHDOG_PID
fi

if [ -f scripts/tx_parallel_micro_sync.js ]; then
  nohup node scripts/tx_parallel_micro_sync.js \
  > logs/parallel_sync.log 2>&1 &
  echo $! > runtime_state/PARALLEL_SYNC_PID
fi

if [ -f scripts/tx_micro_sync_daemon.js ]; then
  nohup node scripts/tx_micro_sync_daemon.js \
  > logs/micro_sync.log 2>&1 &
  echo $! > runtime_state/MICRO_SYNC_PID
fi

if [ -f trillionx_network_runtime.js ]; then
  nohup node trillionx_network_runtime.js \
  > logs/network_runtime.log 2>&1 &
  echo $! > runtime_state/NETWORK_RUNTIME_PID
fi

if [ -f app.js ]; then
  nohup node app.js \
  > logs/app_runtime.log 2>&1 &
  echo $! > runtime_state/APP_PID
fi

echo
echo "======================================="
echo " AUTO WORKER DETECTION"
echo "======================================="

grep -RniE \
'worker_threads|cluster|fork\(|spawn\(|child_process|SharedArrayBuffer' \
. \
--exclude-dir=node_modules \
--exclude-dir=.git \
> reports/runtime_auto/PARALLEL_DISCOVERY.txt 2>/dev/null || true

echo
echo "======================================="
echo " API DETECTION"
echo "======================================="

grep -RniE \
'app\.(get|post|put|delete)\(' \
. \
--exclude-dir=node_modules \
--exclude-dir=.git \
> reports/runtime_auto/API_DISCOVERY.txt 2>/dev/null || true

echo
echo "======================================="
echo " PORT DETECTION"
echo "======================================="

(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) \
> reports/runtime_auto/PORTS.txt || true

echo
echo "======================================="
echo " PROCESS STATUS"
echo "======================================="

ps aux \
| grep -Ei 'node|watchdog|parallel|sync|trillionx' \
| grep -v grep \
> reports/runtime_auto/PROCESS.txt || true

cat reports/runtime_auto/PROCESS.txt | head -80

echo
echo "======================================="
echo " GPU DETECTION"
echo "======================================="

if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi | head -40
else
  echo "GPU_UNAVAILABLE_IN_CODESPACES"
fi

echo
echo "======================================="
echo " RUNTIME HEALTH"
echo "======================================="

echo "CPU THREADS : $CPU"
echo "RAM GB      : $RAM"
echo "NODE        : $NODE_OK"
echo "PM2         : $PM2_OK"
echo "DOCKER      : $DOCKER_OK"
echo "PYTHON      : $PYTHON_OK"
echo "GPU         : $GPU_OK"

echo
echo "======================================="
echo " FULL AUTO ACTIVATION COMPLETE"
echo "======================================="
