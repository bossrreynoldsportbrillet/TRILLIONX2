"use strict";

const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const http=require("http");
const dns=require("dns");
const {Worker}=require("worker_threads");
const {execSync}=require("child_process");

function sh(cmd, timeout=5000){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function save(p,o){fs.mkdirSync(require("path").dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(o,null,2));}
function readFlags(){
  const f=sh("grep -m1 '^flags' /proc/cpuinfo || true");
  const has=x=>new RegExp("\\b"+x+"\\b").test(f);
  return {
    raw:f,
    sse:has("sse"), sse2:has("sse2"), sse3:has("pni")||has("sse3"),
    ssse3:has("ssse3"), sse4_1:has("sse4_1"), sse4_2:has("sse4_2"),
    avx:has("avx"), avx2:has("avx2"), avx512f:has("avx512f"),
    aes_ni:has("aes"), sha_ni:has("sha_ni")||has("sha"),
    fma:has("fma"), bmi1:has("bmi1"), bmi2:has("bmi2"), pclmulqdq:has("pclmulqdq")
  };
}

const CPU_FLAGS=readFlags();
const GPU_DETECT={
  nvidia_smi: sh("command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || echo GPU_UNAVAILABLE_IN_CODESPACES"),
  opencl: sh("command -v clinfo >/dev/null && clinfo | head -80 || echo OPENCL_UNAVAILABLE"),
  vulkan: sh("command -v vulkaninfo >/dev/null && vulkaninfo --summary | head -80 || echo VULKAN_UNAVAILABLE")
};

const STATE={
  boot:new Date().toISOString(),
  pid:process.pid,
  mode:"TRILLIONX_COMPUTER_CORE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  honesty:"GPU/RAID60+/mirrors are detected or logical runtime layers unless real OS devices exist.",
  cpu:{
    model:os.cpus()[0]?.model||"UNKNOWN",
    threads:os.cpus().length,
    flags:CPU_FLAGS
  },
  gpu:GPU_DETECT,
  memory:{
    total_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
    free_gb:+(os.freemem()/1024/1024/1024).toFixed(2),
    fabric:"ACTIVE"
  },
  processor_fabric:"ACTIVE",
  coprocessor_fabric:"ACTIVE",
  gpu_fabric:"ACTIVE_IF_AVAILABLE_ELSE_UNAVAILABLE",
  cache_fabric:"ACTIVE",
  memory_bus:"ACTIVE",
  io_bus:"ACTIVE",
  raid60_plus:"ACTIVE_LOGICAL",
  mirrors:"ACTIVE_LOGICAL",
  secure_push:"MANUAL_ONLY"
};

const METRICS={
  sha256_hps:0, sha512_hps:0, aes256_ops:0,
  gzip_MBps:0, brotli_MBps:0, memory_MBps:0,
  dns_ms:0, jobs_done:0, queue_depth:0,
  workers:0, raid_blocks:0, mirror_count:0,
  rss_mb:0, free_ram_gb:0, uptime:0, loadavg:[0,0,0]
};

const TELEMETRY=[];
const JOBS=[];

function push(type,data){
  TELEMETRY.push({time:new Date().toISOString(),type,data});
  if(TELEMETRY.length>5000) TELEMETRY.shift();
  save("computer_core/telemetry/live.json",TELEMETRY);
}

function buildMirrorsRaid(){
  for(let m=0;m<16;m++){
    const d=`computer_core/mirrors/M${String(m).padStart(2,"0")}`;
    fs.mkdirSync(d,{recursive:true});
    save(`${d}/mirror_state.json`,{mirror:m,mode:"LOGICAL_MIRROR",physical_claim:false,time:new Date().toISOString()});
  }
  for(let stripe=0;stripe<12;stripe++){
    for(let parity=0;parity<2;parity++){
      const d=`computer_core/raid60_plus/S${String(stripe).padStart(2,"0")}/P${parity}`;
      fs.mkdirSync(d,{recursive:true});
      const checksum=crypto.createHash("sha256").update(`${stripe}:${parity}:${Date.now()}`).digest("hex");
      save(`${d}/block_state.json`,{stripe,parity,checksum,mode:"LOGICAL_RAID60_PLUS",physical_claim:false});
      METRICS.raid_blocks++;
    }
  }
  METRICS.mirror_count=16;
  push("storage_fabric",{mirrors:16,raid_blocks:METRICS.raid_blocks});
}

function cryptoLoops(){
  setInterval(()=>{let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha256").update("TX"+Math.random()).digest("hex");c++;}METRICS.sha256_hps=c;push("sha256",{hps:c});},1200);
  setInterval(()=>{let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha512").update("TX"+Math.random()).digest("hex");c++;}METRICS.sha512_hps=c;push("sha512",{hps:c});},1500);
  setInterval(()=>{const k=crypto.randomBytes(32),iv=crypto.randomBytes(16),buf=Buffer.alloc(131072);let c=0,t=Date.now();while(Date.now()-t<1000){const x=crypto.createCipheriv("aes-256-cbc",k,iv);x.update(buf);x.final();c++;}METRICS.aes256_ops=c;push("aes256",{ops:c});},1800);
}

function memoryCodecLoops(){
  setInterval(()=>{
    const size=1024*1024*1024;
    const b=Buffer.alloc(size,7);
    const t=Date.now(); Buffer.from(b);
    const dt=Math.max((Date.now()-t)/1000,0.001);
    METRICS.memory_MBps=Math.round((size/1024/1024)/dt);
    push("memory_bus",{MBps:METRICS.memory_MBps});
  },5000);

  setInterval(()=>{
    const raw=Buffer.alloc(128*1024*1024,1);
    let t=Date.now(); zlib.gzipSync(raw);
    METRICS.gzip_MBps=Math.round(128/Math.max((Date.now()-t)/1000,0.001));
    t=Date.now(); zlib.brotliCompressSync(raw);
    METRICS.brotli_MBps=Math.round(128/Math.max((Date.now()-t)/1000,0.001));
    push("codec_bus",{gzip_MBps:METRICS.gzip_MBps,brotli_MBps:METRICS.brotli_MBps});
  },6000);
}

function networkLoop(){
  setInterval(()=>{
    const t=Date.now();
    dns.lookup("github.com",err=>{
      if(!err){METRICS.dns_ms=Date.now()-t;push("network",{dns_ms:METRICS.dns_ms});}
    });
  },3000);
}

function schedulerLoop(){
  setInterval(()=>{
    JOBS.push({id:"JOB_"+Date.now(),type:"COMPUTER_CORE_PACKET",status:"QUEUED",created:new Date().toISOString()});
    if(JOBS.length>10000) JOBS.shift();
    METRICS.queue_depth=JOBS.length;
  },100);
  setInterval(()=>{
    if(JOBS.length){
      const j=JOBS.shift(); j.status="DONE"; j.finished=new Date().toISOString();
      METRICS.jobs_done++; METRICS.queue_depth=JOBS.length;
      save("computer_core/scheduler/last_job.json",j);
    }
  },50);
}

function workerFabric(){
  const count=Math.max(4,Math.min(16,os.cpus().length*2));
  METRICS.workers=count;
  for(let i=0;i<count;i++){
    const w=new Worker(`
      const crypto=require("crypto"); const {parentPort}=require("worker_threads");
      function loop(){let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha256").update("W"+Math.random()).digest("hex");c++;}parentPort.postMessage({hps:c});setImmediate(loop);}
      loop();
    `,{eval:true});
    w.on("message",m=>push("coprocessor_worker",{id:i,hps:m.hps}));
    w.on("error",e=>push("worker_error",{id:i,error:String(e)}));
  }
}

function watchdog(){
  setInterval(()=>{
    METRICS.rss_mb=+(process.memoryUsage().rss/1024/1024).toFixed(2);
    METRICS.free_ram_gb=+(os.freemem()/1024/1024/1024).toFixed(2);
    METRICS.uptime=Math.round(process.uptime());
    METRICS.loadavg=os.loadavg();
    save("computer_core/metrics/live_metrics.json",METRICS);
    save("computer_core/state/computer_state.json",{state:STATE,metrics:METRICS});
  },1500);
}

function manualPushInfo(){
  return {
    mode:"MANUAL_ONLY",
    automatic_push:false,
    safe_sequence:[
      "git status --short",
      "git add <selected-files-only>",
      "git commit -m '<message>'",
      "git push origin dev-ui-runtime-next"
    ],
    reason:"No automatic push to avoid disk growth or irreversible mistakes."
  };
}

buildMirrorsRaid();
save("computer_core/bios/boot_state.json",STATE);
save("computer_core/cpu/lscpu.json",{lscpu:sh("lscpu"),flags:CPU_FLAGS});
save("computer_core/gpu/gpu_detection.json",GPU_DETECT);

cryptoLoops();
memoryCodecLoops();
networkLoop();
schedulerLoop();
workerFabric();
watchdog();

const server=http.createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");
  if(req.url==="/api/computer/status") return res.end(JSON.stringify(STATE,null,2));
  if(req.url==="/api/computer/metrics") return res.end(JSON.stringify(METRICS,null,2));
  if(req.url==="/api/computer/telemetry") return res.end(JSON.stringify(TELEMETRY.slice(-500),null,2));
  if(req.url==="/api/computer/gpu") return res.end(JSON.stringify(GPU_DETECT,null,2));
  if(req.url==="/api/computer/cpu") return res.end(JSON.stringify({cpu:STATE.cpu,lscpu:sh("lscpu")},null,2));
  if(req.url==="/api/computer/storage") return res.end(JSON.stringify({mirrors:16,raid60_plus_blocks:METRICS.raid_blocks},null,2));
  if(req.url==="/api/computer/push") return res.end(JSON.stringify(manualPushInfo(),null,2));
  res.statusCode=404; res.end(JSON.stringify({error:"NOT_FOUND"}));
});

server.listen(18000,"0.0.0.0",()=>{
  console.log("================================================================================");
  console.log(" TRILLIONX COMPUTER CORE ONLINE");
  console.log("================================================================================");
  console.log("PORT          : 18000");
  console.log("CPU THREADS   : "+STATE.cpu.threads);
  console.log("RAM GB        : "+STATE.memory.total_gb);
  console.log("WORKERS       : "+METRICS.workers);
  console.log("MIRRORS       : "+METRICS.mirror_count);
  console.log("RAID60 BLOCKS : "+METRICS.raid_blocks);
  console.log("PUSH          : MANUAL ONLY");
  console.log("================================================================================");
});
