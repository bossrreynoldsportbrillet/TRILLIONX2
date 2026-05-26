#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX DISK GUARD ==="
echo "--- disque avant ---"
df -h .
echo "--- top dossiers ---"
du -h -d 1 . 2>/dev/null | sort -h | tail -25

mkdir -p logs history reports runtime_state backups data

echo "=== nettoyage logs vieux/lourds ==="
find logs -type f -name "*.log" -mtime +1 -delete 2>/dev/null || true
find logs -type f -size +20M -delete 2>/dev/null || true

echo "=== nettoyage snapshots runtime locaux ==="
find runtime_state/local_snapshots -type f -mtime +1 -delete 2>/dev/null || true
find runtime_state/local_snapshots -type f | sort | head -n -10 | xargs -r rm -f 2>/dev/null || true

echo "=== nettoyage backups app.js : garder 5 derniers ==="
ls -1t backups/app.before*.js 2>/dev/null | tail -n +6 | xargs -r rm -f

echo "=== nettoyage rapports latest dupliqués ==="
find reports -type f -name "*_LATEST_*.json" -mtime +1 -delete 2>/dev/null || true
find data -type f -name "*_latest_*.json" -mtime +1 -delete 2>/dev/null || true

echo "=== compression historique volumineux ==="
find history -type f -name "*.jsonl" -size +10M -exec gzip -f {} \; 2>/dev/null || true
find history -type f -name "*.gz" -mtime +7 -delete 2>/dev/null || true

echo "=== npm cache clean safe ==="
npm cache clean --force 2>/dev/null || true

echo "=== suppression caches temporaires ==="
rm -rf /tmp/trillionx_* /tmp/npm-* 2>/dev/null || true

echo "--- disque après ---"
df -h .
echo "--- top dossiers après ---"
du -h -d 1 . 2>/dev/null | sort -h | tail -25

echo "=== status git ==="
git status --short | head -60 || true
