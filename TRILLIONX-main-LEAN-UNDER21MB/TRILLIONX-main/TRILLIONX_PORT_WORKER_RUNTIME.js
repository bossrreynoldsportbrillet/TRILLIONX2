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
