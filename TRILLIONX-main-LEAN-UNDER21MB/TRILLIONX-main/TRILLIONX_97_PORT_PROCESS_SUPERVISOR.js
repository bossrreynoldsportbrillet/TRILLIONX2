"use strict";

/*
 TRILLIONX 97 PORT PROCESS SUPERVISOR
 - Crée un processus contrôlé par port/réseau logique
 - Chaque processus expose /health /task /metrics
 - Safe only : pas de scan agressif, pas de brute force
 - Ne remplace pas app.js ; module séparé
 - Garde 3000 pour app.js : ne tente pas de le voler si déjà occupé
*/

const fs=require("fs");
const os=require("os");
const http=require("http");
const net=require("net");
const path=require("path");
const crypto=require("crypto");
const {fork}=require("child_process");
const {performance}=require("perf_hooks");

const ROOT=process.cwd();
const DATA="data", RUNTIME="runtime_state", HIST="history", LOGS="logs";
for(const d of [DATA,RUNTIME,HIST,LOGS]) fs.mkdirSync(d,{recursive:true});

const ASSIGN="data/TRILLIONX_97_NETWORK_TASK_ASSIGNMENTS_LATEST.json";
const REPORT="data/TRILLIONX_97_PORT_PROCESS_SUPERVISOR_LATEST.json";
const LEDGER="history/TRILLIONX_97_PORT_PROCESS_SUPERVISOR_LEDGER.jsonl";
const WORKER_FILE="TRILLIONX_PORT_WORKER_RUNTIME.js";

const MODE=process.argv[2]||"start";       // start | status | stop | test
const MAX_PROCESSES=Number(process.argv[3]||24); // évite de tuer Codespaces
const BASE_PORT=Number(process.argv[4]||20000);
const HEARTBEAT_MS=3000;
const LAUNCH_DELAY_MS=70;

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

function readJSON(p,f=null){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return f}}
function saveJSON(p,o){fs.writeFileSync(p,JSON.stringify(o,null,2))}
function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}
function kv(k,v){console.log(String(k).padEnd(34," ")+": "+String(v))}

function host(){
 const cpus=os.cpus()||[];
 const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
 return {
  time:now(),
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

function tcpOpen(port,timeout=220){
 return new Promise(resolve=>{
  const t0=performance.now();
  const s=net.createConnection({host:"127.0.0.1",port});
  let done=false;
  const finish=v=>{
   if(done)return; done=true;
   try{s.destroy()}catch{}
   resolve({...v,ms:r(performance.now()-t0)});
  };
  s.setTimeout(timeout);
  s.on("connect",()=>finish({open:true}));
  s.on("timeout",()=>finish({open:false,error:"TIMEOUT"}));
  s.on("error",e=>finish({open:false,error:e.code||e.message}));
 });
}

function appendLedger(type,payload){
 let prev="GENESIS";
 try{
  const lines=fs.readFileSync(LEDGER,"utf8").trim().split(/\n/).filter(Boolean);
  if(lines.length) prev=JSON.parse(lines[lines.length-1]).hash;
 }catch{}
 const rec={ts:now(),type,prev,payload_hash:sha(payload)};
 rec.hash=sha(rec);
 fs.appendFileSync(LEDGER,JSON.stringify(rec)+"\n");
 return rec;
}

function ensureWorker(){
 const code = `
"use strict";
const http=require("http");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const PORT=Number(process.env.TX_PORT);
const NET_ID=process.env.TX_NET_ID||"UNKNOWN_NET";
const ROLE=process.env.TX_ROLE||"UNKNOWN_ROLE";
const TASK=process.env.TX_TASK||"UNKNOWN_TASK";
const PRIORITY=process.env.TX_PRIORITY||"NORMAL";
const START=Date.now();

let hits=0;
let lastHit=null;
let loopTicks=0;
let checksum="GENESIS";

const sha=x=>crypto.createHash("sha256").update(String(x)).digest("hex");
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

setInterval(()=>{
  loopTicks++;
  checksum=sha(checksum+"|"+NET_ID+"|"+PORT+"|"+loopTicks+"|"+Date.now()).slice(0,32);
  if(process.send) process.send({
    type:"heartbeat",
    net_id:NET_ID,
    port:PORT,
    role:ROLE,
    pid:process.pid,
    uptime_s:r((Date.now()-START)/1000),
    hits,
    checksum,
    mem_mb:r(process.memoryUsage().rss/1048576)
  });
}, Number(process.env.TX_HEARTBEAT_MS||3000));

function json(res,code,obj){
  const body=JSON.stringify(obj,null,2);
  res.writeHead(code,{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-trillionx-net-id":NET_ID,
    "x-trillionx-role":ROLE
  });
  res.end(body);
}

const server=http.createServer((req,res)=>{
  hits++; lastHit=new Date().toISOString();
  if(req.url==="/" || req.url==="/health"){
    return json(res,200,{
      ok:true,
      engine:"TRILLIONX_PORT_WORKER_RUNTIME",
      net_id:NET_ID,
      port:PORT,
      role:ROLE,
      task:TASK,
      priority:PRIORITY,
      pid:process.pid,
      uptime_s:r((Date.now()-START)/1000),
      hits,
      checksum,
      policy:"SAFE_ONLY_REAL_OR_UNAVAILABLE"
    });
  }
  if(req.url==="/task"){
    return json(res,200,{net_id:NET_ID,port:PORT,role:ROLE,task:TASK,priority:PRIORITY});
  }
  if(req.url==="/metrics"){
    const m=process.memoryUsage();
    return json(res,200,{
      net_id:NET_ID,
      port:PORT,
      pid:process.pid,
      uptime_s:r((Date.now()-START)/1000),
      hits,
      lastHit,
      rss_mb:r(m.rss/1048576),
      heap_mb:r(m.heapUsed/1048576),
      load:os.loadavg().map(r),
      checksum
    });
  }
  json(res,404,{ok:false,error:"not_found",routes:["/health","/task","/metrics"]});
});

server.on("error",e=>{
  if(process.send) process.send({type:"bind_error",net_id:NET_ID,port:PORT,error:e.code||e.message});
  setTimeout(()=>process.exit(21),300);
});

server.listen(PORT,"0.0.0.0",()=>{
  if(process.send) process.send({type:"listening",net_id:NET_ID,port:PORT,role:ROLE,pid:process.pid});
});
`;
 fs.writeFileSync(WORKER_FILE,code.trim()+"\n");
}

function fallbackAssignments(){
 const baseRoles=[
  "MAIN_APP_SHADOW","DEBUG_ATTACH","HEALTH_API","SYSTEM_API","VECTOR_MEMORY","INTERNET_TARGETS",
  "ROUTE_REGISTRY","WEBSOCKET_EVENTS","CACHE_TTL_LRU","INTEGRITY_LEDGER","BTC_UTXO","ETH_BLOCKS",
  "CRYPTO_AES","CRYPTO_SHA","JSON_API_LOAD","NETWORK_LATENCY","BANDWIDTH_STREAM","WORKER_POOL",
  "WASM_COMPUTE","FIRMWARE_BRIDGE","SAFE_REPAIR","PORT_ROUTER","DASHBOARD","BENCHMARK_CORE"
 ];
 const out=[];
 for(let i=0;i<97;i++){
  out.push({
   network_id:"TRILLIONX_NET_"+String(i+1).padStart(2,"0"),
   port:BASE_PORT+i,
   role:baseRoles[i]||("NETWORK_PROCESS_"+String(i+1).padStart(2,"0")),
   task:"Processus dédié au port réseau logique "+(i+1),
   priority:i<10?"CRITICAL":i<30?"HIGH":i<70?"NORMAL":"SUPPORT"
  });
 }
 return out;
}

function loadAssignments(){
 const j=readJSON(ASSIGN,null);
 let arr=j?.assignments;
 if(!Array.isArray(arr) || !arr.length) arr=fallbackAssignments();

 // Sécurité : port 3000 est gardé par app.js. On crée un shadow si 3000 existe.
 return arr.slice(0,97).map((a,i)=>{
   let port=Number(a.port);
   if(!Number.isFinite(port)||port<1024||port>65535) port=BASE_PORT+i;
   if(port===3000) port=BASE_PORT+i; // ne pas voler app.js
   return {
    network_id:a.network_id||("TRILLIONX_NET_"+String(i+1).padStart(2,"0")),
    port,
    role:a.role||("NETWORK_PROCESS_"+(i+1)),
    task:a.task||"Processus dédié",
    priority:a.priority||"NORMAL"
   };
 });
}

async function statusOnly(assignments){
 const results=[];
 for(const a of assignments){
  const p=await tcpOpen(a.port);
  results.push({...a,open:p.open,probe:p});
 }
 const report={
  engine:"TRILLIONX_97_PORT_PROCESS_SUPERVISOR",
  mode:"status",
  ts:now(),
  host:host(),
  summary:{
   total:results.length,
   open:results.filter(x=>x.open).length,
   closed:results.filter(x=>!x.open).length
  },
  results
 };
 saveJSON(REPORT,report);
 console.log(JSON.stringify(report.summary,null,2));
 return report;
}

async function testHTTP(port,path="/health"){
 return new Promise(resolve=>{
  const t0=performance.now();
  const req=http.get({host:"127.0.0.1",port,path,timeout:500},res=>{
    let body="";
    res.on("data",d=>body+=d.toString());
    res.on("end",()=>resolve({ok:res.statusCode===200,status:res.statusCode,ms:r(performance.now()-t0),sample:body.slice(0,240)}));
  });
  req.on("timeout",()=>{req.destroy();resolve({ok:false,error:"TIMEOUT",ms:r(performance.now()-t0)})});
  req.on("error",e=>resolve({ok:false,error:e.code||e.message,ms:r(performance.now()-t0)}));
 });
}

async function testOnly(assignments){
 const results=[];
 for(const a of assignments){
  const t=await testHTTP(a.port,"/health");
  results.push({...a,test:t});
 }
 const report={
  engine:"TRILLIONX_97_PORT_PROCESS_SUPERVISOR",
  mode:"test",
  ts:now(),
  host:host(),
  summary:{
   total:results.length,
   ok:results.filter(x=>x.test.ok).length,
   fail:results.filter(x=>!x.test.ok).length
  },
  results
 };
 saveJSON(REPORT,report);
 console.log(JSON.stringify(report.summary,null,2));
 return report;
}

function startSupervisor(assignments){
 ensureWorker();

 const selected=assignments.slice(0,MAX_PROCESSES);
 const children=new Map();
 const events=[];
 const heartbeats=new Map();

 function event(e){
  const rec={ts:now(),...e};
  events.push(rec);
  if(events.length>2000) events.shift();
  if(e.type==="heartbeat") heartbeats.set(e.net_id,e);
  if(e.type==="listening") console.log("✓",e.net_id,"port",e.port,e.role,"pid",e.pid);
  if(e.type==="bind_error") console.log("!",e.net_id,"port",e.port,"bind_error",e.error);
 }

 function spawnOne(a){
  const child=fork(path.join(ROOT,WORKER_FILE),[],{
   env:{
    ...process.env,
    TX_PORT:String(a.port),
    TX_NET_ID:a.network_id,
    TX_ROLE:a.role,
    TX_TASK:a.task,
    TX_PRIORITY:a.priority,
    TX_HEARTBEAT_MS:String(HEARTBEAT_MS)
   },
   stdio:["ignore","pipe","pipe","ipc"]
  });

  const log=fs.createWriteStream(path.join(LOGS,`${a.network_id}_${a.port}.log`),{flags:"a"});
  child.stdout.on("data",d=>log.write(d));
  child.stderr.on("data",d=>log.write(d));
  child.on("message",event);
  child.on("exit",(code,signal)=>{
    event({type:"exit",net_id:a.network_id,port:a.port,code,signal});
    children.delete(a.network_id);
    // restart safe seulement si le port n'était pas en conflit
    if(code!==21){
      setTimeout(()=>spawnOne(a),1500);
    }
  });

  children.set(a.network_id,{child,assignment:a,start:Date.now()});
 }

 selected.forEach((a,i)=>setTimeout(()=>spawnOne(a),i*LAUNCH_DELAY_MS));

 const control=http.createServer((req,res)=>{
  const send=o=>{
   res.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
   res.end(JSON.stringify(o,null,2));
  };

  if(req.url==="/"||req.url==="/status"){
   const active=[...children.values()].map(x=>({
    net_id:x.assignment.network_id,
    port:x.assignment.port,
    role:x.assignment.role,
    priority:x.assignment.priority,
    pid:x.child.pid,
    uptime_s:r((Date.now()-x.start)/1000),
    heartbeat:heartbeats.get(x.assignment.network_id)||null
   }));
   return send({
    ok:true,
    engine:"TRILLIONX_97_PORT_PROCESS_SUPERVISOR",
    mode:"running",
    control_port:3997,
    requested_97:true,
    launched:selected.length,
    max_processes:MAX_PROCESSES,
    active:active.length,
    host:host(),
    active_processes:active
   });
  }

  if(req.url==="/events") return send({events});
  if(req.url==="/assignments") return send({assignments:selected});
  send({ok:false,error:"unknown",routes:["/status","/events","/assignments"]});
 });

 control.listen(3997,"0.0.0.0",()=>{
  const report={
   engine:"TRILLIONX_97_PORT_PROCESS_SUPERVISOR",
   mode:"start",
   ts:now(),
   control_port:3997,
   requested_networks:97,
   launched_processes:selected.length,
   max_processes:MAX_PROCESSES,
   base_port:BASE_PORT,
   policy:{
    additive_only:true,
    protect_app_js_port_3000:true,
    safe_only:true,
    real_or_unavailable:true,
    process_per_port:true,
    controlled_limit:"MAX_PROCESSES prevents Codespaces overload"
   },
   assignments:selected,
   host:host()
  };
  report.seal=sha(report);
  const led=appendLedger("PORT_PROCESS_SUPERVISOR_START",report);
  report.ledger_hash=led.hash;
  saveJSON(REPORT,report);

  title("TRILLIONX 97 PORT PROCESS SUPERVISOR RUNNING");
  kv("Control", "http://127.0.0.1:3997/status");
  kv("Requested networks",97);
  kv("Launched now",selected.length);
  kv("Max processes",MAX_PROCESSES);
  kv("Report",REPORT);
  kv("Policy","3000 protected / additive only");
  console.log("\nCtrl+C pour arrêter ce superviseur.\n");
 });
}

(async()=>{
 const assignments=loadAssignments();

 if(MODE==="status"){
  title("TRILLIONX PORT PROCESS STATUS");
  await statusOnly(assignments);
  return;
 }

 if(MODE==="test"){
  title("TRILLIONX PORT PROCESS HTTP TEST");
  await testOnly(assignments);
  return;
 }

 if(MODE==="stop"){
  title("STOP HELP");
  console.log('pkill -f "TRILLIONX_PORT_WORKER_RUNTIME.js"');
  console.log('pkill -f "TRILLIONX_97_PORT_PROCESS_SUPERVISOR.js"');
  return;
 }

 startSupervisor(assignments);
})();
