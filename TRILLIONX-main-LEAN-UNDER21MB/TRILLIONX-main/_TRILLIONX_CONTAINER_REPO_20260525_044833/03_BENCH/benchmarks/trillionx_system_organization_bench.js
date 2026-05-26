"use strict";
const fs=require("fs"),os=require("os"),crypto=require("crypto"),cp=require("child_process"),path=require("path");
const {performance}=require("perf_hooks");

const OUT="reports/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_LATEST.json";
const HIST="history/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_HISTORY.jsonl";
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim()}catch{return""}};
const exists=p=>fs.existsSync(p);
const list=(d,rx=null)=>exists(d)?fs.readdirSync(d).filter(x=>!rx||rx.test(x)):[];
const fileCount=d=>Number(sh(`find ${d} -type f 2>/dev/null | wc -l`))||0;
const du=d=>sh(`du -sh ${d} 2>/dev/null | awk '{print $1}'`)||"0";
const jsonOk=f=>{try{JSON.parse(fs.readFileSync(f,"utf8"));return true}catch{return false}};
const lines=f=>{try{return fs.readFileSync(f,"utf8").split(/\r?\n/).filter(Boolean).length}catch{return 0}};

function title(s){console.log("\n"+"=".repeat(72));console.log(" "+s);console.log("=".repeat(72))}
function kv(k,v,u=""){console.log(String(k).padEnd(34," ")+": "+String(v)+(u?" "+u:""))}

function disk(){
 const o=sh("df -P . | tail -1").split(/\s+/);
 const pct=parseFloat((o[4]||"0").replace("%",""))||0;
 return {used_pct:r(pct),free_pct:r(100-pct),mount:o[5]||"."};
}
function host(){
 const c=os.cpus()||[], sp=c.map(x=>x.speed||0).filter(Boolean);
 return {
  cpu:c[0]?.model||"unknown",
  logical_cpu:c.length,
  ghz:r((sp.reduce((a,b)=>a+b,0)/(sp.length||1))/1000),
  ram_total_gb:r(os.totalmem()/1073741824),
  ram_free_gb:r(os.freemem()/1073741824),
  load:os.loadavg().map(r),
  node:process.version,
  platform:os.platform()
 };
}

function dirsAudit(){
 const dirs=["scripts","benchmarks","reports","history","logs","runtime_state","async_queue","async_jobs","async_results","async_registry","async_derivatives","micro_sync","controllers","backend","firmware"];
 const out={};
 for(const d of dirs){
  out[d]={exists:exists(d),files:exists(d)?fileCount(d):0,size:exists(d)?du(d):"0"};
 }
 return out;
}

function asyncAudit(){
 const q=list("async_queue",/\.json$/);
 const run=list("async_jobs",/\.json$/);
 const res=list("async_results",/\.json$/);
 const der=list("async_derivatives",/\.json$/);
 const reg=list("async_registry",/\.json$/);
 const stale=[];
 const now=Date.now();
 for(const f of run){
  const p=path.join("async_jobs",f);
  try{
    const ageMs=now-fs.statSync(p).mtimeMs;
    if(ageMs>180000) stale.push({file:f,age_s:r(ageMs/1000)});
  }catch{}
 }
 return {
  queue:q.length,
  running:run.length,
  stale_running:stale.length,
  stale,
  results:res.length,
  derivatives:der.length,
  registries:reg.length,
  registry_json_ok:reg.map(f=>jsonOk(path.join("async_registry",f))).filter(Boolean).length,
  health:q.length<20 && stale.length===0 ? "OK" : stale.length>0 ? "STALE_RUNNING" : "QUEUE_HIGH"
 };
}

function syncAudit(){
 const files=[
  "reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json",
  "reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json"
 ];
 const ok=files.filter(f=>exists(f)&&jsonOk(f));
 let latest=null;
 for(const f of ok){
  try{latest=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}
 }
 return {
  available:ok.length,
  files:ok,
  latest_seq:latest?.seq||0,
  latest_latency_ms:latest?.latency_avg_ms||latest?.latency_ms||null,
  latest_open_ports:latest?.open_ports||[],
  health:ok.length>0 ? "OK" : "MISSING"
 };
}

function reportsAudit(){
 const reps=list("reports",/\.json$/);
 const hist=list("history",/\.jsonl$/);
 let ok=0,bad=0;
 for(const f of reps){ if(jsonOk(path.join("reports",f))) ok++; else bad++; }
 let histLines=0;
 for(const f of hist) histLines+=lines(path.join("history",f));
 return {
  json_reports:reps.length,
  json_ok:ok,
  json_bad:bad,
  jsonl_history_files:hist.length,
  jsonl_lines:histLines,
  health:bad===0 && reps.length>0 ? "OK" : "CHECK"
 };
}

function gitAudit(){
 return {
  branch:sh("git branch --show-current")||"unknown",
  changed:sh("git status --short | wc -l")||"0",
  last_commit:sh("git log -1 --oneline 2>/dev/null")||"unavailable",
  diff_stat:sh("git diff --stat | tail -20")||"",
  health:Number(sh("git status --short | wc -l")||0)<20 ? "OK" : "MANY_LOCAL_CHANGES"
 };
}

function runtimeAudit(){
 const ports=sh("ss -lntp 2>/dev/null | grep -E ':3000|:3997|:9229|:30[0-9][0-9]' | head -120 || true");
 const nodeProcs=sh("ps -eo pid,%cpu,%mem,cmd --sort=-%cpu | grep -E 'node|TRILLIONX|app.js' | grep -v grep | head -40 || true");
 return {
  port3000_open:/\:3000\b/.test(ports),
  ports_text:ports,
  node_process_lines:nodeProcs.split(/\r?\n/).filter(Boolean).length,
  health:/\:3000\b/.test(ports) ? "APP3000_OPEN" : "APP3000_CLOSED_OR_IDLE"
 };
}

function scriptsAudit(){
 const required=[
  "scripts/tx_global_drain.sh",
  "scripts/tx_global_status.sh",
  "scripts/tx_global_submit.sh",
  "scripts/tx_async_drain.sh",
  "scripts/tx_parallel_micro_sync_start.sh",
  "scripts/tx_parallel_micro_sync_status.sh",
  "scripts/tx_process_status.sh",
  "scripts/tx_log_rotate.sh"
 ];
 const present=required.filter(exists);
 const executable=present.filter(f=>{try{return !!(fs.statSync(f).mode&0o111)}catch{return false}});
 return {
  required:required.length,
  present:present.length,
  executable:executable.length,
  missing:required.filter(f=>!exists(f)),
  health:present.length===required.length ? "OK" : "MISSING_SCRIPTS"
 };
}

function scoreAll(a){
 let score=0;
 score+=a.dirs.scripts.exists?800:0;
 score+=a.dirs.reports.exists?500:0;
 score+=a.dirs.history.exists?500:0;
 score+=a.dirs.async_queue.exists?500:0;
 score+=a.dirs.async_results.exists?500:0;
 score+=a.dirs.async_registry.exists?500:0;
 score+=a.scripts.present*250;
 score+=a.scripts.executable*150;
 score+=a.async.registries*400;
 score+=a.async.derivatives*5;
 score+=Math.min(3000,a.async.results*20);
 score+=a.async.stale_running===0?2500:-2500;
 score+=a.async.queue<20?1500:-1000;
 score+=a.sync.available>0?2000:0;
 score+=a.reports.json_bad===0?1500:-1500;
 score+=Math.min(2000,a.reports.json_ok*50);
 score+=a.runtime.port3000_open?1500:0;
 score+=a.disk.used_pct<70?1500:a.disk.used_pct<85?500:-2000;
 score+=a.host.ram_free_gb>1?1000:-1000;
 score+=a.git.health==="OK"?500:-500;
 return r(score);
}

(function main(){
 const t0=performance.now();
 title("TRILLIONX SYSTEM ORGANIZATION BENCH");

 const audit={
  engine:"TRILLIONX_SYSTEM_ORGANIZATION_BENCH",
  time:new Date().toISOString(),
  host:host(),
  disk:disk(),
  dirs:dirsAudit(),
  scripts:scriptsAudit(),
  async:asyncAudit(),
  sync:syncAudit(),
  reports:reportsAudit(),
  runtime:runtimeAudit(),
  git:gitAudit()
 };
 audit.summary={
  score:scoreAll(audit),
  health:{
    disk:audit.disk.used_pct<70?"OK":audit.disk.used_pct<85?"WATCH":"CRITICAL",
    async:audit.async.health,
    sync:audit.sync.health,
    reports:audit.reports.health,
    scripts:audit.scripts.health,
    runtime:audit.runtime.health,
    git:audit.git.health
  },
  verdict:"TRILLIONX_SYSTEM_ORGANIZATION_BENCH_COMPLETE",
  runtime_ms:r(performance.now()-t0)
 };
 audit.truth_policy={
  real_only:true,
  organization_bench_not_compute_power:true,
  no_destructive_actions:true,
  no_appjs_touch:true,
  no_data_touch:true,
  no_raid60_touch:true
 };
 audit.seal=sha(audit);

 fs.writeFileSync(OUT,JSON.stringify(audit,null,2));
 fs.appendFileSync(HIST,JSON.stringify({
  time:audit.time,
  score:audit.summary.score,
  health:audit.summary.health,
  seal:audit.seal
 })+"\n");

 kv("Score organisation",audit.summary.score);
 kv("Disk",audit.summary.health.disk);
 kv("Async",audit.summary.health.async);
 kv("Sync μ-packet",audit.summary.health.sync);
 kv("Reports",audit.summary.health.reports);
 kv("Scripts",audit.summary.health.scripts);
 kv("Runtime",audit.summary.health.runtime);
 kv("Git",audit.summary.health.git);
 kv("Queue async",audit.async.queue);
 kv("Running async",audit.async.running);
 kv("Stale running",audit.async.stale_running);
 kv("Results async",audit.async.results);
 kv("Derivatives",audit.async.derivatives);
 kv("Reports JSON OK",audit.reports.json_ok);
 kv("Reports JSON bad",audit.reports.json_bad);
 kv("Port 3000",audit.runtime.port3000_open?"OPEN":"CLOSED");
 kv("Seal",audit.seal);
 kv("Report",OUT);
})();
