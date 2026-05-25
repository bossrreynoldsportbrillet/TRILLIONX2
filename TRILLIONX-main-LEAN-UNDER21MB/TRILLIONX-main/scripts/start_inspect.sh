#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env.trillionx.safe ] && . ./.env.trillionx.safe; set +a
node --inspect=0.0.0.0:9229 --max-old-space-size="${TRILLIONX_MEMORY_LIMIT_MB:-4096}" app.js
