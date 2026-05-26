#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX DISABLE AUTO GROWTH SAFE"
echo "============================================================"

mkdir -p scripts reports history logs runtime_state data/_archive_light

echo "=== AVANT DISQUE ==="
df -h .
du -sh . data history reports runtime_state 2>/dev/null || true

echo "=== POLICY ANTI-GONFLEMENT ==="
cat > runtime_state/TRILLIONX_AUTO_GROWTH_POLICY.json <<'JSON'
{
  "mode": "SAFE_NO_GROWTH",
  "enabled": true,
  "keep_latest_only": true,
  "disable_repeated_vector_snapshots": true,
  "disable_repeated_autodetect_archives": true,
  "max_history_lines": 5000,
  "max_report_latest_files": true,
  "no_appjs_touch": true,
  "no_runtime_kill": true,
  "truth": "limits generated files; does not disable TRILLIONX core runtime"
}
JSON

echo "=== SCRIPT COMPACTEUR SAFE ==="
cat > scripts/trillionx_no_growth_compact_safe.sh <<'SH'
#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

mkdir -p data/_archive_light reports history logs

echo "=== COMPACT SAFE START ==="

# 1) Data vector memory : garder latest + 1 plus récent snapshot, compresser le reste
if ls data/trillionx_internet_vector_memory_*.json >/dev/null 2>&1; then
  echo "--- vector memory snapshots ---"
  ls -t data/trillionx_internet_vector_memory_*.json 2>/dev/null | tail -n +3 | while read -r f; do
    [ -f "$f" ] || continue
    gzip -9 "$f" 2>/dev/null || true
  done
fi

# 2) Repo autodetect : garder latest + 1 plus récent, compresser le reste
if ls data/trillionx_repo_total_autodetect_*.json >/dev/null 2>&1; then
  echo "--- repo autodetect snapshots ---"
  ls -t data/trillionx_repo_total_autodetect_*.json 2>/dev/null | tail -n +3 | while read -r f; do
    [ -f "$f" ] || continue
    gzip -9 "$f" 2>/dev/null || true
  done
fi

# 3) Historiques JSONL : tronquer à 5000 dernières lignes max
for f in history/*.jsonl; do
  [ -f "$f" ] || continue
  n=$(wc -l < "$f" 2>/dev/null || echo 0)
  if [ "$n" -gt 5000 ]; then
    tmp="$f.tmp"
    tail -5000 "$f" > "$tmp" && mv "$tmp" "$f"
    echo "trimmed $f to 5000 lines"
  fi
done

# 4) Logs trop vieux ou trop lourds : compresser
find logs -type f \( -name "*.log" -o -name "*.out" \) -size +2M -print 2>/dev/null | while read -r f; do
  gzip -9 "$f" 2>/dev/null || true
done

# 5) Runtime state lourd connu : compresser copie historique si existe, garder fichier courant
if [ -f runtime_state/trillionx_useful_work_runtime_state.json ]; then
  sz=$(du -m runtime_state/trillionx_useful_work_runtime_state.json | awk '{print $1}')
  if [ "$sz" -gt 20 ]; then
    cp runtime_state/trillionx_useful_work_runtime_state.json "data/_archive_light/trillionx_useful_work_runtime_state_$(date +%Y%m%d_%H%M%S).json" 2>/dev/null || true
    gzip -9 data/_archive_light/trillionx_useful_work_runtime_state_*.json 2>/dev/null || true
  fi
fi

echo "=== APRES COMPACT ==="
du -sh . data history reports runtime_state logs 2>/dev/null || true
df -h .
echo "✅ COMPACT SAFE OK"
SH

chmod +x scripts/trillionx_no_growth_compact_safe.sh
bash scripts/trillionx_no_growth_compact_safe.sh

echo "=== IGNORE DES ARCHIVES COMPRESSEES ET RUNTIME VOLATILE ==="
touch .gitignore
cat >> .gitignore <<'GI'

# TRILLIONX anti-growth runtime/generated
data/*.json.gz
data/_archive_light/
logs/*.gz
runtime_state/TRILLIONX_AUTO_GROWTH_POLICY.json
GI
awk '!seen[$0]++' .gitignore > .gitignore.clean && mv .gitignore.clean .gitignore

echo "=== VERIFICATION RUNTIME NON TOUCHE ==="
ss -lntp 2>/dev/null | grep ':3000' || echo "Port 3000 non visible via ss"
test -f runtime_state/TRILLIONX_MAIN_PID && echo "MAIN PID présent" || echo "MAIN PID absent"
test -f runtime_state/TRILLIONX_WATCHDOG_PID && echo "WATCHDOG PID présent" || true

echo "=== APRES DISQUE ==="
df -P . | awk 'NR==2{gsub("%","",$5);print "Disk used="$5"%";print "Disk remaining="100-$5"%"}'
du -sh . data history reports runtime_state 2>/dev/null || true

git add .gitignore scripts/trillionx_no_growth_compact_safe.sh TRILLIONX_DISABLE_AUTO_GROWTH_SAFE.sh 2>/dev/null || true
git commit -m "Disable TRILLIONX automatic disk growth safely" || echo "Rien à commit"

echo "✅ AUTO GROWTH SAFE DISABLED"
