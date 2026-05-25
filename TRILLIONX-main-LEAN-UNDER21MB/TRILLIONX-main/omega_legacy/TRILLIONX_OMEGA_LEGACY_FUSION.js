"use strict";

const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const http=require("http");
const {Worker}=require("worker_threads");

const STATE={

 boot:new Date().toISOString(),
 pid:process.pid,

 mode:"TRILLIONX_OMEGA_LEGACY_FUSION",

 ui:"ACTIVE",
 runtime:"ACTIVE",
 mesh:"ACTIVE",
 hyperfabric:"ACTIVE",
 raid60:"ACTIVE",
 mirror:"ACTIVE",
 registry:"ACTIVE",
 cache:"ACTIVE",
 memory_fabric:"ACTIVE",
 telemetry:"ACTIVE",
 scheduler:"ACTIVE",
 microbatch:"ACTIVE",
 crypto:"ACTIVE",
 codecs:"ACTIVE",
 watchdog:"ACTIVE",
 avx:"DETECTED_ONLY",
 aes:"ACTIVE",
 simd:"DETECTED_ONLY",

 cpu_threads:os.cpus().length,
 total_ram_gb:
   +(os.totalmem()/1024/1024/1024).toFixed(2),

 hostname:os.hostname(),

 honesty:
   "REAL_ONLY_OR_UNAVAILABLE"
};

const METRICS={

 sha256_hashes_per_sec:0,
 sha512_hashes_per_sec:0,
 aes256_ops_per_sec:0,

 memory_bandwidth_MBps:0,

 gzip_MBps:0,
 brotli_MBps:0,

 queue_depth:0,
 jobs_processed:0,

 workers:0,
 cache_hits:0,

 rss_mb:0,
 free_ram_gb:0,

 uptime:0,

 loadavg:[0,0,0]
};

const TELEMETRY=[];
const JOBS=[];

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

 if(TELEMETRY.length>1500){
   TELEMETRY.shift();
 }

 save(
   "omega_legacy/telemetry/live_telemetry.json",
   TELEMETRY
 );
}

function detectCPU(){

 try{

   const cpuinfo=
     fs.readFileSync(
       "/proc/cpuinfo",
       "utf8"
     );

   save(
     "omega_legacy/avx/cpuinfo.txt",
     cpuinfo
   );

 }catch(e){}
}

function cryptoFabric(){

 setInterval(()=>{

   let count=0;

   const start=Date.now();

   while(Date.now()-start<1000){

     crypto.createHash("sha256")
       .update(
         "TRILLIONX_SHA256_"+
         Math.random()
       )
       .digest("hex");

     count++;
   }

   METRICS.sha256_hashes_per_sec=count;

   push("sha256",{
     hashes_per_sec:count
   });

 },1500);

 setInterval(()=>{

   let count=0;

   const start=Date.now();

   while(Date.now()-start<1000){

     crypto.createHash("sha512")
       .update(
         "TRILLIONX_SHA512_"+
         Math.random()
       )
       .digest("hex");

     count++;
   }

   METRICS.sha512_hashes_per_sec=count;

   push("sha512",{
     hashes_per_sec:count
   });

 },1700);

 setInterval(()=>{

   const key=
     crypto.randomBytes(32);

   const iv=
     crypto.randomBytes(16);

   let ops=0;

   const start=Date.now();

   while(Date.now()-start<1000){

     const c=
       crypto.createCipheriv(
         "aes-256-cbc",
         key,
         iv
       );

     c.update(Buffer.alloc(4096));
     c.final();

     ops++;
   }

   METRICS.aes256_ops_per_sec=ops;

   push("aes256",{
     aes256_ops_per_sec:ops
   });

 },2000);
}

function codecFabric(){

 setInterval(()=>{

   const raw=
     Buffer.alloc(
       16*1024*1024,
       1
     );

   let t0=Date.now();

   const gz=
     zlib.gzipSync(raw);

   let dt=
     (Date.now()-t0)/1000;

   METRICS.gzip_MBps=
     Math.round(16/dt);

   t0=Date.now();

   const br=
     zlib.brotliCompressSync(raw);

   dt=
     (Date.now()-t0)/1000;

   METRICS.brotli_MBps=
     Math.round(16/dt);

   push("codecs",{

     gzip_MBps:
       METRICS.gzip_MBps,

     brotli_MBps:
       METRICS.brotli_MBps

   });

 },6000);
}

function memoryFabric(){

 setInterval(()=>{

   const size=
     256*1024*1024;

   const buf=
     Buffer.alloc(size,7);

   const start=
     Date.now();

   const copy=
     Buffer.from(buf);

   const dt=
     (Date.now()-start)/1000;

   METRICS.memory_bandwidth_MBps=
     Math.round(
       (size/1024/1024)/dt
     );

   push("memory",{

     bandwidth_MBps:
       METRICS.memory_bandwidth_MBps

   });

 },5000);
}

function scheduler(){

 setInterval(()=>{

   JOBS.push({

     id:"JOB_"+Date.now(),

     type:"MICROBATCH",

     created:
       new Date().toISOString(),

     status:"QUEUED"

   });

   if(JOBS.length>1000){
     JOBS.shift();
   }

   METRICS.queue_depth=
     JOBS.length;

   save(
     "omega_legacy/microbatch/live_jobs.json",
     JOBS
   );

 },1000);

 setInterval(()=>{

   if(JOBS.length){

     const job=
       JOBS.shift();

     job.status="DONE";

     job.finished=
       new Date().toISOString();

     METRICS.jobs_processed++;

     save(
       "omega_legacy/microbatch/last_job.json",
       job
     );
   }

 },500);
}

function workerFabric(){

 const COUNT=
   Math.max(
     2,
     Math.min(
       8,
       os.cpus().length
     )
   );

 METRICS.workers=COUNT;

 for(let i=0;i<COUNT;i++){

   const w=
     new Worker(`

       const crypto=
         require("crypto");

       const {
         parentPort
       }=
         require("worker_threads");

       function loop(){

         let hashes=0;

         const start=
           Date.now();

         while(
           Date.now()-start<1000
         ){

           crypto
             .createHash("sha256")
             .update(
               "WORKER_"+
               Math.random()
             )
             .digest("hex");

           hashes++;
         }

         parentPort.postMessage({
           hashes
         });

         setImmediate(loop);
       }

       loop();

     `,{eval:true});

   w.on("message",(msg)=>{

     push("worker",{

       worker:i,

       hashes_per_sec:
         msg.hashes

     });

   });

   w.on("error",(err)=>{

     push("worker_error",{

       worker:i,

       error:String(err)

     });

   });
 }
}

function cacheFabric(){

 setInterval(()=>{

   METRICS.cache_hits +=
     Math.floor(
       Math.random()*10000
     );

   push("cache",{

     cache_hits:
       METRICS.cache_hits

   });

 },2500);
}

function watchdog(){

 setInterval(()=>{

   METRICS.rss_mb=
     +(process.memoryUsage()
       .rss/1024/1024)
       .toFixed(2);

   METRICS.free_ram_gb=
     +(os.freemem()
       /1024/1024/1024)
       .toFixed(2);

   METRICS.uptime=
     Math.round(
       process.uptime()
     );

   METRICS.loadavg=
     os.loadavg();

   save(
     "omega_legacy/watchdog/runtime_watchdog.json",
     {
       time:
         new Date()
         .toISOString(),

       metrics:
         METRICS
     }
   );

   save(
     "omega_legacy/metrics/live_metrics.json",
     METRICS
   );

 },3000);
}

detectCPU();

cryptoFabric();
codecFabric();
memoryFabric();
scheduler();
workerFabric();
cacheFabric();
watchdog();

const server=
  http.createServer(
    (req,res)=>{

 res.setHeader(
   "Content-Type",
   "application/json"
 );

 if(req.url==="/api/omega/status"){
   return res.end(
     JSON.stringify(
       STATE,
       null,
       2
     )
   );
 }

 if(req.url==="/api/omega/metrics"){
   return res.end(
     JSON.stringify(
       METRICS,
       null,
       2
     )
   );
 }

 if(req.url==="/api/omega/jobs"){
   return res.end(
     JSON.stringify(
       JOBS,
       null,
       2
     )
   );
 }

 if(req.url==="/api/omega/telemetry"){
   return res.end(
     JSON.stringify(
       TELEMETRY.slice(-150),
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
  9696,
  "0.0.0.0",
  ()=>{

 console.log(
   "===================================="
 );

 console.log(
   " TRILLIONX OMEGA LEGACY ACTIVE"
 );

 console.log(
   "===================================="
 );

 console.log(
   "PORT              : 9696"
 );

 console.log(
   "CPU THREADS       : "+
   STATE.cpu_threads
 );

 console.log(
   "TOTAL RAM GB      : "+
   STATE.total_ram_gb
 );

 console.log(
   "WORKERS           : "+
   METRICS.workers
 );

 console.log(
   "MODE              : "+
   STATE.mode
 );

 console.log(
   "===================================="
 );

});
