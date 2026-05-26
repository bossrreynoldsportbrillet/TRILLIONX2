#!/usr/bin/env bash
set -u

echo "============================================================"
echo " TRILLIONX CONTAINER REPOSITION REPO"
echo " Safe classification / no deletion / no git add ."
echo "============================================================"

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BOX="_TRILLIONX_CONTAINER_REPO_$STAMP"

mkdir -p "$BOX"/{01_RUNTIME_KEEP,02_NETWORK,03_BENCH,04_UI,05_REPORTS,06_ARCHIVE_TXT,07_SCRIPTS_SH,08_UNKNOWN,09_DIRS,99_MANIFEST}

echo "$ROOT" > "$BOX/99_MANIFEST/ROOT.txt"
git branch --show-current > "$BOX/99_MANIFEST/BRANCH.txt" 2>/dev/null || true
git log --oneline -10 > "$BOX/99_MANIFEST/GIT_LOG_LAST10.txt" 2>/dev/null || true
git status --short > "$BOX/99_MANIFEST/GIT_STATUS_BEFORE.txt" 2>/dev/null || true

echo "=== Runtime check ===" | tee "$BOX/99_MANIFEST/RUNTIME_CHECK.txt"
{
  echo "--- PORT 3000 ---"
  ss -lntp 2>/dev/null | grep ':3000' || true
  echo "--- HTTP ---"
  curl -I --max-time 5 http://127.0.0.1:3000/ 2>/dev/null | head -12 || true
} >> "$BOX/99_MANIFEST/RUNTIME_CHECK.txt"

echo "=== Collect untracked files ==="
git ls-files --others --exclude-standard > "$BOX/99_MANIFEST/UNTRACKED_ALL.txt" 2>/dev/null || true

TOTAL="$(wc -l < "$BOX/99_MANIFEST/UNTRACKED_ALL.txt" | tr -d ' ')"
echo "Untracked total: $TOTAL"

classify_file(){
  f="$1"
  base="$(basename "$f")"
  low="$(echo "$f" | tr '[:upper:]' '[:lower:]')"

  [ ! -e "$f" ] && return 0

  if [ -d "$f" ]; then
    dest="$BOX/09_DIRS"
  elif echo "$low" | grep -Eq '(^|/)(app\.js|package\.json|package-lock\.json|launch\.json|tasks\.json|readme\.md)$|runtime|fused|core|server'; then
    dest="$BOX/01_RUNTIME_KEEP"
  elif echo "$low" | grep -Eq 'network|port|socket|ws|websocket|reconnect|ping|latency|task_orchestrator'; then
    dest="$BOX/02_NETWORK"
  elif echo "$low" | grep -Eq 'bench|benchmark|flops|score|stress|zeta|hpc|cpu|hash|throughput'; then
    dest="$BOX/03_BENCH"
  elif echo "$low" | grep -Eq 'ui|button|render|output|terminal|html|css|frontend|cockpit'; then
    dest="$BOX/04_UI"
  elif echo "$low" | grep -Eq 'report|reports|audit|log|status|verified|manifest|registry'; then
    dest="$BOX/05_REPORTS"
  elif echo "$low" | grep -Eq '\.sh$|script|optimize|repair|reactivate|launch'; then
    dest="$BOX/07_SCRIPTS_SH"
  elif echo "$low" | grep -Eq '\.txt$|\.md$|\.json$'; then
    dest="$BOX/06_ARCHIVE_TXT"
  else
    dest="$BOX/08_UNKNOWN"
  fi

  mkdir -p "$dest/$(dirname "$f")"
  cp -a "$f" "$dest/$f" 2>/dev/null || true

  {
    echo "FILE=$f"
    echo "DEST=$dest"
    du -h "$f" 2>/dev/null || true
    file "$f" 2>/dev/null || true
    echo "--- HEAD ---"
    if [ -f "$f" ]; then head -40 "$f" 2>/dev/null || true; fi
    echo
  } >> "$BOX/99_MANIFEST/CLASSIFICATION_DETAIL.txt"
}

while IFS= read -r f; do
  classify_file "$f"
done < "$BOX/99_MANIFEST/UNTRACKED_ALL.txt"

echo "=== Category sizes ===" | tee "$BOX/99_MANIFEST/CATEGORY_SIZES.txt"
du -sh "$BOX"/* 2>/dev/null | tee -a "$BOX/99_MANIFEST/CATEGORY_SIZES.txt"

echo "=== Category counts ===" | tee "$BOX/99_MANIFEST/CATEGORY_COUNTS.txt"
for d in "$BOX"/*; do
  [ -d "$d" ] || continue
  printf "%-35s %s\n" "$(basename "$d")" "$(find "$d" -type f | wc -l)" | tee -a "$BOX/99_MANIFEST/CATEGORY_COUNTS.txt"
done

cat > "$BOX/README_CONTAINER.txt" <<README
TRILLIONX CONTAINER REPOSITION REPO

But:
- Classer tous les fichiers non suivis sans suppression.
- Ne pas modifier la version stable.
- Ne pas faire git add .
- Préparer une revue globale par catégorie.

Dossiers:
01_RUNTIME_KEEP = éléments runtime potentiellement importants
02_NETWORK = réseau, ports, socket, reconnect
03_BENCH = benchmarks, flops, stress, score
04_UI = UI, boutons, render, output, terminal
05_REPORTS = rapports, audits, logs, registry
06_ARCHIVE_TXT = textes/json/md à archiver
07_SCRIPTS_SH = scripts shell
08_UNKNOWN = non classés
09_DIRS = dossiers copiés
99_MANIFEST = rapports de classification

Règle:
On lit le rapport, puis on intègre fichier par fichier seulement si utile.
README

ZIP="${BOX}.zip"
if command -v zip >/dev/null 2>&1; then
  zip -qr "$ZIP" "$BOX"
  echo "ZIP=$ZIP" | tee "$BOX/99_MANIFEST/ZIP_CREATED.txt"
  ls -lh "$ZIP"
else
  tar -czf "${BOX}.tar.gz" "$BOX"
  echo "TAR=${BOX}.tar.gz" | tee "$BOX/99_MANIFEST/ZIP_CREATED.txt"
  ls -lh "${BOX}.tar.gz"
fi

echo "============================================================"
echo "✅ CONTAINER TERMINE"
echo "Dossier: $BOX"
echo "Rapports clés:"
echo "  $BOX/99_MANIFEST/UNTRACKED_ALL.txt"
echo "  $BOX/99_MANIFEST/CATEGORY_COUNTS.txt"
echo "  $BOX/99_MANIFEST/CATEGORY_SIZES.txt"
echo "  $BOX/99_MANIFEST/CLASSIFICATION_DETAIL.txt"
echo "============================================================"
