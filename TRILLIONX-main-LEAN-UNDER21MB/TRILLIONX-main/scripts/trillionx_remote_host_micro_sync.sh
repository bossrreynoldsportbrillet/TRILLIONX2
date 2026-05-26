#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX REMOTE HOST μ-PACKET SYNC"
echo "============================================================"

mkdir -p scripts logs reports history runtime_state micro_sync

cat > scripts/tx_micro_sync_daemon.js <<'JS'
"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),net=require("net"),crypto=require("crypto"),cp=require("child_process");
const {performance}=require("perf_hooks");

const DIR="micro_sync", LOG="logs/tx_micro_sync.log", LATEST="reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json";
fs.mkdirSync(DIR,{recursive:true}); fs.mkdirSync("logs",{recursive:true}); fs.mkdirSync("reports",{recursive:true}); fs.mkdirSync("history",{recursive:true});

const INTERVAL=Number(process.env.TX_MICRO_SYNC_MS||750);
const PORTS=(process.env.TX_MICRO_SYNC_PORTS||"3000,3997,9229").split(",").map(x=>+x).filter(Boolean);
const MAX=Number(process.env.TX_MICRO_SYNC_MAX||0);
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:800}).trim()}catch{return""}};

function mem(){
 const m=process.memoryUsage();
 return {rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),free_gb:r(os.freemem()/1073741824),total_gb:r(os.totalmem()/1073741824)};
}
function cpu(){
 const c=os.cpus()||[], sp=c.map(x=>x.speed||0).filter(Boolean), l=os.loadavg();
 return {model:c[0]?.model||"unknown",logical:c.length,ghz:r((sp.reduce((a,b)=>a+b,0)/(sp.length||1))/1000),load1:r(l[0]),load_pct:r(Math.min(100,(l[0]/(c.length||1))*100))};
}
function disk(){
 const o=sh("df -P . | tail -1").split(/\s+/);
 const pct=parseFloat((o[4]||"0").replace("%",""))||0;
 return {used_pct:r(pct),free_pct:r(100-pct),mount:o[5]||"."};
}
function tcp(port,timeout=180){
 return new Promise(res=>{
  const t0=performance.now(), s=net.createConnection({host:"127.0.0.1",port});
  let done=false; const fin=o=>{if(done)return;done=true;try{s.destroy()}catch{};res({port,ms:r(performance.now()-t0),...o});};
  s.setTimeout(timeout); s.on("connect",()=>fin({open:true})); s.on("timeout",()=>fin({open:false,error:"TIMEOUT"})); s.on("error",e=>fin({open:false,error:e.code||e.message}));
 });
}
function httpPing(port=3000,timeout=250){
 return new Promise(res=>{
  const t0=performance.now();
  const req=http.get({host:"127.0.0.1",port,path:"/",timeout},r0=>{
   let bytes=0; r0.on("data",d=>bytes+=d.length); r0.on("end",()=>res({ok:r0.statusCode<500,status:r0.statusCode,bytes,ms:r(performance.now()-t0)}));
  });
  req.on("timeout",()=>{req.destroy();res({ok:false,error:"TIMEOUT",ms:r(performance.now()-t0)})});
  req.on("error",e=>res({ok:false,error:e.code||e.message,ms:r(performance.now()-t0)}));
 });
}

let seq=0, prev="GENESIS";
async function tick(){
 const t0=performance.now();
 const ports=[];
 for(const p of PORTS) ports.push(await tcp(p));
 const app=await httpPing(3000);
 const pkt={
  engine:"TRILLIONX_REMOTE_HOST_MICRO_SYNC",
  seq:++seq,
  ts:new Date().toISOString(),
  prev,
  cpu:cpu(),
  memory:mem(),
  disk:disk(),
  ports,
  app3000:app,
  latency_ms:r(performance.now()-t0),
  policy:"ASYNC_MICRO_PACKET_SAFE"
 };
 pkt.seal=sha(pkt); prev=pkt.seal;
 fs.writeFileSync(`${DIR}/packet_latest.json`,JSON.stringify(pkt,null,2));
 fs.writeFileSync(LATEST,JSON.stringify(pkt,null,2));
 fs.appendFileSync(LOG,`${pkt.ts} seq=${pkt.seq} latency=${pkt.latency_ms}ms cpu=${pkt.cpu.load_pct}% ram_free=${pkt.memory.free_gb}GB disk=${pkt.disk.used_pct}% app=${app.ok?"OK":"FAIL"} seal=${pkt.seal.slice(0,12)}\n`);
 fs.appendFileSync("history/TRILLIONX_REMOTE_HOST_MICRO_SYNC_HISTORY.jsonl",JSON.stringify({ts:pkt.ts,seq:pkt.seq,latency_ms:pkt.latency_ms,cpu_pct:pkt.cpu.load_pct,ram_free_gb:pkt.memory.free_gb,disk_pct:pkt.disk.used_pct,app_ok:app.ok,seal:pkt.seal})+"\n");
 if(MAX>0 && seq>=MAX) process.exit(0);
}
setInterval(()=>tick().catch(e=>fs.appendFileSync(LOG,new Date().toISOString()+" ERR "+e.message+"\n")),INTERVAL);
tick();
JS

cat > scripts/tx_micro_sync_start.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
[ -f runtime_state/TRILLIONX_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)" 2>/dev/null || true
nohup node scripts/tx_micro_sync_daemon.js > logs/tx_micro_sync_daemon.out 2>&1 &
echo $! > runtime_state/TRILLIONX_MICRO_SYNC_PID
echo "MICRO_SYNC_PID=$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)"
echo "Log: tail -f logs/tx_micro_sync.log"
SH

cat > scripts/tx_micro_sync_stop.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_MICRO_SYNC_PID ] && kill "$(cat runtime_state/TRILLIONX_MICRO_SYNC_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_micro_sync_daemon.js" 2>/dev/null || true
echo "MICRO_SYNC_STOPPED"
SH

cat > scripts/tx_micro_sync_status.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== μ-PACKET LATEST ==="
cat reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json 2>/dev/null | python3 -m json.tool | head -120 || echo "Pas encore de packet"
echo "=== LOG COURT ==="
tail -20 logs/tx_micro_sync.log 2>/dev/null || true
SH

chmod +x scripts/tx_micro_sync_*.sh
node --check scripts/tx_micro_sync_daemon.js

node - <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const rep={engine:"TRILLIONX_REMOTE_HOST_MICRO_SYNC_INSTALL",time:new Date().toISOString(),status:"READY",interval_ms:750,adds:["tx_micro_sync_start","tx_micro_sync_stop","tx_micro_sync_status"],safe:true,does_not_touch:["app.js","data","raid60_plus","node_modules"]};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.writeFileSync("reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_INSTALL.json",JSON.stringify(rep,null,2));
console.log(JSON.stringify(rep,null,2));
NODE

git add scripts/tx_micro_sync_* scripts/trillionx_remote_host_micro_sync.sh reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_INSTALL.json 2>/dev/null || true
git commit -m "Add TRILLIONX remote host micro packet sync" || echo "Rien à commit"

echo "============================================================"
echo "✅ μ-PACKET SYNC INSTALLE"
echo "Démarrer : bash scripts/tx_micro_sync_start.sh"
echo "Statut   : bash scripts/tx_micro_sync_status.sh"
echo "Stop     : bash scripts/tx_micro_sync_stop.sh"
echo "============================================================"
