#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX DISK GUARD SAFE ==="
df -h .
echo "=== TOP DOSSIERS ==="
du -h -d 1 . 2>/dev/null | sort -h | tail -25

echo "=== NETTOYAGE SAFE UNIQUEMENT ==="

# Logs anciens seulement
find logs -type f -name "*.log" -mtime +2 -delete 2>/dev/null || true
find logs -type f -size +25M -delete 2>/dev/null || true

# Snapshots locaux anciens seulement
find runtime_state/local_snapshots -type f -mtime +2 -delete 2>/dev/null || true

# Garder les 5 derniers backups app.js
ls -1t backups/app.before*.js 2>/dev/null | tail -n +6 | xargs -r rm -f

# Temp système uniquement
rm -rf /tmp/trillionx_* /tmp/npm-* 2>/dev/null || true

# Nettoyage cache npm seulement, pas node_modules
npm cache clean --force 2>/dev/null || true

echo "=== APRES ==="
df -h .
du -h -d 1 . 2>/dev/null | sort -h | tail -25

echo "✅ SAFE CLEAN OK : app.js, node_modules, data, raid60_plus non touchés"
