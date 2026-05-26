"use strict";

/*
 TRILLIONX PERF + INTEGRITY + INTELLIGENCE CORE
 - Compact vector memory
 - Sharded summaries
 - Delta scan signatures
 - Integrity ledger SHA256 chain
 - Route/API/port health matrix
 - Smart runtime decision report
 - Safe-only recommendations
*/

const fs=require("fs");
const os=require("os");
const path=require("path");
const crypto=require("crypto");
const http=require("http");
const https=require("https");
const net=require("net");
const {performance}=require("perf_hooks");

const ROOT=process.cwd();
const DATA="data";
const HIST="history";
const RUNTIME="runtime_state";
fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(HIST,{recursive:true});
fs.mkdirSync(RUNTIME,{recursive:true});

const SRC="data/trillionx_internet_vector_memory_latest.json";
const BLOCK="data/TRILLIONX_INTERNET_VECTOR_BLOCK_LATEST.json";
const COMPACT="data/TRILLIONX_VECTOR_COMPACT_LATEST.json";
const LEDGER="history/TRILLIONX_INTEGRITY_LEDGER.jsonl";
const DELTA="runtime_state/TRILLIONX_DELTA_SIGNATURES.json";
const HEALTH="data/TRILLIONX_ROUTE_HEALTH_MATRIX_LATEST.json";
const DECISION="data/TRILLIONX_SMART_DECISION_LATEST.json";

const MAX_ROUTE_TEST=Number(process.argv[2]||40);
const TIMEOUT_MS=Number(process.argv[3]||1200);

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const now=()=>new Date().toISOString();

function title(s){console.log("\n"+"═".repeat(72));console.log(" "+s);console.log("═".repeat(72))}
function kv(k,v,u=""){console.log(String(k).padEnd(30," ")+": "+String(v)+(u?" "+u:""))}

function loadJSON(p,fallback=null){
  try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return fallback}
}

function saveJSON(p,obj){
  fs.writeFileSync(p,JSON.stringify(obj,null,2));
}

function host(){
  const cpus=os.cpus()||[];
  const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
  return {
    time:now(),
    hostname:os.hostname(),
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    cpu_model:cpus[0]?.model||"unknown",
    logical_cpu:cpus.length,
    ghz:r((speeds.reduce((a,b)=>a+b,0)/(speeds.length||1))/1000),
    ram_total_gb:r(os.totalmem()/1073741824),
    ram_free_gb:r(os.freemem()/1073741824),
    load:os.loadavg().map(r),
    uptime_s:r(os.uptime())
  };
}

function procMem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_used_mb:r(m.heapUsed/1048576),
    heap_total_mb:r(m.heapTotal/1048576),
    external_mb:r(m.external/1048576),
    array_buffers_mb:r((m.arrayBuffers||0)/1048576)
  };
}

function compactFromVector(memory){
  const entries=Array.isArray(memory.entries)?memory.entries:[];
  const shards={
    repo:{count:0,files:[],tokens:0,bytes:0},
    routes:{count:0,top:[]},
    apis:{count:0,top:[]},
    websocket:{count:0,top:[]},
    modules:{count:0,top:[]},
    codecs:{},
    networks:{},
    registries:{},
    ports:memory.global?.open_ports||[],
    targets:memory.targets||[]
  };

  const routeMap=new Map(), apiMap=new Map(), wsMap=new Map(), modMap=new Map();

  for(const e of entries){
    shards.repo.count++;
    shards.repo.tokens+=e.tokens||0;
    shards.repo.bytes+=e.size||0;
    if(shards.repo.files.length<300){
      shards.repo.files.push({
        file:e.file,
        ext:e.ext,
        size:e.size,
        hash:e.hash,
        tokens:e.tokens,
        tags:[...(e.codecs||[]),...(e.networks||[]),...(e.registries||[])].slice(0,18)
      });
    }

    for(const x of e.routes||[]){
      const k=(x.method||"GET")+" "+x.route;
      routeMap.set(k,(routeMap.get(k)||0)+1);
    }
    for(const x of e.apis||[]) apiMap.set(x,(apiMap.get(x)||0)+1);
    for(const x of e.ws||[]) wsMap.set(x,(wsMap.get(x)||0)+1);
    for(const x of [...(e.requires||[]),...(e.imports||[])]) modMap.set(x,(modMap.get(x)||0)+1);

    for(const x of e.codecs||[]) shards.codecs[x]=(shards.codecs[x]||0)+1;
    for(const x of e.networks||[]) shards.networks[x]=(shards.networks[x]||0)+1;
    for(const x of e.registries||[]) shards.registries[x]=(shards.registries[x]||0)+1;
  }

  const top=(m,n)=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([key,count])=>({key,count}));
  shards.routes.count=routeMap.size; shards.routes.top=top(routeMap,200);
  shards.apis.count=apiMap.size; shards.apis.top=top(apiMap,200);
  shards.websocket.count=wsMap.size; shards.websocket.top=top(wsMap,100);
  shards.modules.count=modMap.size; shards.modules.top=top(modMap,100);

  return {
    engine:"TRILLIONX_VECTOR_COMPACT_SHARDED_MEMORY",
    version:"V1",
    created_at:now(),
    source:SRC,
    source_hash:sha(JSON.stringify(memory.global||{})),
    host:host(),
    vector_policy:{
      compact:true,
      stores_full_vectors:false,
      shards:["repo","routes","apis","websocket","modules","codecs","networks","registries","ports","targets"],
      objective:"reduce RAM and accelerate decision routing"
    },
    global:memory.global||{},
    shards
  };
}

function fileSignatures(compact){
  const sig={};
  for(const f of compact.shards.repo.files){
    sig[f.file]={hash:f.hash,size:f.size,tokens:f.tokens};
  }
  return sig;
}

function deltaReport(newSig){
  const old=loadJSON(DELTA,{});
  let added=0,changed=0,removed=0,same=0;
  for(const [f,s] of Object.entries(newSig)){
    if(!old[f]) added++;
    else if(old[f].hash!==s.hash || old[f].size!==s.size) changed++;
    else same++;
  }
  for(const f of Object.keys(old)){
    if(!newSig[f]) removed++;
  }
  saveJSON(DELTA,newSig);
  return {added,changed,removed,same,total:Object.keys(newSig).length};
}

function appendLedger(type,payload){
  let prev="GENESIS";
  try{
    const lines=fs.readFileSync(LEDGER,"utf8").trim().split(/\n/).filter(Boolean);
    if(lines.length) prev=JSON.parse(lines[lines.length-1]).hash;
  }catch{}
  const record={
    ts:now(),
    type,
    prev,
    payload_hash:sha(payload),
    payload_summary:payload.summary||payload.global||payload.verdict||null
  };
  record.hash=sha(record);
  fs.appendFileSync(LEDGER,JSON.stringify(record)+"\n");
  return record;
}

function tcpProbe(port){
  return new Promise(resolve=>{
    const t0=performance.now();
    const s=net.createConnection({host:"127.0.0.1",port});
    let done=false;
    const finish=o=>{
      if(done)return; done=true;
      try{s.destroy()}catch{}
      resolve({...o,port,ms:r(performance.now()-t0)});
    };
    s.setTimeout(TIMEOUT_MS);
    s.on("connect",()=>finish({state:"OK"}));
    s.on("timeout",()=>finish({state:"SLOW_TIMEOUT"}));
    s.on("error",e=>finish({state:"FAIL",error:e.code||e.message}));
  });
}

function httpProbe(url){
  return new Promise(resolve=>{
    const t0=performance.now();
    const lib=url.startsWith("https:")?https:http;
    const req=lib.get(url,{timeout:TIMEOUT_MS,headers:{"User-Agent":"TRILLIONX-health/1.0"}},res=>{
      let bytes=0;
      res.on("data",d=>{bytes+=d.length;if(bytes>4096)req.destroy()});
      res.on("end",()=>resolve({
        url,
        state:res.statusCode>=200&&res.statusCode<400?"OK":"HTTP_"+res.statusCode,
        status:res.statusCode,
        bytes,
        ms:r(performance.now()-t0)
      }));
    });
    req.on("timeout",()=>{req.destroy();resolve({url,state:"SLOW_TIMEOUT",ms:r(performance.now()-t0)})});
    req.on("error",e=>resolve({url,state:"FAIL",error:e.code||e.message,ms:r(performance.now()-t0)}));
  });
}

async function buildHealth(compact){
  const ports=[...new Set(compact.shards.ports||[])].slice(0,80);
  const portHealth=[];
  for(const p of ports) portHealth.push(await tcpProbe(p));

  const targets=(compact.shards.targets||[]).map(x=>x.url).filter(Boolean).slice(0,MAX_ROUTE_TEST);
  const targetHealth=[];
  for(const u of targets) targetHealth.push(await httpProbe(u));

  const okPorts=portHealth.filter(x=>x.state==="OK").length;
  const okTargets=targetHealth.filter(x=>x.state==="OK").length;
  const slow=portHealth.concat(targetHealth).filter(x=>String(x.state).includes("SLOW")).length;
  const fail=portHealth.concat(targetHealth).filter(x=>x.state==="FAIL").length;

  const matrix={
    engine:"TRILLIONX_ROUTE_HEALTH_MATRIX",
    ts:now(),
    timeout_ms:TIMEOUT_MS,
    ports:portHealth,
    targets:targetHealth,
    summary:{
      ports_tested:ports.length,
      ports_ok:okPorts,
      targets_tested:targets.length,
      targets_ok:okTargets,
      slow,
      fail,
      health_score:Math.max(0,Math.min(100,100-fail*5-slow*2))
    }
  };
  saveJSON(HEALTH,matrix);
  return matrix;
}

function smartDecision(compact,health,delta,memBefore,memAfter){
  const g=compact.global||{};
  const rss=memAfter.rss_mb;
  const open=health.summary.ports_ok;
  const targetOk=health.summary.targets_ok;
  const changed=delta.added+delta.changed+delta.removed;

  const recommendations=[];
  const actions=[];

  if(rss>700) recommendations.push("ENABLE_COMPACT_ONLY_MODE");
  if(rss>900) recommendations.push("BLOCK_FULL_VECTOR_LOAD_NEXT_RUN");
  if(changed===0) recommendations.push("USE_DELTA_SKIP_RESCAN");
  if(changed>0) recommendations.push("RESCAN_CHANGED_SHARDS_ONLY");
  if(open>0) actions.push("USE_LOCAL_API_FIRST");
  if(targetOk>0) actions.push("INTERNET_TARGETS_AVAILABLE");
  if((g.routes||0)>10000) recommendations.push("ROUTE_INDEX_SHARDING_REQUIRED");
  if((g.apis||0)>50000) recommendations.push("API_STRING_DEDUP_REQUIRED");
  if((g.ws_events||0)>100) actions.push("WEBSOCKET_RUNTIME_PRESENT");

  const intelligence_score=Math.max(0,Math.min(100,
    40 +
    Math.min(20,(g.routes||0)/2000) +
    Math.min(15,(g.apis||0)/10000) +
    Math.min(10,(g.ws_events||0)/100) +
    Math.min(10,targetOk*2) +
    Math.min(5,open)
  ));

  const integrity_score=Math.max(0,Math.min(100,
    70 +
    (compact.source_hash?10:0) +
    (health.summary.health_score>80?10:0) +
    (changed>=0?10:0)
  ));

  const performance_score=Math.max(0,Math.min(100,
    100 -
    Math.max(0,rss-500)/20 -
    Math.max(0,(os.loadavg()[0]||0)-4)*5
  ));

  return {
    engine:"TRILLIONX_SMART_DECISION_ENGINE",
    ts:now(),
    scores:{
      performance:r(performance_score),
      integrity:r(integrity_score),
      intelligence:r(intelligence_score),
      global:r((performance_score+integrity_score+intelligence_score)/3)
    },
    state:{
      rss_before_mb:memBefore.rss_mb,
      rss_after_mb:rss,
      delta,
      ports_ok:open,
      targets_ok:targetOk,
      routes:g.routes||0,
      apis:g.apis||0,
      ws_events:g.ws_events||0,
      modules:g.modules||0
    },
    actions,
    recommendations,
    safe_only:true,
    verdict:
      performance_score>75 && integrity_score>85 && intelligence_score>75
      ? "TRILLIONX_PERF_INTEGRITY_INTELLIGENCE_READY"
      : "TRILLIONX_READY_WITH_OPTIMIZATION_REQUIRED"
  };
}

(async()=>{
  const t0=performance.now();
  title("TRILLIONX PERF + INTEGRITY + INTELLIGENCE CORE");

  const memBefore=procMem();
  const memory=loadJSON(SRC);
  if(!memory){
    console.error("Missing source:",SRC);
    process.exit(1);
  }

  title("COMPACT SHARDED VECTOR MEMORY");
  const compact=compactFromVector(memory);
  saveJSON(COMPACT,compact);

  kv("Files compacted",compact.shards.repo.count);
  kv("Routes unique",compact.shards.routes.count);
  kv("APIs unique",compact.shards.apis.count);
  kv("WS unique",compact.shards.websocket.count);
  kv("Modules unique",compact.shards.modules.count);
  kv("Compact file",COMPACT);

  title("DELTA SCAN");
  const sig=fileSignatures(compact);
  const delta=deltaReport(sig);
  kv("Added",delta.added);
  kv("Changed",delta.changed);
  kv("Removed",delta.removed);
  kv("Same",delta.same);

  title("ROUTE HEALTH MATRIX");
  const health=await buildHealth(compact);
  kv("Ports OK",health.summary.ports_ok+"/"+health.summary.ports_tested);
  kv("Targets OK",health.summary.targets_ok+"/"+health.summary.targets_tested);
  kv("Slow",health.summary.slow);
  kv("Fail",health.summary.fail);
  kv("Health score",health.summary.health_score);

  title("INTEGRITY LEDGER");
  const led1=appendLedger("COMPACT_VECTOR_MEMORY",compact);
  const led2=appendLedger("ROUTE_HEALTH_MATRIX",health);
  kv("Ledger compact hash",led1.hash);
  kv("Ledger health hash",led2.hash);

  title("SMART DECISION");
  const memAfter=procMem();
  const decision=smartDecision(compact,health,delta,memBefore,memAfter);
  saveJSON(DECISION,decision);
  const led3=appendLedger("SMART_DECISION",decision);

  kv("Performance",decision.scores.performance);
  kv("Integrity",decision.scores.integrity);
  kv("Intelligence",decision.scores.intelligence);
  kv("Global",decision.scores.global);
  kv("Actions",decision.actions.join(", ")||"none");
  kv("Recommendations",decision.recommendations.join(", ")||"none");
  kv("Verdict",decision.verdict);
  kv("Ledger decision hash",led3.hash);
  kv("Runtime ms",r(performance.now()-t0));

  title("FILES");
  kv("Compact",COMPACT);
  kv("Health",HEALTH);
  kv("Decision",DECISION);
  kv("Ledger",LEDGER);
})();
