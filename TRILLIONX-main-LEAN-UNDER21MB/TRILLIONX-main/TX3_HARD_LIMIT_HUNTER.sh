#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#   TX3 HARD LIMIT HUNTER - Exponential Escalation
# ============================================================
set -u
cd "$HOME/TX3_TRILLIONS_v1.3_COCKPIT/TX3" || { echo "❌ TX3 dir missing"; exit 1; }

MASTER_PID_EXPECTED="$(pgrep -af TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM | awk 'NR==1{print $1}')"
[ -z "$MASTER_PID_EXPECTED" ] && { echo "❌ Master fabric not running. Start it first."; exit 1; }
echo "✅ Master fabric PID = $MASTER_PID_EXPECTED (must survive ALL cycles)"

LOG_DIR="runtime_state/hard_limit_hunt_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOG_DIR"
SUMMARY="$LOG_DIR/SUMMARY.txt"
echo "log dir: $LOG_DIR"

LADDER=(
  "30 100 400 3190"
  "40 150 200 3200"
  "60 200 100 3220"
  "80 300  50 3240"
  "120 500   0 3280"
)

ABORT_FREEMEM_MB=200
CYCLE_TIMEOUT_S=300
COOLDOWN_S=20

snapshot_mem () {
  free -m | awk '/^Mem:/ {printf "freemem=%dMB used=%dMB avail=%dMB", $4, $3, $7}'
}

master_alive () {
  kill -0 "$MASTER_PID_EXPECTED" 2>/dev/null
}

echo "" | tee -a "$SUMMARY"
echo "============================================================" | tee -a "$SUMMARY"
echo "  TX3 HARD LIMIT HUNT - $(date)" | tee -a "$SUMMARY"
echo "============================================================" | tee -a "$SUMMARY"
echo "Baseline state: $(snapshot_mem)" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

CYCLE_IDX=0
LAST_SURVIVED=""
DEATH_REASON=""

for ROW in "${LADDER[@]}"; do
  CYCLE_IDX=$((CYCLE_IDX+1))
  read CLONES ATTACK_N SPAWN_DELAY PORT_END <<<"$ROW"
  TOTAL_LOAD=$((CLONES * ATTACK_N))

  echo "" | tee -a "$SUMMARY"
  echo "------------------------------------------------------------" | tee -a "$SUMMARY"
  echo " CYCLE C$CYCLE_IDX  CLONES=$CLONES  ATTACK_N=$ATTACK_N  DELAY=${SPAWN_DELAY}ms  LOAD=$TOTAL_LOAD" | tee -a "$SUMMARY"
  echo "------------------------------------------------------------" | tee -a "$SUMMARY"
  echo "pre  : $(snapshot_mem)" | tee -a "$SUMMARY"

  if ! master_alive; then
    DEATH_REASON="MASTER_DEAD_BEFORE_C${CYCLE_IDX}"
    echo "❌ Master fabric PID $MASTER_PID_EXPECTED is GONE. Abort." | tee -a "$SUMMARY"
    break
  fi

  CYCLE_LOG="$LOG_DIR/C${CYCLE_IDX}_clones${CLONES}_attack${ATTACK_N}.log"
  WATCHDOG_FLAG="$LOG_DIR/C${CYCLE_IDX}.abort"
  (
    LOW=0
    while [ ! -f "$WATCHDOG_FLAG.done" ]; do
      FM=$(free -m | awk '/^Mem:/ {print $4}')
      if [ "$FM" -lt "$ABORT_FREEMEM_MB" ]; then
        LOW=$((LOW+1))
      else
        LOW=0
      fi
      if [ "$LOW" -ge 3 ]; then
        echo "WATCHDOG: freemem ${FM}MB < ${ABORT_FREEMEM_MB}MB x3 → ABORT" >> "$CYCLE_LOG"
        touch "$WATCHDOG_FLAG"
        pkill -TERM -f TRILLIONX_EXTREME_COMBO.js 2>/dev/null
        pkill -TERM -f TRILLIONX_FABRIC_CLONE  2>/dev/null
        break
      fi
      sleep 1
    done
  ) &
  WATCHDOG_BG=$!

  CYCLE_START=$(date +%s)
  CLONES="$CLONES" ATTACK_N="$ATTACK_N" SPAWN_DELAY="$SPAWN_DELAY" \
    PORT_START=3161 PORT_END="$PORT_END" \
    timeout --kill-after=10s "$CYCLE_TIMEOUT_S" \
    node TRILLIONX_EXTREME_COMBO.js > "$CYCLE_LOG" 2>&1
  CYCLE_EXIT=$?
  CYCLE_DUR=$(( $(date +%s) - CYCLE_START ))

  touch "$WATCHDOG_FLAG.done"
  wait "$WATCHDOG_BG" 2>/dev/null

  echo "post : $(snapshot_mem)  exit=$CYCLE_EXIT  dur=${CYCLE_DUR}s" | tee -a "$SUMMARY"

  REPORT_JSON="runtime_state/bench/trillionx_extreme_combo_last.json"
  if [ -f "$REPORT_JSON" ]; then
    VERDICT=$(grep -o '"verdict"[^,}]*' "$REPORT_JSON" | head -1)
    SAFETY=$(grep -o '"safety_triggered"[^,}]*' "$REPORT_JSON" | head -1)
    PANIC=$(grep -o '"panic"[^,}]*' "$REPORT_JSON" | head -1)
    AUTOKILL=$(grep -o '"auto_kill_count"[^,}]*' "$REPORT_JSON" | head -1)
    FM_MIN=$(grep -o '"freemem_min_during"[^,}]*' "$REPORT_JSON" | head -1)
    echo "       $VERDICT | $SAFETY | $PANIC | $AUTOKILL | $FM_MIN" | tee -a "$SUMMARY"
    cp "$REPORT_JSON" "$LOG_DIR/C${CYCLE_IDX}_report.json"
  fi

  if [ -f "$WATCHDOG_FLAG" ]; then
    DEATH_REASON="WATCHDOG_FREEMEM_C${CYCLE_IDX}"
    echo "⚠️  Watchdog aborted C$CYCLE_IDX. Hard limit reached." | tee -a "$SUMMARY"
    break
  fi
  if [ "$CYCLE_EXIT" -eq 124 ]; then
    DEATH_REASON="TIMEOUT_C${CYCLE_IDX}"
    echo "⏰ Cycle C$CYCLE_IDX timed out (>${CYCLE_TIMEOUT_S}s). Stop." | tee -a "$SUMMARY"
    break
  fi
  if [ "$CYCLE_EXIT" -ne 0 ]; then
    DEATH_REASON="EXIT_${CYCLE_EXIT}_C${CYCLE_IDX}"
    echo "💥 Cycle C$CYCLE_IDX exited non-zero ($CYCLE_EXIT). Stop." | tee -a "$SUMMARY"
    break
  fi
  if ! master_alive; then
    DEATH_REASON="MASTER_KILLED_DURING_C${CYCLE_IDX}"
    echo "☠️  Master fabric killed during C$CYCLE_IDX. CRITICAL." | tee -a "$SUMMARY"
    break
  fi

  LAST_SURVIVED="C${CYCLE_IDX} (clones=$CLONES attack=$ATTACK_N load=$TOTAL_LOAD)"

  pkill -TERM -f TRILLIONX_FABRIC_CLONE 2>/dev/null
  sleep 2
  pkill -KILL -f TRILLIONX_FABRIC_CLONE 2>/dev/null

  echo "cool : sleeping ${COOLDOWN_S}s for GC..." | tee -a "$SUMMARY"
  sleep "$COOLDOWN_S"
done

echo "" | tee -a "$SUMMARY"
echo "============================================================" | tee -a "$SUMMARY"
echo "  FINAL VERDICT" | tee -a "$SUMMARY"
echo "============================================================" | tee -a "$SUMMARY"
echo "Last cycle survived : ${LAST_SURVIVED:-NONE}" | tee -a "$SUMMARY"
echo "Death reason        : ${DEATH_REASON:-COMPLETED_ALL_CYCLES}" | tee -a "$SUMMARY"
echo "Master fabric       : $(master_alive && echo "✅ ALIVE PID $MASTER_PID_EXPECTED" || echo "❌ DEAD")" | tee -a "$SUMMARY"
echo "Final state         : $(snapshot_mem)" | tee -a "$SUMMARY"
echo "Logs                : $LOG_DIR" | tee -a "$SUMMARY"
echo "============================================================" | tee -a "$SUMMARY"
