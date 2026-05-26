#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
mkdir -p data history logs runtime_state reports backups controllers scripts monitoring memory_fabric mesh_1x10 firmware backend benchmarks
chmod -R u+rwX data history logs runtime_state reports backups controllers scripts monitoring 2>/dev/null||true
[ -f package.json ]&&npm install||true
node --check app.js
