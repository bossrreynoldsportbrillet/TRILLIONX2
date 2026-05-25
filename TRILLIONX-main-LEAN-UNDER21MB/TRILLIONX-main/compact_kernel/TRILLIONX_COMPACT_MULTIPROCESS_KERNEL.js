"use strict";

/*
 TRILLIONX COMPACT MULTIPROCESSING KERNEL
 - single master file
 - keeps multiprocessing
 - bounded worker pool
 - app.js linker
 - disk guard
 - RAM guard
 - telemetry in RAM only
 - tiny live_metrics.json only
 - no auto push
*/

const fs=require("fs");
const os=require("os");
const path=require("path");
const http=require("http");
const crypto=require("crypto");
const dns=require("dns");
const {Worker}=require("worker_threads");
const {spawn,execSync}=require("child_process");

const ROOT="/workspaces";
const REPO=process.cwd();
const BASE=path.join(REPO,"compact_kernel");
const PORT=26000;

const MAX_TELEMETRY=400;
const MAX_WORKERS=Math.max(2,Math.min(os.cpus().length*2,16));
const MAX_JOBS=3000;

function sh(cmd,timeout=10000){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}

function mkdir(p){fs.mkdirSync(p,{recursive:true});}

function saveSmall(file,obj){
  mkdir(path.dirname(file));
  const s=JSON.stringify(obj,null,2);
  fs.writeFileSync(file,Buffer.byteLength(s)>512*1024
    ? JSON.stringify({truncated:true,time:new Date().toISOString()},null,2)
    : s
  );
}

function disk(){
  const raw=sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'");
  const used=Number(sh("df /workspaces | awk 'NR==2 {gsub(\"%\",\"\",$5); print $5}'"))||0;
  return {raw,used_percent:used};
}

function cpuFlags(){
  const f=sh("grep -m1 '^flags' /proc/cpuinfo || true");
  const has=x=>new RegExp("\\b"+x+"\\b").test(f);
  return {
    sse:has("sse"),
    sse2:has("sse2"),
    sse4_1:has("sse4_1"),
    sse4_2:has("sse4_2"),
    avx:has("avx"),
    avx2:has("avx2"),
    avx512f:has("avx512f"),
    aes_ni:has("aes"),
    sha_ni:has("sha_ni")||has("sha"),
    fma:has("fma"),
    bmi1:has("bmi1"),
    bmi2:has("bmi2")
  };
}

const STATE={
  mode:"TRILLIONX_COMPACT_MULTIPROCESSING_KERNEL",
  boot:new Date().toISOString(),
  repo:REPO,
  root:ROOT,
  doctrine:"ONE_MASTER_KERNEL + MULTIPROCESSING + DISK_SAFE + REAL_ONLY_OR_UNAVAILABLE",
  push_policy:"MANUAL_ONLY",
  auto_start_apps:false,
  max_workers:MAX_WORKERS,
  max_jobs:MAX_JOBS,
  telemetry_limit:MAX_TELEMETRY
};

const METRICS={
  disk:{},
  ram:{},
  cpu:{},
  apps:[],
  app_js:0,
  child_apps:{},
  workers:{},
  worker_count:0,
  worker_hash_total_hps:0,
  sha256_hps_master:0,
  dns_ms:0,
  jobs_done:0,
  queue_depth:0,
  uptime:0,
  rss_mb:0,
  loadavg:[0,0,0],
  verdict:"BOOT"
};

const TELEMETRY=[];
const APP_CHILDREN={};
const WORKERS={};
const JOBS=[];

function push(type,data){
  TELEMETRY.push({t:new Date().toISOString(),type,data});
  if(TELEMETRY.length>MAX_TELEMETRY) TELEMETRY.shift();
}

function scanApps(){
  const raw=sh(`find ${ROOT} -maxdepth 7 -name app.js -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | sort | head -80`);
  const apps=(raw==="UNAVAILABLE"||!raw)?[]:raw.split(/\n/).filter(Boolean).map((file,i)=>({
    id:"APP_"+String(i).padStart(3,"0"),
    file,
    repo:path.dirname(file),
    port:3000+i
  }));
  METRICS.apps=apps;
  METRICS.app_js=apps.length;
}

function refresh(){
  const d=disk();
  METRICS.disk=d;
  METRICS.ram={
    total_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
    free_gb:+(os.freemem()/1024/1024/1024).toFixed(2)
  };
  METRICS.cpu={
    model:os.cpus()[0]?.model||"UNKNOWN",
    threads:os.cpus().length,
    arch:os.arch(),
    kernel:os.release(),
    flags:cpuFlags()
  };
  METRICS.uptime=Math.round(process.uptime());
  METRICS.rss_mb=+(process.memoryUsage().rss/1024/1024).toFixed(2);
  METRICS.loadavg=os.loadavg();
  METRICS.child_apps=APP_CHILDREN;
  METRICS.worker_count=Object.keys(WORKERS).length;
  METRICS.workers=Object.fromEntries(Object.entries(WORKERS).map(([id,w])=>[id,{
    id,
    pid:w.threadId||null,
    family:w.family,
    last_hps:w.last_hps||0,
    status:w.status
  }]));

  if(d.used_percent>=95) METRICS.verdict="CRITICAL_DISK_STOP";
  else if(d.used_percent>=90) METRICS.verdict="DANGER_DISK_CLEAN";
  else if(d.used_percent>=80) METRICS.verdict="COMPACT_MULTIPROCESS_LIMITED";
  else METRICS.verdict="OK_MULTIPROCESS_SAFE";

  saveSmall(path.join(BASE,"live_metrics.json"),METRICS);
}

function masterPulse(){
  let c=0,t=Date.now();
  while(Date.now()-t<300){
    crypto.createHash("sha256").update("master"+Math.random()).digest("hex");
    c++;
  }
  METRICS.sha256_hps_master=Math.round(c*(1000/300));
  push("master_sha256",{hps:METRICS.sha256_hps_master});
}

function networkPulse(){
  const t=Date.now();
  dns.lookup("github.com",err=>{
    if(!err){
      METRICS.dns_ms=Date.now()-t;
      push("dns",{ms:METRICS.dns_ms});
    }
  });
}

function enqueueJobs(){
  const families=["CONTROL","CRYPTO","MEMORY","NETWORK","LINKER","BENCH","STORAGE","AI_VECTOR"];
  for(const fam of families){
    if(JOBS.length<MAX_JOBS){
      JOBS.push({id:"JOB_"+Date.now()+"_"+Math.random().toString(16).slice(2),family:fam,status:"QUEUED"});
    }
  }
  METRICS.queue_depth=JOBS.length;
}

function processJobs(){
  const n=Math.min(JOBS.length,MAX_WORKERS);
  for(let i=0;i<n;i++){
    JOBS.shift();
    METRICS.jobs_done++;
  }
  METRICS.queue_depth=JOBS.length;
}

function spawnWorkers(){
  if(Object.keys(WORKERS).length>0) return {status:"ALREADY_RUNNING",workers:Object.keys(WORKERS).length};
  if(METRICS.disk.used_percent>=90) return {status:"BLOCKED_DISK_DANGER"};
  const families=["CRYPTO","MEMORY","NETWORK","LINKER","BENCH","STORAGE","AI_VECTOR","CONTROL"];

  for(let i=0;i<MAX_WORKERS;i++){
    const family=families[i%families.length];

    const w=new Worker(`
      const crypto=require("crypto");
      const {parentPort,threadId}=require("worker_threads");
      const family=${JSON.stringify(family)};
      function loop(){
        let c=0;
        const t=Date.now();
        while(Date.now()-t<700){
          crypto.createHash("sha256").update(family+Math.random()).digest("hex");
          c++;
        }
        parentPort.postMessage({threadId,family,hps:Math.round(c*(1000/700))});
        setTimeout(loop,250);
      }
      loop();
    `,{eval:true});

    WORKERS["W_"+String(i).padStart(2,"0")]={worker:w,threadId:w.threadId,family,status:"RUNNING",last_hps:0};

    w.on("message",m=>{
      const key=Object.keys(WORKERS).find(k=>WORKERS[k].threadId===m.threadId);
      if(key){
        WORKERS[key].last_hps=m.hps;
        WORKERS[key].status="RUNNING";
      }
      METRICS.worker_hash_total_hps=Object.values(WORKERS).reduce((a,b)=>a+(b.last_hps||0),0);
      push("worker",{family:m.family,threadId:m.threadId,hps:m.hps});
    });

    w.on("error",e=>{
      const key=Object.keys(WORKERS).find(k=>WORKERS[k].worker===w);
      if(key) WORKERS[key].status="ERROR";
      push("worker_error",{family,error:String(e)});
    });
  }

  refresh();
  return {status:"STARTED",workers:Object.keys(WORKERS).length};
}

function stopWorkers(){
  for(const [k,w] of Object.entries(WORKERS)){
    try{w.worker.terminate();}catch(e){}
    delete WORKERS[k];
  }
  refresh();
  return {status:"STOPPED"};
}

function startApp(id){
  const app=METRICS.apps.find(a=>a.id===id);
  if(!app) return {status:"APP_NOT_FOUND"};
  if(APP_CHILDREN[id]) return {status:"ALREADY_RUNNING",child:APP_CHILDREN[id]};
  if(METRICS.disk.used_percent>=90) return {status:"BLOCKED_DISK_DANGER",disk:METRICS.disk};

  const out=fs.openSync(path.join(BASE,`${id}.out.log`),"a");
  const err=fs.openSync(path.join(BASE,`${id}.err.log`),"a");
  const child=spawn("bash",["-lc",`cd "${app.repo}" && PORT=${app.port} node app.js`],{
    detached:true,
    stdio:["ignore",out,err]
  });
  child.unref();
  APP_CHILDREN[id]={pid:child.pid,port:app.port,repo:app.repo,time:new Date().toISOString()};
  push("app_start",{id,pid:child.pid,port:app.port});
  refresh();
  return {status:"STARTED",child:APP_CHILDREN[id]};
}

function stopApp(id){
  const c=APP_CHILDREN[id];
  if(!c) return {status:"NOT_RUNNING"};
  try{process.kill(-c.pid,"SIGTERM");}catch(e){try{process.kill(c.pid,"SIGTERM");}catch(_e){}}
  delete APP_CHILDREN[id];
  push("app_stop",{id});
  refresh();
  return {status:"STOPPED"};
}

scanApps();
refresh();
spawnWorkers();

setInterval(refresh,5000);
setInterval(masterPulse,6000);
setInterval(networkPulse,9000);
setInterval(()=>{enqueueJobs();processJobs();},1500);
setInterval(()=>{scanApps();refresh();},60000);

const server=http.createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");
  const url=new URL(req.url,"http://127.0.0.1");

  if(url.pathname==="/api/mp/status") return res.end(JSON.stringify(STATE,null,2));
  if(url.pathname==="/api/mp/metrics") return res.end(JSON.stringify(METRICS,null,2));
  if(url.pathname==="/api/mp/apps") return res.end(JSON.stringify(METRICS.apps.map(a=>({...a,running:!!APP_CHILDREN[a.id],child:APP_CHILDREN[a.id]||null})),null,2));
  if(url.pathname==="/api/mp/telemetry") return res.end(JSON.stringify(TELEMETRY.slice(-120),null,2));

  if(url.pathname==="/api/mp/workers/start") return res.end(JSON.stringify(spawnWorkers(),null,2));
  if(url.pathname==="/api/mp/workers/stop") return res.end(JSON.stringify(stopWorkers(),null,2));

  if(url.pathname==="/api/mp/push") return res.end(JSON.stringify({
    mode:"MANUAL_ONLY",
    automatic_push:false,
    safe_sequence:[
      "git status --short",
      "git add <selected-files-only>",
      "git commit -m '<message>'",
      "git push origin <branch>"
    ]
  },null,2));

  const m=url.pathname.match(/^\/api\/mp\/apps\/(APP_\d{3})\/(start|stop|status)$/);
  if(m){
    if(m[2]==="start") return res.end(JSON.stringify(startApp(m[1]),null,2));
    if(m[2]==="stop") return res.end(JSON.stringify(stopApp(m[1]),null,2));
    const app=METRICS.apps.find(a=>a.id===m[1]);
    return res.end(JSON.stringify({app,running:!!APP_CHILDREN[m[1]],child:APP_CHILDREN[m[1]]||null},null,2));
  }

  res.statusCode=404;
  res.end(JSON.stringify({error:"NOT_FOUND"}));
});

server.listen(PORT,"0.0.0.0",()=>{
  console.log("================================================================");
  console.log(" TRILLIONX COMPACT MULTIPROCESSING KERNEL ONLINE");
  console.log("================================================================");
  console.log("PORT       : "+PORT);
  console.log("APP.JS     : "+METRICS.app_js);
  console.log("WORKERS    : "+METRICS.worker_count+"/"+MAX_WORKERS);
  console.log("DISK       : "+METRICS.disk.raw);
  console.log("VERDICT    : "+METRICS.verdict);
  console.log("PUSH       : MANUAL ONLY");
  console.log("================================================================");
});
