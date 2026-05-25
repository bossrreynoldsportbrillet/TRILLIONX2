#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX GIT CLEAN STATE SAFE ==="

mkdir -p reports history logs backups

echo "=== AVANT ==="
git status --short | head -120 || true
git status --short | wc -l | awk '{print "local_changes_before="$1}'

cat > .gitignore.trillionx_runtime <<'GI'
# TRILLIONX runtime noise
logs/*.log
logs/*.out
*.tmp
*.running.json
async_jobs/*.running.json
runtime_state/*.pid
runtime_state/*.lock
runtime_state/*.tmp
.vscode-server/
.node_repl_history
npm-debug.log*
GI

# Fusionne dans .gitignore sans doublons
touch .gitignore
cat .gitignore .gitignore.trillionx_runtime | awk '!seen[$0]++' > .gitignore.merged
mv .gitignore.merged .gitignore
rm -f .gitignore.trillionx_runtime

echo "=== SNAPSHOT IMPORTANT ==="
SNAP="reports/TRILLIONX_GIT_CLEAN_STATE_SNAPSHOT_$(date +%Y%m%d_%H%M%S).txt"
{
  echo "time=$(date -Is)"
  echo "branch=$(git branch --show-current)"
  echo "--- status short ---"
  git status --short
  echo "--- diff stat ---"
  git diff --stat
  echo "--- disk ---"
  df -h .
} > "$SNAP"

echo "Snapshot: $SNAP"

echo "=== ADD SAFE ==="
git add .gitignore \
  scripts \
  benchmarks \
  reports \
  history \
  async_registry \
  async_codecs \
  async_derivatives \
  TRILLIONX_*_BENCH.sh \
  TRILLIONX_*_SAFE.sh 2>/dev/null || true

echo "=== COMMIT SAFE ==="
git commit -m "Seal TRILLIONX stable runtime organization state" || echo "Rien à commit ou commit déjà fait"

echo "=== APRES ==="
git status --short | head -120 || true
git status --short | wc -l | awk '{print "local_changes_after="$1}'

echo "✅ Git clean-state safe terminé"
