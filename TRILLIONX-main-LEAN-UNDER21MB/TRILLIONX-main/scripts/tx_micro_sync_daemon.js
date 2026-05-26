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
