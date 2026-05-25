#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX SETUP AVANT LANCEMENT ==="

mkdir -p node_modules data history logs runtime_state reports backups controllers scripts

if [ -f package.json ]; then
  echo "=== npm install avant lancement ==="
  npm install --no-audit --no-fund
else
  echo "package.json absent: npm install ignoré"
fi

echo "=== vérification app.js ==="
node --check app.js || exit 1

echo "=== lancement safe ==="
export PORT=${PORT:-3000}
export TRILLIONX_REAL_ONLY=true
export TRILLIONX_SAFE_REPAIR=true
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}

node --max-old-space-size="$TRILLIONX_MEMORY_LIMIT_MB" app.js
