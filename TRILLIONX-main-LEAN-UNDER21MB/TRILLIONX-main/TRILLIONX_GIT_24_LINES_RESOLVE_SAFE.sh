#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX RESOLVE 24 GIT LINES SAFE ==="
mkdir -p reports history logs

echo "=== AVANT ==="
git status --short | head -120
git status --short | wc -l | awk '{print "local_changes_before="$1}'

# 1) Ignore runtime / local / generated noise
touch .gitignore
cat >> .gitignore <<'GI'

# TRILLIONX local/runtime generated files
.trillionx_terminal_fast.env
.vscode/settings.before_*.json
async_results/
micro_sync/
runtime_state/*PID
runtime_state/*_PID
runtime_state/*.pid
runtime_state/*.lock
runtime_state/*.tmp
async_jobs/*.running.json
logs/*.log
logs/*.out
GI
awk '!seen[$0]++' .gitignore > .gitignore.clean && mv .gitignore.clean .gitignore

# 2) Retire du suivi uniquement les fichiers volatils déjà indexés, sans les supprimer du disque
git rm --cached -r async_results micro_sync 2>/dev/null || true
git rm --cached .trillionx_terminal_fast.env 2>/dev/null || true
git rm --cached .vscode/settings.before_display_accel_*.json 2>/dev/null || true
git rm --cached runtime_state/*PID runtime_state/*_PID runtime_state/*.pid 2>/dev/null || true
git rm --cached async_jobs/*.running.json logs/*.log logs/*.out 2>/dev/null || true

# 3) Pour les anciens backups marqués D : on valide leur suppression si le système est OK
#    car ce sont des backups obsolètes, pas app.js vivant.
git add -u backups 2>/dev/null || true

# 4) Garde les scripts utiles et le .gitignore
git add .gitignore .trillionx_aliases \
  TRILLIONX_CODESPACES_DISPLAY_ACCELERATOR.sh \
  TRILLIONX_GIT_PID_IGNORE_FIX.sh \
  TRILLIONX_GIT_24_LINES_RESOLVE_SAFE.sh 2>/dev/null || true

# 5) Garde les rapports/historiques de preuve actuelle
git add data/TRILLIONX_RUNTIME_GUARD_LATEST.json \
  history/TRILLIONX_PARALLEL_MICRO_SYNC_HISTORY.jsonl \
  history/TRILLIONX_REMOTE_HOST_MICRO_SYNC_HISTORY.jsonl \
  history/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_HISTORY.jsonl \
  reports/TRILLIONX_ASYNC_DRAIN_REGISTRY_CODEC_LATEST.json \
  reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_LATEST.json \
  reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json \
  reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json \
  reports/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_LATEST.json 2>/dev/null || true

SNAP="reports/TRILLIONX_GIT_24_LINES_RESOLVE_SNAPSHOT_$(date +%Y%m%d_%H%M%S).txt"
{
  echo "time=$(date -Is)"
  echo "--- status staged/unstaged ---"
  git status --short
  echo "--- diff stat ---"
  git diff --stat
  echo "--- cached stat ---"
  git diff --cached --stat
} > "$SNAP"
git add "$SNAP" 2>/dev/null || true

git commit -m "Seal TRILLIONX clean runtime organization state" || echo "Rien à commit"

echo "=== APRES ==="
git status --short | head -120
git status --short | wc -l | awk '{print "local_changes_after="$1}'

echo "=== RELANCE BENCH ORGANISATION ==="
node benchmarks/trillionx_system_organization_bench.js || true

echo "✅ Resolve 24 lines terminé"
