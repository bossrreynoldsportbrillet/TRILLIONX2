"use strict";
const fs=require("fs"),path=require("path"),cp=require("child_process"),crypto=require("crypto");
const {performance}=require("perf_hooks");

const ROOT="/workspaces/TRILLIONX";
const DIRS={
 q:path.join(ROOT,"async_queue"),
 r:path.join(ROOT,"async_jobs"),
 out:path.join(ROOT,"async_results"),
 reg:path.join(ROOT,"async_registry"),
 cod:path.join(ROOT,"async_codecs"),
 der:path.join(ROOT,"async_derivatives"),
 log:path.join(ROOT,"logs"),
 rep:path.join(ROOT,"reports"),
 hist:path.join(ROOT,"history")
};
for(const d of Object.values(DIRS))fs.mkdirSync(d,{recursive:true});

const MODE=process.argv[2]||"drain";
const STALE_MS=Number(process.env.TX_ASYNC_STALE_MS||180000);
const MAX_JOBS=Number(process.env.TX_ASYNC_MAX_JOBS||50);
const TIMEOUT_MS=Number(process.env.TX_ASYNC_JOB_TIMEOUT_MS||600000);
const CONCURRENCY=Math.max(1,Number(process.env.TX_ASYNC_CONCURRENCY||1));
const LOG=path.join(DIRS.log,"tx_async_drain_registry_codec.log");
const LATEST=path.join(DIRS.rep,"TRILLIONX_ASYNC_DRAIN_REGISTRY_CODEC_LATEST.json");
const HIST=path.join(DIRS.hist,"TRILLIONX_ASYNC_DRAIN_REGISTRY_CODEC_HISTORY.jsonl");

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();
const safeReadJson=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
const writeJson=(f,o)=>fs.writeFileSync(f,JSON.stringify(o,null,2));
const append=(f,s)=>fs.appendFileSync(f,s.endsWith("\n")?s:s+"\n");
const ls=(d,ext=".json")=>fs.readdirSync(d).filter(x=>x.endsWith(ext)).sort();

const REGISTRY={
 resource:{cmd:"bash scripts/trillionx_resource_percent.sh",category:"SYSTEM",priority:"HIGH",codec:"json_or_text",derivative:"resource_state"},
 disk:{cmd:"bash scripts/trillionx_disk_guard_safe.sh",category:"STORAGE",priority:"CRITICAL",codec:"text",derivative:"disk_guard"},
 status:{cmd:"bash scripts/tx_process_status.sh",category:"PROCESS",priority:"HIGH",codec:"text",derivative:"process_status"},
 appcheck:{cmd:"node --check app.js",category:"APP",priority:"CRITICAL",codec:"text",derivative:"syntax_check"},
 startnice:{cmd:"bash scripts/tx_start_nice.sh",category:"RUNTIME",priority:"HIGH",codec:"text",derivative:"runtime_start"},
 stop:{cmd:"bash scripts/tx_stop.sh",category:"RUNTIME",priority:"HIGH",codec:"text",derivative:"runtime_stop"},
 logrotate:{cmd:"bash scripts/tx_log_rotate.sh",category:"MAINTENANCE",priority:"NORMAL",codec:"text",derivative:"log_clean"},
 microstatus:{cmd:"bash scripts/tx_parallel_micro_sync_status.sh",category:"SYNC",priority:"NORMAL",codec:"json_or_text",derivative:"micro_sync_state"},
 bench:{cmd:"node benchmarks/trillionx_codespaces_workspace_bench.js",category:"BENCH",priority:"NORMAL",codec:"json",derivative:"bench_score"}
};

function installRegistry(){
 const reg={
  engine:"TRILLIONX_ASYNC_JOB_REGISTRY",
  time:now(),
  version:"1.0",
  allowed_jobs:REGISTRY,
  policy:{
    allowlist_only:true,
    no_shell_freeform:true,
    no_destructive_data_touch:true,
    app_js_untouched:true,
    data_untouched:true,
    raid60_plus_untouched:true
  }
 };
 reg.seal=sha(reg);
 writeJson(path.join(DIRS.reg,"TRILLIONX_ASYNC_JOB_REGISTRY.json"),reg);
 writeJson(path.join(DIRS.cod,"TRILLIONX_ASYNC_CODEC_CATALOG.json"),{
  engine:"TRILLIONX_ASYNC_CODEC_CATALOG",
  time:now(),
  codecs:{
    json:{decode:"JSON.parse",store:"pretty json + jsonl summary"},
    text:{decode:"raw text tail",store:"log + checksum"},
    json_or_text:{decode:"try json then raw text",store:"best effort"}
  }
 });
 writeJson(path.join(DIRS.der,"TRILLIONX_ASYNC_DERIVATIVE_CATALOG.json"),{
  engine:"TRILLIONX_ASYNC_DERIVATIVE_CATALOG",
  time:now(),
  derivatives:["resource_state","disk_guard","process_status","syntax_check","runtime_start","runtime_stop","log_clean","micro_sync_state","bench_score"]
 });
}

function jobId(type){return `${new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}_${type}_${process.pid}_${Math.floor(Math.random()*1e6)}`}

function submit(type){
 if(!REGISTRY[type]) throw new Error("UNKNOWN_JOB_TYPE_"+type);
 const id=jobId(type);
 const job={id,type,time:now(),priority:REGISTRY[type].priority,category:REGISTRY[type].category,policy:"TRILLIONX_ASYNC_ALLOWLIST"};
 job.seal=sha(job);
 writeJson(path.join(DIRS.q,`${id}.json`),job);
 return job;
}

function decodeResult(job,logfile,status,error){
 let raw="";
 try{raw=fs.readFileSync(logfile,"utf8")}catch{}
 const codec=REGISTRY[job.type]?.codec||"text";
 let parsed=null;
 if(codec==="json"||codec==="json_or_text"){
  const m=raw.match(/\{[\s\S]*\}\s*$/);
  if(m){try{parsed=JSON.parse(m[0])}catch{}}
 }
 const tail=raw.split(/\r?\n/).slice(-80).join("\n");
 const derivative={
  job_id:job.id,
  type:job.type,
  category:REGISTRY[job.type]?.category||"UNKNOWN",
  derivative:REGISTRY[job.type]?.derivative||"unknown",
  status,
  error:error||null,
  log_bytes:Buffer.byteLength(raw),
  log_tail:tail,
  parsed_available:!!parsed,
  parsed,
  seal:sha({job,status,error,tail})
 };
 writeJson(path.join(DIRS.der,`${job.id}.derivative.json`),derivative);
 return derivative;
}

function markResult(job,status,meta={}){
 const out={
  engine:"TRILLIONX_ASYNC_JOB_RESULT",
  id:job.id,
  type:job.type,
  category:REGISTRY[job.type]?.category||"UNKNOWN",
  priority:REGISTRY[job.type]?.priority||"UNKNOWN",
  started:meta.started||null,
  finished:now(),
  status,
  cmd:REGISTRY[job.type]?.cmd||null,
  log:meta.log||null,
  error:meta.error||null,
  duration_ms:meta.duration_ms||null
 };
 out.derivative=meta.derivative||null;
 out.seal=sha(out);
 writeJson(path.join(DIRS.out,`${job.id}.json`),out);
 append(HIST,JSON.stringify({time:out.finished,id:out.id,type:out.type,status:out.status,duration_ms:out.duration_ms,seal:out.seal}));
 return out;
}

function moveStaleRunning({requeue=true}={}){
 const files=ls(DIRS.r);
 const stale=[];
 for(const f of files){
  const full=path.join(DIRS.r,f);
  const st=fs.statSync(full);
  const age=Date.now()-st.mtimeMs;
  if(age<STALE_MS) continue;
  const run=safeReadJson(full)||{id:f.replace(".running.json",""),type:"unknown"};
  run.stale_detected_at=now();
  run.age_ms=age;
  stale.push(run);
  if(requeue && REGISTRY[run.type]){
    const qfile=path.join(DIRS.q,`${run.id}.json`);
    writeJson(qfile,{id:run.id,type:run.type,time:now(),requeued:true,reason:"STALE_RUNNING",previous:run});
    markResult(run,"STALE_REQUEUED",{error:"running job stale, requeued"});
  } else {
    markResult(run,"STALE_ABORTED",{error:"running job stale, not requeued"});
  }
  try{fs.unlinkSync(full)}catch{}
 }
 return stale;
}

function nextJob(){
 const files=ls(DIRS.q);
 for(const f of files){
  const job=safeReadJson(path.join(DIRS.q,f));
  if(job && REGISTRY[job.type]) return {file:f,job};
  if(job && !REGISTRY[job.type]){
    try{fs.unlinkSync(path.join(DIRS.q,f))}catch{}
    markResult(job,"REJECTED_UNKNOWN_TYPE",{error:"not in registry allowlist"});
  }
 }
 return null;
}

function runOne(item){
 const {file,job}=item;
 const reg=REGISTRY[job.type];
 const started=now();
 const t0=performance.now();
 const logfile=path.join(DIRS.log,`tx_async_job_${job.id}.log`);
 const running={...job,started,cmd:reg.cmd,log:logfile,pid:process.pid};
 writeJson(path.join(DIRS.r,`${job.id}.running.json`),running);
 try{fs.unlinkSync(path.join(DIRS.q,file))}catch{}

 let status="DONE", error=null;
 try{
  append(LOG,`${now()} RUN ${job.id} ${job.type} :: ${reg.cmd}`);
  cp.execSync(reg.cmd,{cwd:ROOT,stdio:["ignore",fs.openSync(logfile,"a"),fs.openSync(logfile,"a")],timeout:TIMEOUT_MS});
 }catch(e){
  status=(String(e.message||"").includes("ETIMEDOUT")||String(e.signal||"").includes("SIGTERM"))?"TIMEOUT_OR_KILLED":"FAILED";
  error=String(e.message||e);
 }
 const duration_ms=Math.round(performance.now()-t0);
 const derivative=decodeResult(job,logfile,status,error);
 try{fs.unlinkSync(path.join(DIRS.r,`${job.id}.running.json`))}catch{}
 return markResult(job,status,{started,log:logfile,error,duration_ms,derivative:path.join(DIRS.der,`${job.id}.derivative.json`)});
}

function summarize(started,extra={}){
 const q=ls(DIRS.q), running=ls(DIRS.r), results=ls(DIRS.out);
 const all=results.map(f=>safeReadJson(path.join(DIRS.out,f))).filter(Boolean);
 const byStatus={};
 const byType={};
 for(const x of all){
  byStatus[x.status]=(byStatus[x.status]||0)+1;
  byType[x.type]=(byType[x.type]||0)+1;
 }
 const latest=all.slice(-20);
 const rep={
  engine:"TRILLIONX_ASYNC_DRAIN_REGISTRY_CODEC",
  time:now(),
  started,
  mode:MODE,
  queue_count:q.length,
  running_count:running.length,
  results_count:results.length,
  by_status:byStatus,
  by_type:byType,
  latest_results:latest.map(x=>({id:x.id,type:x.type,status:x.status,duration_ms:x.duration_ms})),
  registry_count:Object.keys(REGISTRY).length,
  directories:DIRS,
  extra,
  policy:{
    drain_safe:true,
    allowlist_only:true,
    stuck_running_guard:true,
    codec_derivative_enabled:true,
    no_app_js_touch:true,
    no_data_touch:true,
    no_raid60_plus_touch:true
  }
 };
 rep.seal=sha(rep);
 writeJson(LATEST,rep);
 return rep;
}

async function drain(){
 installRegistry();
 const started=now();
 const stale=moveStaleRunning({requeue:true});
 let done=0, failed=0, timeout=0, rejected=0;
 while(done+failed+timeout+rejected<MAX_JOBS){
  const item=nextJob();
  if(!item) break;
  const res=runOne(item);
  if(res.status==="DONE") done++;
  else if(res.status==="TIMEOUT_OR_KILLED") timeout++;
  else if(res.status.startsWith("REJECTED")) rejected++;
  else failed++;
 }
 const rep=summarize(started,{stale_recovered:stale.length,done,failed,timeout,rejected,max_jobs:MAX_JOBS,concurrency:CONCURRENCY});
 console.log(JSON.stringify(rep,null,2));
}

function status(){
 installRegistry();
 const rep=summarize(now(),{status_only:true});
 console.log(JSON.stringify(rep,null,2));
}

function clearDone(){
 const keep=Number(process.env.TX_ASYNC_KEEP_RESULTS||200);
 const files=ls(DIRS.out);
 const remove=files.slice(0,Math.max(0,files.length-keep));
 for(const f of remove) try{fs.unlinkSync(path.join(DIRS.out,f))}catch{}
 const rep=summarize(now(),{clear_done:true,removed:remove.length,kept:keep});
 console.log(JSON.stringify(rep,null,2));
}

function daemon(){
 installRegistry();
 append(LOG,`${now()} DAEMON START stale_ms=${STALE_MS} max_jobs=${MAX_JOBS}`);
 setInterval(()=>{try{moveStaleRunning({requeue:true}); const item=nextJob(); if(item)runOne(item); summarize(now(),{daemon:true});}catch(e){append(LOG,`${now()} ERR ${e.message}`)}},Number(process.env.TX_ASYNC_DAEMON_MS||2500));
}

try{
 if(MODE==="submit") console.log(JSON.stringify(submit(process.argv[3]||"status"),null,2));
 else if(MODE==="status") status();
 else if(MODE==="daemon") daemon();
 else if(MODE==="clear") clearDone();
 else drain();
}catch(e){
 console.error("TX_ASYNC_DRAIN_ERROR",e.message);
 process.exit(1);
}
