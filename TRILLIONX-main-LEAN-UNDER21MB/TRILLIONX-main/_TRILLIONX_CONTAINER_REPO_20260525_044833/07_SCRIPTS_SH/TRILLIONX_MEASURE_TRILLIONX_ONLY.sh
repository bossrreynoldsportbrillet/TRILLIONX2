#!/usr/bin/env bash
set -e

echo "=== TRILLIONX ONLY MEASURE POLICY ==="
cat TRILLIONX_TARGET_POLICY.json | python3 -m json.tool

echo ""
echo "=== APP PROCESS ==="
ps aux | grep -E "node app.js|node .*app" | grep -v grep || true

echo ""
echo "=== LOCAL TRILLIONX API CHECK ==="
for r in / /api/ping /api/full /api/health /api/runtime/status /api/reconnect /api/ai-chat /api/hardware/9000vw; do
  printf "%-28s " "$r"
  curl -s -o /tmp/trx_resp.txt -w "HTTP=%{http_code} TIME=%{time_total}s SIZE=%{size_download}\n" "http://127.0.0.1:3000$r" || true
done

echo ""
echo "=== ROUTE INVENTORY ==="
grep -RhoE "app\.(get|post|put|delete|patch)\(['\"][^'\"]+" . \
  --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null \
  | sed -E "s/app\.(get|post|put|delete|patch)\(['\"]//" \
  | sort | uniq -c | sort -nr | head -80 || true

echo ""
echo "=== TRILLIONX FILE INTELLIGENCE ==="
find . \
  -path ./node_modules -prune -o \
  -path ./.git -prune -o \
  -type f \( -name "*.js" -o -name "*.json" -o -name "*.jsonl" -o -name "*.c" -o -name "*.cpp" -o -name "*.h" -o -name "*.md" -o -name "*.txt" \) \
  -printf "%s %p\n" | sort -nr | head -120

echo ""
echo "=== MEMORY NOW ==="
free -h 2>/dev/null || true
node -e 'console.log(process.memoryUsage())'

echo ""
echo "=== TRILLIONX ONLY VERDICT ==="
echo "TARGET=TRILLIONX_ORCHESTRATOR"
echo "HOST=CODESPACES_CONTEXT_ONLY"
echo "BENCH=API+ROUTES+MEMORY+JOBS+CACHE+WORKERS+REPO+HEALTH"
echo "CPU/GPU=SUPPORT_CONTEXT_NOT_TARGET"
echo "DONE"
