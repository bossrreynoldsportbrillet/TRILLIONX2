#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX GLOBAL ASYNC DRAIN V2"
echo " runtime + network + ports + micro-sync + maintenance"
echo "============================================================"

mkdir -p scripts logs reports history runtime_state async_queue async_jobs async_results async_registry async_derivatives

cat > scripts/tx_async_global_drain_v2.js <<'JS'
"use strict";
const fs=require("fs"),path=require("path"),cp=require("child_process"),crypto=require("crypto");
const {performance}=require("perf_hooks");
const ROOT="/workspaces/TRILLIONX";
const D={
 q:"async_queue", run:"async_jobs", res:"async_results", reg:"async_registry",
 der:"async_derivatives", logs:"logs", rep:"reports", hist:"history", rt:"runtime_state"
};
for(const k in D) fs.mkdirSync(path.join(ROOT,D[k]),{recursive:true});
const P=x=>path.join(ROOT,x);
const now=()=>new Date().toISOString();
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const read=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
const write=(f,o)=>fs.writeFileSync(f,JSON.stringify(o,null,2));
const app=(f,s)=>fs.appendFileSync(f,s.endsWith("\n")?s:s+"\n");
const ls=(d)=>fs.readdirSync(P(d)).filter(x=>x.endsWith(".json")).sort();

const REG={
 status:{cmd:"bash scripts/tx_process_status.sh",cat:"PROCESS",pri:"HIGH"},
 resource:{cmd:"bash scripts/trillionx_resource_percent.sh",cat:"SYSTEM",pri:"HIGH"},
 disk:{cmd:"bash scripts/trillionx_disk_guard_safe.sh",cat:"STORAGE",pri:"CRITICAL"},
 appcheck:{cmd:"node --check app.js",cat:"APP",pri:"CRITICAL"},
 ports:{cmd:"ss -lntp 2>/dev/null | head -120 || true",cat:"NETWORK",pri:"HIGH"},
 port3000:{cmd:"curl -fsS http://127.0.0.1:3000/ | head -40 || true",cat:"NETWORK",pri:"HIGH"},
 port3997:{cmd:"curl -fsS http://127.0.0.1:3997/status | head -80 || true",cat:"NETWORK",pri:"NORMAL"},
 start:{cmd:"bash scripts/start_safe.sh",cat:"RUNTIME",pri:"HIGH"},
 startnice:{cmd:"bash scripts/tx_start_nice.sh",cat:"RUNTIME",pri:"HIGH"},
 stop:{cmd:"bash scripts/tx_stop.sh",cat:"RUNTIME",pri:"HIGH"},
 restart:{cmd:"bash scripts/tx_stop.sh; sleep 1; bash scripts/tx_start_nice.sh",cat:"RUNTIME",pri:"CRITICAL"},
 watchdog_start:{cmd:"bash scripts/tx_watchdog_start.sh",cat:"RUNTIME",pri:"HIGH"},
 watchdog_log:{cmd:"tail -80 logs/tx_watchdog.log 2>/dev/null || true",cat:"RUNTIME",pri:"NORMAL"},
 micro_start:{cmd:"TX_MICRO_SYNC_WORKERS=4 TX_MICRO_SYNC_MS=250 bash scripts/tx_parallel_micro_sync_start.sh",cat:"SYNC",pri:"HIGH"},
 micro_status:{cmd:"bash scripts/tx_parallel_micro_sync_status.sh",cat:"SYNC",pri:"HIGH"},
 micro_stop:{cmd:"bash scripts/tx_parallel_micro_sync_stop.sh",cat:"SYNC",pri:"NORMAL"},
 async_status:{cmd:"bash scripts/tx_async_status.sh",cat:"ASYNC",pri:"HIGH"},
 old_drain:{cmd:"TX_ASYNC_MAX_JOBS=20 bash scripts/tx_async_drain.sh",cat:"ASYNC",pri:"HIGH"},
 logs:{cmd:"du -sh logs reports history async_queue async_jobs async_results 2>/dev/null || true",cat:"MAINTENANCE",pri:"NORMAL"},
 logrotate:{cmd:"bash scripts/tx_log_rotate.sh",cat:"MAINTENANCE",pri:"NORMAL"},
 gitstatus:{cmd:"git status --short && git diff --stat",cat:"GIT",pri:"NORMAL"},
 upcheck:{cmd:"cat reports/TRILLIONX_UP_TO_DATE_CHECK_LATEST.json 2>/dev/null | python3 -m json.tool | tail -80 || true",cat:"GIT",pri:"NORMAL"},
 bench_workspace:{cmd:"node benchmarks/trillionx_codespaces_workspace_bench.js",cat:"BENCH",pri:"NORMAL"},
 npm_check:{cmd:"npm --version && node --version && npm ls --depth=0 2>/dev/null | head -80 || true",cat:"NPM",pri:"NORMAL"}
};

const LOG=P("logs/tx_async_global_drain_v2.log");
const LATEST=P("reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_LATEST.json");
const HIST=P("history/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_HISTORY.jsonl");
const MODE=process.argv[2]||"drain";
const TYPE=process.argv[3]||"status";
const MAX=+process.env.TX_DRAIN_MAX||100;
const TIMEOUT=+process.env.TX_DRAIN_TIMEOUT_MS||600000;
const STALE=+process.env.TX_DRAIN_STALE_MS||180000;

function install(){
 const r={engine:"TRILLIONX_GLOBAL_ASYNC_REGISTRY_V2",time:now(),jobs:REG,policy:{
  allowlist_only:true,no_free_shell:true,no_appjs_touch:true,no_data_touch:true,no_raid60_touch:true,
  scope:"runtime/network/sync/maintenance/bench/git/npm/process"
 }};
 r.seal=sha(r);
 write(P("async_registry/TRILLIONX_GLOBAL_ASYNC_REGISTRY_V2.json"),r);
 return r;
}
function jid(t){return `${new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}_${t}_${process.pid}_${Math.floor(Math.random()*999999)}`}
function submit(t){
 if(!REG[t]) throw Error("UNKNOWN_JOB_"+t);
 const j={id:jid(t),type:t,cat:REG[t].cat,priority:REG[t].pri,created:now(),seal:null};
 j.seal=sha(j);
 write(P(`async_queue/${j.id}.json`),j);
 console.log(JSON.stringify(j,null,2));
}
function stale(){
 let n=0;
 for(const f of ls("async_jobs")){
  const full=P("async_jobs/"+f), age=Date.now()-fs.statSync(full).mtimeMs;
  if(age<STALE) continue;
  const j=read(full)||{id:f.replace(".running.json",""),type:"unknown"};
  const out={engine:"TRILLIONX_STALE_RECOVERY",time:now(),job:j,age_ms:age,status:"STALE_REQUEUED"};
  out.seal=sha(out);
  write(P(`async_results/${j.id||Date.now()}_stale.json`),out);
  if(REG[j.type]) write(P(`async_queue/${j.id}.json`),{...j,requeued:true,requeued_at:now(),reason:"STALE_RUNNING"});
  try{fs.unlinkSync(full)}catch{}
  n++;
 }
 return n;
}
function next(){
 for(const f of ls("async_queue")){
  const j=read(P("async_queue/"+f));
  if(!j){try{fs.unlinkSync(P("async_queue/"+f))}catch{};continue}
  if(!REG[j.type]){
    const out={engine:"TRILLIONX_JOB_REJECT",time:now(),job:j,status:"REJECTED_UNKNOWN"};
    out.seal=sha(out); write(P(`async_results/${j.id||Date.now()}_reject.json`),out);
    try{fs.unlinkSync(P("async_queue/"+f))}catch{}
    continue;
  }
  return {f,j};
 }
 return null;
}
function run(item){
 const {f,j}=item, spec=REG[j.type], start=now(), t0=performance.now();
 const logfile=P(`logs/tx_global_job_${j.id}.log`);
 const running={...j,started:start,cmd:spec.cmd,log:logfile,pid:process.pid};
 write(P(`async_jobs/${j.id}.running.json`),running);
 try{fs.unlinkSync(P("async_queue/"+f))}catch{}
 let status="DONE", err=null;
 try{
  app(LOG,`${now()} RUN ${j.type} ${j.id}`);
  cp.execSync(spec.cmd,{cwd:ROOT,shell:"/bin/bash",stdio:["ignore",fs.openSync(logfile,"a"),fs.openSync(logfile,"a")],timeout:TIMEOUT});
 }catch(e){status="FAILED_OR_TIMEOUT";err=String(e.message||e)}
 const dur=Math.round(performance.now()-t0);
 let tail=""; try{tail=fs.readFileSync(logfile,"utf8").split(/\r?\n/).slice(-80).join("\n")}catch{}
 const der={engine:"TRILLIONX_JOB_DERIVATIVE",time:now(),id:j.id,type:j.type,cat:spec.cat,status,duration_ms:dur,log_tail:tail,error:err};
 der.seal=sha(der); write(P(`async_derivatives/${j.id}.derivative.json`),der);
 const out={engine:"TRILLIONX_GLOBAL_ASYNC_RESULT",id:j.id,type:j.type,cat:spec.cat,priority:spec.pri,started:start,finished:now(),status,duration_ms:dur,log:logfile,derivative:`async_derivatives/${j.id}.derivative.json`,error:err};
 out.seal=sha(out); write(P(`async_results/${j.id}.json`),out);
 app(HIST,JSON.stringify({time:out.finished,id:j.id,type:j.type,cat:spec.cat,status,duration_ms:dur,seal:out.seal}));
 try{fs.unlinkSync(P(`async_jobs/${j.id}.running.json`))}catch{}
 return out;
}
function summary(extra={}){
 const q=ls("async_queue"), r=ls("async_jobs"), out=ls("async_results").map(f=>read(P("async_results/"+f))).filter(Boolean);
 const byStatus={}, byCat={}, byType={};
 for(const x of out){byStatus[x.status]=(byStatus[x.status]||0)+1;byCat[x.cat]=(byCat[x.cat]||0)+1;byType[x.type]=(byType[x.type]||0)+1}
 const rep={engine:"TRILLIONX_ASYNC_GLOBAL_DRAIN_V2",time:now(),queue:q.length,running:r.length,results:out.length,by_status:byStatus,by_category:byCat,by_type:byType,latest:out.slice(-20).map(x=>({id:x.id,type:x.type,cat:x.cat,status:x.status,duration_ms:x.duration_ms})),extra,registry_jobs:Object.keys(REG),policy:{global_not_bench_only:true,allowlist:true,safe:true}};
 rep.seal=sha(rep); write(LATEST,rep); console.log(JSON.stringify(rep,null,2));
}
function drain(){
 install();
 const recovered=stale();
 let done=0;
 while(done<MAX){
  const item=next(); if(!item) break;
  run(item); done++;
 }
 summary({mode:"drain",done,recovered,max:MAX});
}
function daemon(){
 install(); app(LOG,`${now()} DAEMON START`);
 setInterval(()=>{try{stale(); const item=next(); if(item)run(item); summary({mode:"daemon"})}catch(e){app(LOG,`${now()} ERR ${e.message}`)}},+process.env.TX_DRAIN_DAEMON_MS||2500);
}
install();
if(MODE==="submit") submit(TYPE);
else if(MODE==="status") summary({mode:"status"});
else if(MODE==="daemon") daemon();
else drain();
JS

node --check scripts/tx_async_global_drain_v2.js

cat > scripts/tx_global_submit.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
node scripts/tx_async_global_drain_v2.js submit "${1:-status}"
SH

cat > scripts/tx_global_drain.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
TX_DRAIN_MAX="${TX_DRAIN_MAX:-100}" node scripts/tx_async_global_drain_v2.js drain
SH

cat > scripts/tx_global_status.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
node scripts/tx_async_global_drain_v2.js status | tee reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_STATUS.txt
SH

cat > scripts/tx_global_daemon_start.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
[ -f runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID)" 2>/dev/null || true
nohup node scripts/tx_async_global_drain_v2.js daemon > logs/tx_global_drain_daemon.out 2>&1 &
echo $! > runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID
echo "GLOBAL_DRAIN_DAEMON_PID=$(cat runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID)"
SH

cat > scripts/tx_global_daemon_stop.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_GLOBAL_DRAIN_DAEMON_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_async_global_drain_v2.js daemon" 2>/dev/null || true
echo "GLOBAL_DRAIN_DAEMON_STOPPED"
SH

cat > scripts/tx_global_catalog.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
cat async_registry/TRILLIONX_GLOBAL_ASYNC_REGISTRY_V2.json | python3 -m json.tool
SH

chmod +x scripts/tx_global_*.sh

echo "=== TEST + PREMIER STATUS ==="
node scripts/tx_async_global_drain_v2.js status >/tmp/tx_global_status.json
python3 -m json.tool /tmp/tx_global_status.json >/dev/null && echo "JSON OK"

git add scripts/tx_async_global_drain_v2.js scripts/tx_global_*.sh async_registry/TRILLIONX_GLOBAL_ASYNC_REGISTRY_V2.json reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_LATEST.json history/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_HISTORY.jsonl 2>/dev/null || true
git commit -m "Add TRILLIONX global async drain v2" || echo "Rien à commit"

echo "============================================================"
echo "✅ GLOBAL DRAIN V2 OK"
echo "Catalogue : bash scripts/tx_global_catalog.sh"
echo "Status    : bash scripts/tx_global_status.sh"
echo "Submit    : bash scripts/tx_global_submit.sh status"
echo "Drain     : bash scripts/tx_global_drain.sh"
echo "Daemon    : bash scripts/tx_global_daemon_start.sh"
echo "Stop      : bash scripts/tx_global_daemon_stop.sh"
echo "============================================================"
