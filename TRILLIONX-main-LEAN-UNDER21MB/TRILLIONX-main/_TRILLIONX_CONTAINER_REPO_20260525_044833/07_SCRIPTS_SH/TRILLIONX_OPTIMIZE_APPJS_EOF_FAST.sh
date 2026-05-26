#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
mkdir -p backups data history logs reports controllers scripts runtime_state
STAMP=$(date +%Y%m%d_%H%M%S)
[ -f app.js ] || { echo "app.js introuvable"; exit 1; }
cp app.js "backups/app.before_opt_fast_${STAMP}.js"
node --check app.js || exit 1

cat > .env.trillionx.safe <<'E'
PORT=3000
NODE_ENV=production
TRILLIONX_REAL_ONLY=true
TRILLIONX_SAFE_REPAIR=true
TRILLIONX_MAX_WORKERS=2
TRILLIONX_MAX_PORT_PROCESSES=24
TRILLIONX_MEMORY_LIMIT_MB=4096
TRILLIONX_NO_FAKE_METRICS=true
E

cat > controllers/TRILLIONX_RUNTIME_GUARD.js <<'JS'
'use strict';const os=require('os'),fs=require('fs'),path=require('path'),crypto=require('crypto');const R=x=>Number.isFinite(x)?+x.toFixed(3):0,S=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');function snap(){let c=os.cpus()||[],sp=c.map(x=>x.speed||0).filter(Boolean),m=process.memoryUsage();return{time:new Date().toISOString(),cpu:c[0]?.model||'unknown',logical_cpu:c.length,ghz:R((sp.reduce((a,b)=>a+b,0)/(sp.length||1))/1000),load:os.loadavg().map(R),ram_total_gb:R(os.totalmem()/1073741824),ram_free_gb:R(os.freemem()/1073741824),rss_mb:R(m.rss/1048576),heap_mb:R(m.heapUsed/1048576)}}function write(){fs.mkdirSync('data',{recursive:true});let o={engine:'TRILLIONX_RUNTIME_GUARD',policy:{real_only:true,safe_repair_only:true,no_fake_metrics:true},snapshot:snap()};o.seal=S(o);fs.writeFileSync('data/TRILLIONX_RUNTIME_GUARD_LATEST.json',JSON.stringify(o,null,2));return o}module.exports={snap,write};if(require.main===module)console.log(JSON.stringify(write(),null,2));
JS

cat > scripts/start_safe.sh <<'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env.trillionx.safe ] && . ./.env.trillionx.safe; set +a
echo "TRILLIONX SAFE START PORT=${PORT:-3000} MEM=${TRILLIONX_MEMORY_LIMIT_MB:-4096}"
node --max-old-space-size="${TRILLIONX_MEMORY_LIMIT_MB:-4096}" app.js
SH

cat > scripts/monitor_trillionx.sh <<'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
echo "=== node ==="; ps aux --sort=-%cpu|grep -E "node|app.js|TRILLIONX"|grep -v grep|head -25||true
echo "=== load/mem ==="; uptime||true; free -h||true
echo "=== ports ==="; ss -lntp 2>/dev/null|grep -E ":3000|:3997|:9229|:20[0-9][0-9][0-9]"|head -80||true
echo "=== guard ==="; node controllers/TRILLIONX_RUNTIME_GUARD.js|head -80||true
SH

chmod +x scripts/start_safe.sh scripts/monitor_trillionx.sh
node --check controllers/TRILLIONX_RUNTIME_GUARD.js
node controllers/TRILLIONX_RUNTIME_GUARD.js >/dev/null

node - <<'NODE'
const fs=require('fs'),os=require('os'),crypto=require('crypto');const r=x=>Number.isFinite(x)?+x.toFixed(3):0,sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');const rep={engine:'TRILLIONX_OPTIMIZATION_FAST',time:new Date().toISOString(),status:'OK_FAST_NO_BLOCKING_NPM_NO_PUSH',cpu:os.cpus()[0]?.model||'unknown',logical_cpu:os.cpus().length,ram_total_gb:r(os.totalmem()/1073741824),ram_free_gb:r(os.freemem()/1073741824),created:['env','runtime_guard','start_safe','monitor'],policy:'REAL_ONLY_OR_UNAVAILABLE'};rep.seal=sha(rep);fs.mkdirSync('reports',{recursive:true});fs.mkdirSync('history',{recursive:true});fs.writeFileSync('reports/TRILLIONX_OPTIMIZATION_FAST_LATEST.json',JSON.stringify(rep,null,2));fs.appendFileSync('history/TRILLIONX_OPTIMIZATION_FAST_HISTORY.jsonl',JSON.stringify({time:rep.time,seal:rep.seal,status:rep.status})+'\n');console.log(JSON.stringify(rep,null,2));
NODE

git add .env.trillionx.safe controllers/TRILLIONX_RUNTIME_GUARD.js scripts/start_safe.sh scripts/monitor_trillionx.sh reports/TRILLIONX_OPTIMIZATION_FAST_LATEST.json history/TRILLIONX_OPTIMIZATION_FAST_HISTORY.jsonl 2>/dev/null || true
git commit -m "Add fast non blocking TRILLIONX optimization layer" || echo "Rien à commit"
echo "✅ FAST OK — push manuel ensuite: git push origin main || git push"
