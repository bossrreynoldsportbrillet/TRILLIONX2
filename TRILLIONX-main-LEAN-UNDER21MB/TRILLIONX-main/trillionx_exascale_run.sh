#!/bin/bash
set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   TRILLIONX EXASCALE BENCHMARK (Micro-Packet Distributed) ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 1) Lance le bench (crée les fichiers de data)
node trillionx_exascale_run.js
BENCH_EXIT=$?

if [ $BENCH_EXIT -ne 0 ]; then
  echo "[ERROR] Benchmark failed with exit code $BENCH_EXIT"
  exit $BENCH_EXIT
fi

echo ""
echo "✓ Benchmark completed successfully"
echo ""

# 2) Git add/commit APRÈS que les fichiers existent
if [ -f "data/trillionx_exascale_latest.json" ]; then
  echo "[git] Adding benchmark results..."
  git add trillionx_cpu_power_detect.js trillionx_exascale_benchmark.js trillionx_exascale_run.js data/trillionx_exascale_latest.json 2>/dev/null || true
  git add "data/trillionx_exascale_"*.json 2>/dev/null || true
  
  echo "[git] Committing..."
  git commit -m "TRILLIONX Exascale Benchmark v1.0: micro-packets, CPU power auto-detect, adaptive timeout, 30+ tests" 2>/dev/null || echo "Nothing to commit"
  
  echo "[git] Pushing..."
  git push 2>/dev/null || echo "Push skipped (offline or no remote)"
  
  echo "✓ Git sync complete"
else
  echo "[warn] Data file not found, skipping git sync"
fi

echo ""
echo "✓ DONE"
