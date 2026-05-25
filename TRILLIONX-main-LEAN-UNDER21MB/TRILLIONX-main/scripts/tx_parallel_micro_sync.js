"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),net=require("net"),crypto=require("crypto"),cp=require("child_process");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance}=require("perf_hooks");

const WORKERS=+process.env.TX_MICRO_SYNC_WORKERS||4;
const INTERVAL=+process.env.TX_MICRO_SYNC_MS||250;
const MAX=+process.env.TX_MICRO_SYNC_MAX||0;
const PORTS=(process.env.TX_MICRO_SYNC_PORTS||"3000,3997,9229,20000,20001,20002,20003").split(",").map(Number).filter(Boolean);
const DIR="micro_sync", LOG="logs/tx_parallel_micro_sync.log", LATEST="reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json";
for(const d of [DIR,"logs","reports","history","runtime_state"])fs.mkdirSync(d,{recursive:true});
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:700}).trim()}catch{return""}};

function disk(){const o=sh("df -P . | tail -1").split(/\s+/),p=parseFloat((o[4]||"0").replace("%",""))||0;return{used_pct:r(p),free_pct:r(100-p),mount:o[5]||"."}}
function cpu(){const c=os.cpus()||[],sp=c.map(x=>x.speed||0).filter(Boolean),l=os.loadavg();return{model:c[0]?.model||"unknown",logical:c.length,ghz:r((sp.reduce((a,b)=>a+b,0)/(sp.length||1))/1000),load1:r(l[0]),load_pct:r(Math.min(100,(l[0]/(c.length||1))*100))}}
function mem(){const m=process.memoryUsage();return{rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),free_gb:r(os.freemem()/1073741824),total_gb:r(os.totalmem()/1073741824)}}
function tcp(port,timeout=130){return new Promise(res=>{const t0=performance.now(),s=net.createConnection({host:"127.0.0.1",port});let done=false;const fin=o=>{if(done)return;done=true;try{s.destroy()}catch{}res({port,ms:r(performance.now()-t0),...o})};s.setTimeout(timeout);s.on("connect",()=>fin({open:true}));s.on("timeout",()=>fin({open:false,error:"TIMEOUT"}));s.on("error",e=>fin({open:false,error:e.code||e.message}))})}
function ping(port=3000,timeout=180){return new Promise(res=>{const t0=performance.now();const req=http.get({host:"127.0.0.1",port,path:"/",timeout},rr=>{let b=0;rr.on("data",d=>b+=d.length);rr.on("end",()=>res({ok:rr.statusCode<500,status:rr.statusCode,bytes:b,ms:r(performance.now()-t0)}))});req.on("timeout",()=>{req.destroy();res({ok:false,error:"TIMEOUT",ms:r(performance.now()-t0)})});req.on("error",e=>res({ok:false,error:e.code||e.message,ms:r(performance.now()-t0)}))})}

if(!isMainThread){
  let seq=0;
  async function tick(){
    const t0=performance.now(), ports=[];
    const slice=PORTS.filter((_,i)=>i%workerData.total===workerData.idx);
    for(const p of slice)ports.push(await tcp(p));
    const pkt={worker:workerData.idx,seq:++seq,ts:new Date().toISOString(),ports,app3000:workerData.idx===0?await ping(3000):null,latency_ms:r(performance.now()-t0),seal:null};
    pkt.seal=sha(pkt);
    parentPort.postMessage(pkt);
  }
  setInterval(()=>tick().catch(e=>parentPort.postMessage({worker:workerData.idx,error:e.message})),INTERVAL);
  tick();
} else {
  let globalSeq=0, prev="GENESIS", latestByWorker={}, started=Date.now();
  const workers=[];
  for(let i=0;i<WORKERS;i++){
    const w=new Worker(__filename,{workerData:{idx:i,total:WORKERS}});
    w.on("message",msg=>{
      latestByWorker[msg.worker]=msg;
      const merged={
        engine:"TRILLIONX_PARALLEL_MICRO_PACKET_SYNC_PRIORITY",
        seq:++globalSeq,
        ts:new Date().toISOString(),
        prev,
        workers:WORKERS,
        interval_ms:INTERVAL,
        uptime_s:r((Date.now()-started)/1000),
        cpu:cpu(),
        memory:mem(),
        disk:disk(),
        packets:Object.values(latestByWorker),
        policy:"PARALLEL_ASYNC_MICRO_PACKET_PRIORITY_SAFE"
      };
      merged.open_ports=[...new Set(merged.packets.flatMap(x=>(x.ports||[]).filter(p=>p.open).map(p=>p.port)))];
      merged.latency_avg_ms=r(merged.packets.reduce((a,b)=>a+(b.latency_ms||0),0)/Math.max(1,merged.packets.length));
      merged.seal=sha(merged); prev=merged.seal;
      fs.writeFileSync(LATEST,JSON.stringify(merged,null,2));
      fs.writeFileSync(`${DIR}/parallel_packet_latest.json`,JSON.stringify(merged,null,2));
      fs.appendFileSync(LOG,`${merged.ts} seq=${merged.seq} w=${WORKERS} lat=${merged.latency_avg_ms}ms cpu=${merged.cpu.load_pct}% ram=${merged.memory.free_gb}GB disk=${merged.disk.used_pct}% open=${merged.open_ports.join(",")} seal=${merged.seal.slice(0,12)}\n`);
      fs.appendFileSync("history/TRILLIONX_PARALLEL_MICRO_SYNC_HISTORY.jsonl",JSON.stringify({ts:merged.ts,seq:merged.seq,workers:WORKERS,latency_avg_ms:merged.latency_avg_ms,cpu_pct:merged.cpu.load_pct,ram_free_gb:merged.memory.free_gb,disk_pct:merged.disk.used_pct,open_ports:merged.open_ports,seal:merged.seal})+"\n");
      if(MAX>0 && globalSeq>=MAX)process.exit(0);
    });
    workers.push(w);
  }
  console.log(JSON.stringify({engine:"TRILLIONX_PARALLEL_MICRO_SYNC",status:"RUNNING",workers:WORKERS,interval_ms:INTERVAL,ports:PORTS},null,2));
}
