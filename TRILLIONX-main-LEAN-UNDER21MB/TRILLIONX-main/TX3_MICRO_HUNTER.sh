#!/data/data/com.termux/files/usr/bin/bash
set -u
cd "$HOME/TX3_TRILLIONS_v1.3_COCKPIT/TX3" || exit 1

MASTER_PID="$(pgrep -af TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM | awk 'NR==1{print $1}')"
[ -z "$MASTER_PID" ] && { echo "❌ Master fabric down"; exit 1; }
echo "✅ Master PID = $MASTER_PID"

LOG_DIR="runtime_state/micro_hunt_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOG_DIR"
SUM="$LOG_DIR/SUMMARY.txt"

# Échelle μ-packet : CLONES ATTACK_N BURST_SIZE YIELD_MS
LADDER=(
  "M1  60  500  30  2"
  "M2 100  800  30  2"
  "M3 200 1500  30  2"
  "M4 400 2500  40  2"
  "M5 600 4000  50  1"
  "M6 800 6250  50  1"
)

ABORT_FM=150
TIMEOUT_S=900
COOL_S=25

snap () { free -m | awk '/^Mem:/ {printf "fm=%dMB av=%dMB", $4, $7}'; }
alive () { kill -0 "$MASTER_PID" 2>/dev/null; }
api_alive () { curl -sf -m 2 "http://127.0.0.1:3160/api/memory-fabric" >/dev/null 2>&1; }

echo "========================================================" | tee -a "$SUM"
echo "  TX3 μ-PACKET REALITY HUNT v2 - $(date)" | tee -a "$SUM"
echo "  Target: 5M ops without SIGKILL" | tee -a "$SUM"
echo "========================================================" | tee -a "$SUM"
echo "Master  : PID $MASTER_PID" | tee -a "$SUM"
echo "Baseline: $(snap)" | tee -a "$SUM"

LAST=""
DEATH=""

for ROW in "${LADDER[@]}"; do
  read TAG CL AN BS YM <<<"$ROW"
  LOAD=$((CL * AN))
  echo "" | tee -a "$SUM"
  echo "--------------------------------------------------------" | tee -a "$SUM"
  echo " $TAG  CL=$CL  AN=$AN  BURST=$BS  YIELD=${YM}ms  LOAD=$LOAD" | tee -a "$SUM"
  echo "--------------------------------------------------------" | tee -a "$SUM"
  echo "pre   : $(snap)" | tee -a "$SUM"

  if ! alive || ! api_alive; then DEATH="MASTER_DEAD_BEFORE_$TAG"; echo "☠️  Master mort"| tee -a "$SUM"; break; fi

  CLOG="$LOG_DIR/${TAG}.log"
  WFLAG="$LOG_DIR/${TAG}.abort"

  (
    LOW=0
    while [ ! -f "$WFLAG.done" ]; do
      FM=$(free -m | awk '/^Mem:/ {print $4}')
      [ "$FM" -lt "$ABORT_FM" ] && LOW=$((LOW+1)) || LOW=0
      if [ "$LOW" -ge 3 ]; then
        echo "WATCHDOG kernel: ${FM}MB" >> "$CLOG"
        touch "$WFLAG"
        pkill -KILL -f MICRO_ATTACKER.js 2>/dev/null
        break
      fi
      sleep 1
    done
  ) &
  WBG=$!

  T0=$(date +%s)
  CLONES="$CL" ATTACK_N="$AN" BURST_SIZE="$BS" YIELD_MS="$YM" \
    timeout --kill-after=10s "$TIMEOUT_S" \
    node MICRO_ATTACKER.js > "$CLOG" 2>&1
  EXIT=$?
  DUR=$(( $(date +%s) - T0 ))
  touch "$WFLAG.done"
  wait "$WBG" 2>/dev/null

  OPS=$(grep "Ops completed" "$CLOG" | awk '{print $NF}')
  OPSEC=$(grep "Ops/sec" "$CLOG" | awk '{print $NF}')
  MAL=$(grep "Master alive" "$CLOG" | awk '{print $NF}')

  echo "post  : $(snap) exit=$EXIT dur=${DUR}s" | tee -a "$SUM"
  echo "result: ops=${OPS:-?} ops/s=${OPSEC:-?} master_alive=${MAL:-?}" | tee -a "$SUM"

  if [ -f "$WFLAG" ]; then DEATH="KERNEL_WATCHDOG_$TAG"; echo "🛑 Kernel watchdog"| tee -a "$SUM"; break; fi
  if [ "$EXIT" -eq 137 ] || [ "$EXIT" -eq 139 ]; then DEATH="SIGKILL_ATTACKER_$TAG"; echo "💀 SIGKILL parent (signal 9)"| tee -a "$SUM"; break; fi
  if ! alive; then DEATH="MASTER_KILLED_$TAG"; echo "☠️  Master $MASTER_PID TUÉ"| tee -a "$SUM"; break; fi
  if ! api_alive; then DEATH="MASTER_UNRESPONSIVE_$TAG"; echo "💤 Master process vivant mais API morte"| tee -a "$SUM"; break; fi
  if [ "$EXIT" -ne 0 ]; then DEATH="EXIT_${EXIT}_$TAG"; echo "⚠️ exit=$EXIT"| tee -a "$SUM"; break; fi

  LAST="$TAG (load=$LOAD ops=$OPS)"
  echo "cool  : ${COOL_S}s..." | tee -a "$SUM"
  sleep "$COOL_S"
done

echo "" | tee -a "$SUM"
echo "========================================================" | tee -a "$SUM"
echo "  μ-PACKET FINAL VERDICT" | tee -a "$SUM"
echo "========================================================" | tee -a "$SUM"
echo "Last cycle survived : ${LAST:-NONE}" | tee -a "$SUM"
echo "Death reason        : ${DEATH:-ALL_5M_OPS_SURVIVED}" | tee -a "$SUM"
echo "Master PID $MASTER_PID    : $(alive && echo "✅ ALIVE" || echo "❌ DEAD")" | tee -a "$SUM"
echo "API responding      : $(api_alive && echo "✅ YES" || echo "❌ NO")" | tee -a "$SUM"
echo "Final state         : $(snap)" | tee -a "$SUM"
echo "Logs                : $LOG_DIR" | tee -a "$SUM"
echo "========================================================" | tee -a "$SUM"
