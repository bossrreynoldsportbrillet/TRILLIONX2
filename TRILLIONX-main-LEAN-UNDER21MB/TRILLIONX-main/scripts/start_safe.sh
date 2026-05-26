#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "=== TRILLIONX SAFE START + NPM INTEGRÉ ==="

mkdir -p node_modules data history logs runtime_state reports backups controllers scripts

set -a
[ -f .env.trillionx.safe ] && . ./.env.trillionx.safe
set +a

export PORT=${PORT:-3000}
export TRILLIONX_REAL_ONLY=${TRILLIONX_REAL_ONLY:-true}
export TRILLIONX_SAFE_REPAIR=${TRILLIONX_SAFE_REPAIR:-true}
export TRILLIONX_MAX_WORKERS=${TRILLIONX_MAX_WORKERS:-2}
export TRILLIONX_MAX_PORT_PROCESSES=${TRILLIONX_MAX_PORT_PROCESSES:-24}
export TRILLIONX_MEMORY_LIMIT_MB=${TRILLIONX_MEMORY_LIMIT_MB:-4096}
export TRILLIONX_NO_FAKE_METRICS=${TRILLIONX_NO_FAKE_METRICS:-true}

if [ -f package.json ]; then
  if [ ! -d node_modules ] || [ ! -f node_modules/.trillionx_npm_ready ]; then
    echo "=== npm install avant lancement ==="
    npm install --no-audit --no-fund || {
      echo "npm install a échoué, tentative npm install simple"
      npm install || exit 1
    }
    date -Iseconds > node_modules/.trillionx_npm_ready
  else
    echo "=== npm déjà prêt ==="
  fi
else
  echo "package.json absent: npm ignoré"
fi

echo "=== vérification app.js ==="
node --check app.js || exit 1

echo "=== lancement app.js ==="
echo "PORT=$PORT"
echo "WORKERS=$TRILLIONX_MAX_WORKERS"
echo "PORT_PROCESSES=$TRILLIONX_MAX_PORT_PROCESSES"
echo "MEMORY_MB=$TRILLIONX_MEMORY_LIMIT_MB"

node --max-old-space-size="$TRILLIONX_MEMORY_LIMIT_MB" app.js
