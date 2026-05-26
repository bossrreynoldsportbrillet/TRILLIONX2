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
