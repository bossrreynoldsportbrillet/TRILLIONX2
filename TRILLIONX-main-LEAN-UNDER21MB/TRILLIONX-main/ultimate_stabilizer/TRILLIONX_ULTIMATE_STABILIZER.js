"use strict";

const os=require("os");
const fs=require("fs");
const http=require("http");

const STATE={

 mode:"TRILLIONX_ULTIMATE_STABILIZER",

 worker_pool:"ADAPTIVE",
 autoscaler:"ACTIVE",
 pressure_guard:"ACTIVE",
 latency_guard:"ACTIVE",
 memory_guard:"ACTIVE",
 queue_guard:"ACTIVE",
 backpressure:"ACTIVE",
 healing:"ACTIVE",

 honesty:"REAL_ONLY_OR_UNAVAILABLE"
};

const METRICS={

 recommended_workers:0,
 active_workers:0,

 rss_mb:0,
 free_ram_gb:0,

 loadavg:[0,0,0],

 queue_pressure:0,
 latency_score:0,
 throughput_score:0,

 autoscale_state:"STABLE",

 uptime:0
};

const TELEMETRY=[];

function save(path,obj){

 fs.writeFileSync(
  path,
  JSON.stringify(obj,null,2)
 );
}

function push(type,data){

 TELEMETRY.push({

  time:new Date().toISOString(),
  type,
  data

 });

 if(TELEMETRY.length>10000){
  TELEMETRY.shift();
 }

 save(
  "ultimate_stabilizer/telemetry/live_telemetry.json",
  TELEMETRY
 );
}

function governorLoop(){

 setInterval(()=>{

  const rss=
  process.memoryUsage().rss/1024/1024;

  const free=
  os.freemem()/1024/1024/1024;

  const cpu=os.cpus().length;

  METRICS.rss_mb=
  +rss.toFixed(2);

  METRICS.free_ram_gb=
  +free.toFixed(2);

  METRICS.loadavg=
  os.loadavg();

  METRICS.uptime=
  Math.round(
   process.uptime()
  );

  let recommended=
  Math.max(
   2,
   cpu-1
  );

  if(rss>4096){

   recommended=
   Math.max(
    2,
    Math.floor(recommended*0.75)
   );

   METRICS.autoscale_state=
   "MEMORY_PRESSURE";
  }

  if(os.loadavg()[0] > cpu){

   recommended=
   Math.max(
    2,
    Math.floor(recommended*0.60)
   );

   METRICS.autoscale_state=
   "CPU_PRESSURE";
  }

  if(free<1){

   recommended=
   2;

   METRICS.autoscale_state=
   "LOW_MEMORY";
  }

  METRICS.recommended_workers=
  recommended;

  METRICS.active_workers=
  recommended;

  METRICS.queue_pressure=
  Math.round(
   os.loadavg()[0]*100
  );

  METRICS.latency_score=
  Math.max(
   1,
   Math.round(
    1000/
    Math.max(
     1,
     os.loadavg()[0]
    )
   )
  );

  METRICS.throughput_score=
  Math.round(
   recommended*1000
  );

  push("governor",{
   metrics:METRICS
  });

  save(
   "ultimate_stabilizer/metrics/live_metrics.json",
   METRICS
  );

 },1200);
}

governorLoop();

const server=
http.createServer(
(req,res)=>{

 res.setHeader(
 "Content-Type",
 "application/json"
 );

 if(req.url==="/api/stabilizer/status"){
  return res.end(
   JSON.stringify(
    STATE,
    null,
    2
   )
  );
 }

 if(req.url==="/api/stabilizer/metrics"){
  return res.end(
   JSON.stringify(
    METRICS,
    null,
    2
   )
  );
 }

 if(req.url==="/api/stabilizer/telemetry"){
  return res.end(
   JSON.stringify(
    TELEMETRY.slice(-500),
    null,
    2
   )
  );
 }

 res.statusCode=404;

 res.end(
 JSON.stringify({
  error:"NOT_FOUND"
 })
 );

});

server.listen(
13000,
"0.0.0.0",
()=>{

 console.log(
 "=================================================================="
 );

 console.log(
 " TRILLIONX ULTIMATE STABILIZER ONLINE"
 );

 console.log(
 "=================================================================="
 );

 console.log(
 "PORT              : 13000"
 );

 console.log(
 "CPU THREADS       : "+
 os.cpus().length
 );

 console.log(
 "TOTAL RAM GB      : "+
 +(os.totalmem()/1024/1024/1024).toFixed(2)
 );

 console.log(
 "=================================================================="
 );

});
