#!/data/data/com.termux/files/usr/bin/bash
set -u
cd "$HOME/TX3_TRILLIONS_v1.3_COCKPIT/TX3" || exit 1

MASTER_PID="$(pgrep -af TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM | awk 'NR==1{print $1}')"
[ -z "$MASTER_PID" ] && { echo "❌ Master fabric down"; exit 1; }
echo "✅ Master PID = $MASTER_PID (anti-virus target)"

# Trap pour restaurer le fabric original quoi qu'il arrive
restore_safety () {
  echo ""
  echo "=== RESTORATION DU FABRIC ORIGINAL ==="
  if [ -f TRILLIONX_EXTREME_COMBO.js.SAFETY_BACKUP ]; then
    cp TRILLIONX_EXTREME_COMBO.js.SAFETY_BACKUP TRILLIONX_EXTREME_COMBO.js
    echo "✅ Safety soft restaurée (400 MB threshold)"
  fi
}
trap restore_safety EXIT INT TERM

LOG_DIR="runtime_state/reality_hunt_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOG_DIR"
SUMMARY="$LOG_DIR/SUMMARY.txt"
echo "log dir: $LOG_DIR"

# Échelle RÉALITÉ - x25 du soft ceiling
LADDER=(
  "R1  60  500 100 3260"
  "R2 100  800  50 3360"
  "R3 150 1200  20 3460"
  "R4 200 1500  10 3560"
  "R5 300 2000   5 3760"
  "R6 400 3000   0 3960"
  "R7 500 3000   0 4160"
)

ABORT_FREEMEM_MB=180
CYCLE_TIMEOUT_S=600
COOLDOWN_S=30

snap () { free -m | awk '/^Mem:/ {printf "freemem=%dMB used=%dMB avail=%dMB", $4, $3, $7}'; }
alive () { kill -0 "$MASTER_PID" 2>/dev/null; }

echo "" | tee -a "$SUMMARY"
echo "========================================================" | tee -a "$SUMMARY"
echo "  TX3 REALITY HUNT - NO SAFETY NET - $(date)" | tee -a "$SUMMARY"
echo "  Target: hard panic floor / anti-virus certification" | tee -a "$SUMMARY"
echo "========================================================" | tee -a "$SUMMARY"
echo "Baseline: $(snap)" | tee -a "$SUMMARY"

LAST_OK=""
DEATH=""

for ROW in "${LADDER[@]}"; do
  read TAG CLONES ATTACK_N SPAWN_DELAY PORT_END <<<"$ROW"
  LOAD=$((CLONES * ATTACK_N))

  echo "" | tee -a "$SUMMARY"
  echo "--------------------------------------------------------" | tee -a "$SUMMARY"
  echo " $TAG  CLONES=$CLONES  ATTACK_N=$ATTACK_N  DELAY=${SPAWN_DELAY}ms  LOAD=$LOAD" | tee -a "$SUMMARY"
  echo "--------------------------------------------------------" | tee -a "$SUMMARY"
  echo "pre  : $(snap)" | tee -a "$SUMMARY"

  if ! alive; then
    DEATH="MASTER_DEAD_BEFORE_$TAG"
    echo "☠️  Master mort avant $TAG. STOP." | tee -a "$SUMMARY"
    break
  fi

  CLOG="$LOG_DIR/${TAG}.log"
  WFLAG="$LOG_DIR/${TAG}.abort"

  (
    LOW=0
    while [ ! -f "$WFLAG.done" ]; do
      FM=$(free -m | awk '/^Mem:/ {print $4}')
      if [ "$FM" -lt "$ABORT_FREEMEM_MB" ]; then LOW=$((LOW+1)); else LOW=0; fi
      if [ "$LOW" -ge 3 ]; then
        echo "WATCHDOG kernel-protection: ${FM}MB < ${ABORT_FREEMEM_MB}MB x3" >> "$CLOG"
        touch "$WFLAG"
        pkill -KILL -f TRILLIONX_EXTREME_COMBO.js 2>/dev/null
        pkill -KILL -f TRILLIONX_FABRIC_CLONE 2>/dev/null
        break
      fi
      sleep 1
    done
  ) &
  WBG=$!

  T0=$(date +%s)
  CLONES="$CLONES" ATTACK_N="$ATTACK_N" SPAWN_DELAY="$SPAWN_DELAY" \
    PORT_START=3161 PORT_END="$PORT_END" \
    timeout --kill-after=10s "$CYCLE_TIMEOUT_S" \
    node TRILLIONX_EXTREME_COMBO.js > "$CLOG" 2>&1
  EXIT=$?
  DUR=$(( $(date +%s) - T0 ))

  touch "$WFLAG.done"
  wait "$WBG" 2>/dev/null

  echo "post : $(snap)  exit=$EXIT  dur=${DUR}s" | tee -a "$SUMMARY"

  JSON="runtime_state/bench/trillionx_extreme_combo_last.json"
  if [ -f "$JSON" ]; then
    PANIC=$(grep -o '"panic"[^,}]*' "$JSON" | head -1)
    AK=$(grep -o '"auto_kill_count"[^,}]*' "$JSON" | head -1)
    FMMIN=$(grep -o '"freemem_min_during"[^,}]*' "$JSON" | head -1)
    OK=$(grep -o '"clones_ok"[^,}]*' "$JSON" | head -1)
    echo "       $OK | $PANIC | $AK | $FMMIN" | tee -a "$SUMMARY"
    cp "$JSON" "$LOG_DIR/${TAG}_report.json"
  fi

  if [ -f "$WFLAG" ]; then DEATH="KERNEL_PROTECTION_$TAG"; echo "🛑 Kernel watchdog. HARD LIMIT trouvée."| tee -a "$SUMMARY"; break; fi
  if [ "$EXIT" -eq 124 ]; then DEATH="TIMEOUT_$TAG"; echo "⏰ Timeout $TAG."| tee -a "$SUMMARY"; break; fi
  if ! alive; then DEATH="MASTER_KILLED_$TAG"; echo "💀 Master 13640 TUÉ pendant $TAG"| tee -a "$SUMMARY"; break; fi
  if [ "$EXIT" -ne 0 ]; then DEATH="EXIT_${EXIT}_$TAG"; echo "💥 Exit $EXIT"| tee -a "$SUMMARY"; break; fi

  LAST_OK="$TAG (load=$LOAD)"

  pkill -KILL -f TRILLIONX_FABRIC_CLONE 2>/dev/null
  sleep 3
  echo "cool : ${COOLDOWN_S}s GC..." | tee -a "$SUMMARY"
  sleep "$COOLDOWN_S"
done

echo "" | tee -a "$SUMMARY"
echo "========================================================" | tee -a "$SUMMARY"
echo "  REALITY VERDICT - ANTI-VIRUS CERTIFICATION" | tee -a "$SUMMARY"
echo "========================================================" | tee -a "$SUMMARY"
echo "Last cycle survived : ${LAST_OK:-NONE}" | tee -a "$SUMMARY"
echo "Death reason        : ${DEATH:-ALL_CYCLES_SURVIVED}" | tee -a "$SUMMARY"
echo "Master PID 13640    : $(alive && echo "✅ STILL ALIVE - ANTI-VIRUS GRADE" || echo "❌ DEAD")" | tee -a "$SUMMARY"
echo "Final state         : $(snap)" | tee -a "$SUMMARY"
echo "Logs                : $LOG_DIR" | tee -a "$SUMMARY"
echo "========================================================" | tee -a "$SUMMARY"
