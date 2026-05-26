#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX PID IGNORE FIX ==="

mkdir -p reports history logs runtime_state

echo "=== AVANT ==="
git status --short | head -120
git status --short | wc -l | awk '{print "local_changes_before="$1}'

touch .gitignore

cat >> .gitignore <<'GI'

# TRILLIONX runtime PID / volatile state
runtime_state/*PID
runtime_state/*_PID
runtime_state/*.pid
runtime_state/*.lock
runtime_state/*.tmp
runtime_state/*.running
async_jobs/*.running.json
logs/*.log
logs/*.out
GI

# dédoublonnage .gitignore
awk '!seen[$0]++' .gitignore > .gitignore.clean
mv .gitignore.clean .gitignore

# si ces fichiers ont déjà été ajoutés à l’index, on les retire du suivi sans les supprimer du disque
git rm --cached runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true
git rm --cached runtime_state/TRILLIONX_MICRO_SYNC_PID 2>/dev/null || true
git rm --cached runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID 2>/dev/null || true
git rm --cached runtime_state/TRILLIONX_WATCHDOG_PID 2>/dev/null || true
git rm --cached runtime_state/*.pid 2>/dev/null || true
git rm --cached async_jobs/*.running.json 2>/dev/null || true
git rm --cached logs/*.log 2>/dev/null || true
git rm --cached logs/*.out 2>/dev/null || true

SNAP="reports/TRILLIONX_GIT_PID_IGNORE_FIX_$(date +%Y%m%d_%H%M%S).txt"
{
  echo "time=$(date -Is)"
  echo "--- status before commit ---"
  git status --short
  echo "--- gitignore runtime rules ---"
  grep -n "runtime_state" .gitignore || true
} > "$SNAP"

git add .gitignore "$SNAP" 2>/dev/null || true
git commit -m "Ignore TRILLIONX volatile runtime PID files" || echo "Rien à commit"

echo "=== APRES ==="
git status --short | head -120
git status --short | wc -l | awk '{print "local_changes_after="$1}'

echo "✅ PID ignore fix terminé"
