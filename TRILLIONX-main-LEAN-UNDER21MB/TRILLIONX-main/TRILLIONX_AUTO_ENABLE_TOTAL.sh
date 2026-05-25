#!/usr/bin/env bash
set +e

ROOT="$(pwd)"
TS="$(date +%Y%m%d_%H%M%S)"

echo "=================================================="
echo " TRILLIONX AUTO ENABLE TOTAL"
echo " bibliothèques/catalogues/registres/scripts/api"
echo " runtimes/mémoire/VR/coprocesseurs/processeurs"
echo "=================================================="

mkdir -p runtime_state logs reports/auto_enable reports/catalogs reports/registry reports/apis reports/libraries reports/scripts reports/runtime reports/memory reports/vr reports/coprocessors reports/processors

REPORT="reports/auto_enable/TRILLIONX_AUTO_ENABLE_TOTAL_$TS.txt"
JSON="reports/auto_enable/TRILLIONX_AUTO_ENABLE_TOTAL_$TS.json"

log(){
  echo "$1" | tee -a "$REPORT"
}

run_safe(){
  name="$1"
  cmd="$2"
  log ""
  log "=== $name ==="
  timeout 25 bash -lc "$cmd" >> "$REPORT" 2>&1 || true
}

log "ROOT=$ROOT"
log "TIME=$(date -Iseconds)"
log "MODE=AUTO_ENABLE_TOTAL"
log "HONESTY=REAL_ONLY_OR_UNAVAILABLE / virtual layers are labels unless backed by real process/file"

echo "TRILLIONX_AUTO_ENABLE_TOTAL_ACTIVE" > runtime_state/AUTO_ENABLE_TOTAL.flag
echo "$TS" > runtime_state/AUTO_ENABLE_TOTAL_TS

# 1) Inventaire total sans node_modules/.git
log ""
log "=== FULL FILE INVENTORY ==="
find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -type f -print | sort > reports/catalogs/ALL_FILES_$TS.txt

wc -l reports/catalogs/ALL_FILES_$TS.txt | tee -a "$REPORT"

# 2) Bibliothèques / dépendances
log ""
log "=== LIBRARIES / PACKAGE DETECTION ==="
find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  \( -name 'package.json' -o -name 'package-lock.json' -o -name 'requirements.txt' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' \) \
  -type f -print | sort > reports/libraries/LIBRARY_MANIFESTS_$TS.txt

cat reports/libraries/LIBRARY_MANIFESTS_$TS.txt | tee -a "$REPORT"

if [ -f package.json ]; then
  run_safe "NPM PACKAGE SUMMARY" "node -e 'let p=require(\"./package.json\"); console.log(JSON.stringify({name:p.name,version:p.version,scripts:p.scripts,dependencies:Object.keys(p.dependencies||{}),devDependencies:Object.keys(p.devDependencies||{})},null,2))'"
fi

# 3) Catalogues / registres / dictionnaires
log ""
log "=== CATALOGS / REGISTRIES / DICT ==="
find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -type f \
  | grep -Ei 'catalog|registry|registre|dict|dictionary|manifest|index|map|routes|config|state|ledger|guard|catalogue' \
  | sort > reports/registry/REGISTRY_FILES_$TS.txt

cat reports/registry/REGISTRY_FILES_$TS.txt | head -300 | tee -a "$REPORT"

# 4) Scripts exécutables ou activables
log ""
log "=== SCRIPTS DETECTION ==="
find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -type f \
  | grep -Ei '\.(sh|js|mjs|cjs|py|ts)$' \
  | sort > reports/scripts/SCRIPTS_ALL_$TS.txt

cat reports/scripts/SCRIPTS_ALL_$TS.txt | head -400 | tee -a "$REPORT"

# 5) API routes
log ""
log "=== API ROUTES DETECTION ==="
grep -RniE "app\.(get|post|put|delete|patch)\(|router\.(get|post|put|delete|patch)\(" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  > reports/apis/API_ROUTES_FULL_$TS.txt 2>/dev/null || true

cat reports/apis/API_ROUTES_FULL_$TS.txt | head -400 | tee -a "$REPORT"

# 6) Runtime / workers / cluster
log ""
log "=== RUNTIME / WORKERS / CLUSTER DETECTION ==="
grep -RniE "worker_threads|cluster|child_process|spawn\(|fork\(|exec\(|SharedArrayBuffer|WebSocket|socket.io|pm2|watchdog|runtime|daemon|scheduler|orchestrator" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  > reports/runtime/RUNTIME_FEATURES_$TS.txt 2>/dev/null || true

cat reports/runtime/RUNTIME_FEATURES_$TS.txt | head -400 | tee -a "$REPORT"

# 7) Mémoire / VR / RAID / mirror / cache
log ""
log "=== MEMORY / VR / RAID / MIRROR / CACHE DETECTION ==="
grep -RniE "memory|cache|L1|L2|L3|L4|L5|L6|L56|raid|raid60|mirror|vr|virtual|ecc|ramdisk|tmpfs|mmap|buffer|ArrayBuffer|SharedArrayBuffer" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  > reports/memory/MEMORY_VR_RAID_CACHE_$TS.txt 2>/dev/null || true

cat reports/memory/MEMORY_VR_RAID_CACHE_$TS.txt | head -500 | tee -a "$REPORT"

# 8) Coprocesseurs / processeurs / GPU / SIMD
log ""
log "=== PROCESSORS / COPROCESSORS / GPU / SIMD DETECTION ==="
grep -RniE "processor|cpu|gpu|coprocessor|cuda|opencl|webgpu|vulkan|simd|avx|sse|neon|worker|thread|hash|flops|hpc|zeta" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  > reports/processors/PROCESSOR_COPROCESSOR_$TS.txt 2>/dev/null || true

cat reports/processors/PROCESSOR_COPROCESSOR_$TS.txt | head -500 | tee -a "$REPORT"

# 9) Création index maître JSON
log ""
log "=== BUILD MASTER INDEX JSON ==="
node <<NODE > "$JSON" 2>/dev/null
const fs=require("fs");
const read=p=>fs.existsSync(p)?fs.readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean):[];
const obj={
  time:new Date().toISOString(),
  root:process.cwd(),
  mode:"AUTO_ENABLE_TOTAL",
  catalogs:read("reports/catalogs/ALL_FILES_$TS.txt").length,
  library_manifests:read("reports/libraries/LIBRARY_MANIFESTS_$TS.txt"),
  registry_files:read("reports/registry/REGISTRY_FILES_$TS.txt"),
  scripts:read("reports/scripts/SCRIPTS_ALL_$TS.txt"),
  api_routes_count:read("reports/apis/API_ROUTES_FULL_$TS.txt").length,
  runtime_features_count:read("reports/runtime/RUNTIME_FEATURES_$TS.txt").length,
  memory_vr_raid_cache_count:read("reports/memory/MEMORY_VR_RAID_CACHE_$TS.txt").length,
  processor_coprocessor_count:read("reports/processors/PROCESSOR_COPROCESSOR_$TS.txt").length,
  honesty:"REAL_ONLY_OR_UNAVAILABLE; virtual hardware is orchestration metadata unless backed by real OS resources"
};
console.log(JSON.stringify(obj,null,2));
NODE

cat "$JSON" | tee -a "$REPORT"

# 10) Activation fichiers scripts sûrs
log ""
log "=== CHMOD SAFE SCRIPTS ==="
while read -r f; do
  case "$f" in
    *.sh) chmod +x "$f" 2>/dev/null || true ;;
  esac
done < reports/scripts/SCRIPTS_ALL_$TS.txt

# 11) Activation automatique des scripts non dangereux connus
log ""
log "=== AUTO START KNOWN SAFE RUNTIMES ==="

start_bg(){
  label="$1"
  cmd="$2"
  logfile="$3"
  log "[START] $label -> $cmd"
  nohup bash -lc "$cmd" > "$logfile" 2>&1 &
  echo $! > "runtime_state/${label}.pid"
  sleep 0.3
}

pkill -f "node app.js" 2>/dev/null || true
pkill -f "trillionx_network_runtime.js" 2>/dev/null || true
pkill -f "tx_parallel_micro_sync.js" 2>/dev/null || true
pkill -f "tx_micro_sync_daemon.js" 2>/dev/null || true
pkill -f "tx_watchdog" 2>/dev/null || true

[ -f "scripts/tx_watchdog_start.sh" ] && start_bg "TX_WATCHDOG" "bash scripts/tx_watchdog_start.sh" "logs/tx_watchdog_$TS.log"
[ -f "scripts/tx_parallel_micro_sync.js" ] && start_bg "TX_PARALLEL_MICRO_SYNC" "node scripts/tx_parallel_micro_sync.js" "logs/tx_parallel_micro_sync_$TS.log"
[ -f "scripts/tx_micro_sync_daemon.js" ] && start_bg "TX_MICRO_SYNC_DAEMON" "node scripts/tx_micro_sync_daemon.js" "logs/tx_micro_sync_daemon_$TS.log"
[ -f "trillionx_network_runtime.js" ] && start_bg "TRILLIONX_NETWORK_RUNTIME" "node trillionx_network_runtime.js" "logs/trillionx_network_runtime_$TS.log"
[ -f "app.js" ] && start_bg "TRILLIONX_APPJS" "PORT=3000 node app.js" "logs/app_3000_$TS.log"

# 12) Port + santé
sleep 3
log ""
log "=== PORTS ==="
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null || true) | tee -a "$REPORT"

log ""
log "=== CURL LOCAL 3000 ==="
curl -I --max-time 5 http://127.0.0.1:3000/ 2>&1 | tee -a "$REPORT" || true

log ""
log "=== PROCESS MAP ==="
ps aux | grep -Ei 'node|trillionx|tx_|watchdog|sync|runtime' | grep -v grep | tee -a "$REPORT" || true

log ""
log "=== DISK / MEMORY ==="
df -h | tee -a "$REPORT"
free -h | tee -a "$REPORT"

# 13) Derniers logs utiles
log ""
log "=== LAST APP LOG ==="
ls -t logs/app_3000_*.log 2>/dev/null | head -1 | xargs -r tail -80 | tee -a "$REPORT"

log ""
log "=== AUTO ENABLE TOTAL COMPLETE ==="
log "REPORT=$REPORT"
log "JSON=$JSON"
