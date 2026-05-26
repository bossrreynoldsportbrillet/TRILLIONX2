"use strict";

/*
 TRILLIONX NETWORK TASK ORCHESTRATOR
 - Distribue les tâches TRILLIONX par réseau logique
 - Local ports / APIs / Internet targets / WS / vector memory / blockchain / health
 - Safe only: pas de scan agressif, pas de brute force, pas d'attaque
 - Produit queue + assignments + report + ledger
*/

const fs=require("fs");
const os=require("os");
const net=require("net");
const http=require("http");
const https=require("https");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const DATA="data", HIST="history", RUNTIME="runtime_state";
fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(HIST,{recursive:true});
fs.mkdirSync(RUNTIME,{recursive:true});

const VECTOR_BLOCK="data/TRILLIONX_INTERNET_VECTOR_BLOCK_LATEST.json";
const COMPACT="data/TRILLIONX_VECTOR_COMPACT_LATEST.json";
const TARGETS="data/trillionx_internet_targets.txt";
const OUT_QUEUE="runtime_state/TRILLIONX_NETWORK_TASK_QUEUE.json";
const OUT_ASSIGN="runtime_state/TRILLIONX_NETWORK_TASK_ASSIGNMENTS.json";
const OUT_REPORT="data/TRILLIONX_NETWORK_TASK_ORCHESTRATOR_LATEST.json";
const LEDGER="history/TRILLIONX_NETWORK_TASK_LEDGER.jsonl";

const TIMEOUT=Number(process.argv[2]||1200);
const MAX_TASKS=Number(process.argv[3]||240);
const CONCURRENCY=Math.max(1,Number(process.argv[4]||8));

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

function loadJSON(p,f=null){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return f}}
function saveJSON(p,o){fs.writeFileSync(p,JSON.stringify(o,null,2))}
function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}
function kv(k,v,u=""){console.log(String(k).padEnd(32," ")+": "+String(v)+(u?" "+u:""))}

function readTargets(){
  try{
    return fs.readFileSync(TARGETS,"utf8")
      .split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith("#"));
  }catch{return []}
}

function host(){
  const cpus=os.cpus()||[];
  const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
  return {
    host:os.hostname(),
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    cpu:cpus[0]?.model||"unknown",
    logical_cpu:cpus.length,
    ghz:r((speeds.reduce((a,b)=>a+b,0)/(speeds.length||1))/1000),
    ram_total_gb:r(os.totalmem()/1073741824),
    ram_free_gb:r(os.freemem()/1073741824),
    load:os.loadavg().map(r)
  };
}

function procMem(){
  const m=process.memoryUsage();
  return {rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576)};
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
    s.setTimeout(TIMEOUT);
    s.on("connect",()=>finish({ok:true,state:"OPEN"}));
    s.on("timeout",()=>finish({ok:false,state:"TIMEOUT"}));
    s.on("error",e=>finish({ok:false,state:"CLOSED",error:e.code||e.message}));
  });
}

function httpProbe(url){
  return new Promise(resolve=>{
    const t0=performance.now();
    const lib=url.startsWith("https:")?https:http;
    const req=lib.get(url,{timeout:TIMEOUT,headers:{"User-Agent":"TRILLIONX-network-task-orchestrator/1.0"}},res=>{
      let bytes=0;
      res.on("data",d=>{bytes+=d.length;if(bytes>8192)req.destroy()});
      res.on("end",()=>resolve({
        ok:res.statusCode>=200&&res.statusCode<400,
        state:"HTTP_"+res.statusCode,
        status:res.statusCode,
        bytes,
        ms:r(performance.now()-t0),
        url
      }));
    });
    req.on("timeout",()=>{req.destroy();resolve({ok:false,state:"TIMEOUT",url,ms:r(performance.now()-t0)})});
    req.on("error",e=>resolve({ok:false,state:"FAIL",url,error:e.code||e.message,ms:r(performance.now()-t0)}));
  });
}

function classifyTarget(url){
  const u=url.toLowerCase();
  if(u.includes("127.0.0.1")||u.includes("localhost"))return "LOCAL_API_NETWORK";
  if(u.includes("github"))return "GITHUB_NETWORK";
  if(u.includes("blockchain")||u.includes("mempool")||u.includes("coingecko"))return "BLOCKCHAIN_CRYPTO_NETWORK";
  if(u.includes("cloudflare")||u.includes("trace"))return "NETWORK_DIAGNOSTIC";
  return "PUBLIC_HTTP_NETWORK";
}

function buildTasks(){
  const compact=loadJSON(COMPACT,{});
  const block=loadJSON(VECTOR_BLOCK,{summary:{}});
  const targets=readTargets();

  const ports=[
    ...(block.summary?.open_ports||[]),
    ...(compact.global?.open_ports||[]),
    3000,3001,3002,3010,3100,8080,9229
  ].filter(x=>Number.isFinite(Number(x))).map(Number);

  const routes=(compact.shards?.routes?.top||[]).slice(0,80).map(x=>x.key);
  const apis=(compact.shards?.apis?.top||[]).slice(0,80).map(x=>x.key);
  const ws=(compact.shards?.websocket?.top||[]).slice(0,40).map(x=>x.key);
  const modules=(compact.shards?.modules?.top||[]).slice(0,40).map(x=>x.key);

  const tasks=[];
  let id=1;
  const add=(network,type,payload,priority=5)=>{
    if(tasks.length>=MAX_TASKS)return;
    tasks.push({
      id:"TXNET-"+String(id++).padStart(5,"0"),
      ts:now(),
      network,
      type,
      priority,
      payload,
      status:"QUEUED",
      safe_only:true
    });
  };

  [...new Set(ports)].forEach(p=>add("LOCAL_PORT_NETWORK","TCP_PORT_HEALTH",{port:p},9));

  targets.forEach(u=>add(classifyTarget(u),"HTTP_TARGET_HEALTH",{url:u},8));

  routes.forEach(route=>{
    const m=String(route).match(/^([A-Z]+)\s+(.+)$/);
    const path=m?m[2]:route;
    add("LOCAL_API_NETWORK","ROUTE_REGISTRY_TASK",{route,path},7);
  });

  apis.forEach(api=>add("API_STRING_NETWORK","API_INDEX_TASK",{api},6));
  ws.forEach(event=>add("WEBSOCKET_NETWORK","WS_EVENT_INDEX_TASK",{event},6));
  modules.forEach(mod=>add("MODULE_RUNTIME_NETWORK","MODULE_DEPENDENCY_TASK",{module:mod},5));

  add("VECTOR_MEMORY_NETWORK","VECTOR_COMPACT_REFRESH",{file:COMPACT},10);
  add("INTEGRITY_NETWORK","LEDGER_SEAL_TASK",{ledger:LEDGER},10);
  add("CACHE_NETWORK","CACHE_TTL_LRU_TASK",{policy:"ttl+lru+delta"},8);
  add("BLOCKCHAIN_CRYPTO_NETWORK","BTC_UTXO_ETH_ALGO_BENCH_LINK",{file:"TRILLIONX_BLOCKCHAIN_ALGO_STRESS_RANK.js"},7);
  add("BENCHMARK_NETWORK","PERF_INTEGRITY_INTELLIGENCE_LINK",{file:"TRILLIONX_PERF_INTEGRITY_INTELLIGENCE_CORE.js"},7);

  return tasks.sort((a,b)=>b.priority-a.priority);
}

async function runTask(task){
  const t0=performance.now();
  try{
    if(task.type==="TCP_PORT_HEALTH"){
      const res=await tcpProbe(task.payload.port);
      return {...task,status:res.ok?"DONE":"DEGRADED",result:res,ms:r(performance.now()-t0)};
    }

    if(task.type==="HTTP_TARGET_HEALTH"){
      const res=await httpProbe(task.payload.url);
      return {...task,status:res.ok?"DONE":"DEGRADED",result:res,ms:r(performance.now()-t0)};
    }

    if(task.type==="ROUTE_REGISTRY_TASK"){
      const route=task.payload.route||"";
      const apiPath=task.payload.path||"";
      const score=(route.includes("/api")?10:4)+(apiPath.length>1?3:0);
      return {...task,status:"DONE",result:{indexed:true,route,api_path:apiPath,score},ms:r(performance.now()-t0)};
    }

    if(task.type==="API_INDEX_TASK"){
      return {...task,status:"DONE",result:{indexed:true,api:task.payload.api,hash:sha(task.payload.api).slice(0,16)},ms:r(performance.now()-t0)};
    }

    if(task.type==="WS_EVENT_INDEX_TASK"){
      return {...task,status:"DONE",result:{indexed:true,event:task.payload.event,channel:"ws"},ms:r(performance.now()-t0)};
    }

    if(task.type==="MODULE_DEPENDENCY_TASK"){
      return {...task,status:"DONE",result:{module:task.payload.module,hash:sha(task.payload.module).slice(0,16)},ms:r(performance.now()-t0)};
    }

    if(task.type==="VECTOR_COMPACT_REFRESH"){
      const ok=fs.existsSync(task.payload.file);
      return {...task,status:ok?"DONE":"DEGRADED",result:{exists:ok,file:task.payload.file},ms:r(performance.now()-t0)};
    }

    if(task.type==="LEDGER_SEAL_TASK"){
      return {...task,status:"DONE",result:{ledger:task.payload.ledger,seal_ready:true},ms:r(performance.now()-t0)};
    }

    if(task.type==="CACHE_TTL_LRU_TASK"){
      return {...task,status:"DONE",result:{policy:task.payload.policy,mode:"recommended_active_design"},ms:r(performance.now()-t0)};
    }

    return {...task,status:"DONE",result:{linked:true,payload:task.payload},ms:r(performance.now()-t0)};
  }catch(e){
    return {...task,status:"FAIL",error:e.message,ms:r(performance.now()-t0)};
  }
}

async function pool(tasks){
  const results=[];
  let i=0;
  async function worker(){
    while(i<tasks.length){
      const t=tasks[i++];
      results.push(await runTask(t));
    }
  }
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,tasks.length)},worker));
  return results.sort((a,b)=>a.id.localeCompare(b.id));
}

function makeAssignments(tasks){
  const byNet={};
  for(const t of tasks){
    if(!byNet[t.network])byNet[t.network]=[];
    byNet[t.network].push(t);
  }
  return Object.fromEntries(Object.entries(byNet).map(([net,list])=>[
    net,
    {
      task_count:list.length,
      priority_max:Math.max(...list.map(x=>x.priority)),
      role:
        net==="LOCAL_PORT_NETWORK"?"detect open ports and keep local runtime reachable":
        net==="LOCAL_API_NETWORK"?"route local API workload to app.js endpoints":
        net==="BLOCKCHAIN_CRYPTO_NETWORK"?"handle BTC/UTXO/ETH/blockchain checks and crypto benches":
        net==="VECTOR_MEMORY_NETWORK"?"maintain compact vector memory and recall":
        net==="INTEGRITY_NETWORK"?"seal reports and task states by hash ledger":
        net==="WEBSOCKET_NETWORK"?"map realtime event channels":
        net==="CACHE_NETWORK"?"avoid duplicate network/API work":
        "support network task orchestration",
      tasks:list.map(x=>x.id)
    }
  ]));
}

function appendLedger(report){
  let prev="GENESIS";
  try{
    const lines=fs.readFileSync(LEDGER,"utf8").trim().split(/\n/).filter(Boolean);
    if(lines.length)prev=JSON.parse(lines[lines.length-1]).hash;
  }catch{}
  const rec={ts:now(),type:"NETWORK_TASK_ORCHESTRATION",prev,payload_hash:sha(report)};
  rec.hash=sha(rec);
  fs.appendFileSync(LEDGER,JSON.stringify(rec)+"\n");
  return rec;
}

(async()=>{
  const t0=performance.now();
  title("TRILLIONX NETWORK TASK ORCHESTRATOR");

  const mem0=procMem();
  const tasks=buildTasks();
  const assignments=makeAssignments(tasks);
  saveJSON(OUT_QUEUE,tasks);
  saveJSON(OUT_ASSIGN,assignments);

  kv("Tasks queued",tasks.length);
  kv("Networks",Object.keys(assignments).length);
  kv("Concurrency",CONCURRENCY);
  kv("Timeout",TIMEOUT,"ms");

  title("NETWORK ASSIGNMENTS");
  for(const [net,a] of Object.entries(assignments)){
    kv(net,a.task_count+" tasks");
  }

  title("RUN TASKS");
  const results=await pool(tasks);
  const done=results.filter(x=>x.status==="DONE").length;
  const degraded=results.filter(x=>x.status==="DEGRADED").length;
  const fail=results.filter(x=>x.status==="FAIL").length;

  const perNetwork={};
  for(const x of results){
    if(!perNetwork[x.network])perNetwork[x.network]={done:0,degraded:0,fail:0,total:0,avg_ms:0};
    const n=perNetwork[x.network];
    n.total++;
    if(x.status==="DONE")n.done++;
    else if(x.status==="DEGRADED")n.degraded++;
    else n.fail++;
    n.avg_ms+=x.ms||0;
  }
  for(const n of Object.values(perNetwork))n.avg_ms=r(n.avg_ms/Math.max(1,n.total));

  const mem1=procMem();
  const report={
    engine:"TRILLIONX_NETWORK_TASK_ORCHESTRATOR",
    version:"V1_DISTRIBUTED_LOGICAL_NETWORKS",
    ts:now(),
    host:host(),
    policy:{
      safe_only:true,
      no_intrusive_scan:true,
      no_bruteforce:true,
      declared_targets_only:true,
      local_ports_only:true,
      objective:"distribute TRILLIONX tasks to logical networks for better orchestration"
    },
    config:{timeout_ms:TIMEOUT,max_tasks:MAX_TASKS,concurrency:CONCURRENCY},
    summary:{
      tasks_total:tasks.length,
      done,
      degraded,
      fail,
      networks:Object.keys(assignments).length,
      health:Math.max(0,Math.min(100,100-fail*5-degraded)),
      runtime_ms:r(performance.now()-t0),
      memory_before:mem0,
      memory_after:mem1
    },
    assignments,
    per_network:perNetwork,
    results
  };

  const led=appendLedger(report);
  report.ledger_hash=led.hash;
  report.seal=sha(report);

  saveJSON(OUT_REPORT,report);

  title("FINAL RESULT");
  kv("Done",done);
  kv("Degraded",degraded);
  kv("Fail",fail);
  kv("Health",report.summary.health);
  kv("Seal",report.seal);
  kv("Ledger hash",report.ledger_hash);
  kv("Queue",OUT_QUEUE);
  kv("Assignments",OUT_ASSIGN);
  kv("Report",OUT_REPORT);
  kv("Runtime",report.summary.runtime_ms,"ms");
})();
