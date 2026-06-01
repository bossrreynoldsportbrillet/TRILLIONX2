#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/TX3_TRILLIONS_v1.3_COCKPIT/TX3" || exit 1
PID="$(pgrep -af TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM|awk 'NR==1{print $1}')"
[ -z "$PID" ] && { echo "❌ master down"; exit 1; }
echo "✅ master PID $PID"
LOG="runtime_state/mu_inject_$(date +%H%M%S)"
mkdir -p "$LOG"
SUM="$LOG/SUM.txt"
echo "=== μ-INJECTION SUITE $(date) ===" | tee -a "$SUM"
echo "master PID $PID" | tee -a "$SUM"
run_profile() {
  local TAG=$1 DUR=$2 TGT=$3
  echo "" | tee -a "$SUM"
  echo "--- $TAG dur=${DUR}s target_lat=${TGT}ms ---" | tee -a "$SUM"
  echo "pre  : $(free -m|awk '/^Mem:/ {printf "fm=%dMB",$4}')" | tee -a "$SUM"
  DURATION_S="$DUR" TARGET_LAT_MS="$TGT" node MU_INJECT.js > "$LOG/${TAG}.log" 2>&1
  E=$?
  echo "post : $(free -m|awk '/^Mem:/ {printf "fm=%dMB",$4}') exit=$E" | tee -a "$SUM"
  grep -E "Ops/sec|Success%|Lat (avg|p50|p95|p99|max)|Yield fin" "$LOG/${TAG}.log" | tee -a "$SUM"
  kill -0 "$PID" 2>/dev/null && echo "master: ALIVE" | tee -a "$SUM" || { echo "master: DEAD" | tee -a "$SUM"; return 1; }
  curl -sf -m 3 http://127.0.0.1:3160/api/memory-fabric >/dev/null && echo "API: OK" | tee -a "$SUM" || echo "API: KO" | tee -a "$SUM"
}
run_profile "P1_warmup"     30  50  || exit 1
echo "" | tee -a "$SUM"; echo "cool 10s..." | tee -a "$SUM"; sleep 10
run_profile "P2_baseline"  120  50  || exit 1
echo "" | tee -a "$SUM"; echo "cool 15s..." | tee -a "$SUM"; sleep 15
run_profile "P3_endurance" 600  100 || exit 1
echo "" | tee -a "$SUM"
echo "=== FINAL ===" | tee -a "$SUM"
echo "master $PID: $(kill -0 $PID 2>/dev/null && echo ALIVE || echo DEAD)" | tee -a "$SUM"
echo "API: $(curl -sf -m 3 http://127.0.0.1:3160/api/memory-fabric >/dev/null && echo OK || echo KO)" | tee -a "$SUM"
echo "mem: $(free -m|awk '/^Mem:/ {printf "fm=%dMB av=%dMB",$4,$7}')" | tee -a "$SUM"
echo "logs: $LOG" | tee -a "$SUM"
