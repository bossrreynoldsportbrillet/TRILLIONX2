"use strict";

const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const http=require("http");
const zlib=require("zlib");
const {Worker}=require("worker_threads");
const {execSync}=require("child_process");

function sh(cmd){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:4000}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function save(path,obj){
  fs.writeFileSync(path,JSON.stringify(obj,null,2));
}
function exists(cmd){
  try{execSync("command -v "+cmd,{stdio:"ignore"});return true;}
  catch(e){return false;}
}

const CPUINFO=sh("cat /proc/cpuinfo | head -260");
const LSCPU=sh("lscpu");
const FLAGS=sh("grep -m1 '^flags' /proc/cpuinfo || true");

const GPU={
  nvidia_smi: exists("nvidia-smi") ? sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null") : "GPU_UNAVAILABLE_IN_CODESPACES",
  vulkan: exists("vulkaninfo") ? sh("vulkaninfo --summary 2>/dev/null | head -80") : "VULKAN_UNAVAILABLE",
  opencl: exists("clinfo") ? sh("clinfo 2>/dev/null | head -120") : "OPENCL_UNAVAILABLE",
  webgpu: "BROWSER_SIDE_ONLY_OR_UNAVAILABLE"
};

const CPU_FEATURES={
  sse:/\bsse\b/.test(FLAGS),
  sse2:/\bsse2\b/.test(FLAGS),
  sse3:/\bpni\b|\bsse3\b/.test(FLAGS),
  ssse3:/\bssse3\b/.test(FLAGS),
  sse4_1:/\bsse4_1\b/.test(FLAGS),
  sse4_2:/\bsse4_2\b/.test(FLAGS),
  avx:/\bavx\b/.test(FLAGS),
  avx2:/\bavx2\b/.test(FLAGS),
  avx512f:/\bavx512f\b/.test(FLAGS),
  aes_ni:/\baes\b/.test(FLAGS),
  sha_ni:/\bsha_ni\b|\bsha\b/.test(FLAGS),
  fma:/\bfma\b/.test(FLAGS),
  bmi1:/\bbmi1\b/.test(FLAGS),
  bmi2:/\bbmi2\b/.test(FLAGS),
  pclmulqdq:/\bpclmulqdq\b/.test(FLAGS)
};

const STATE={
  boot:new Date().toISOString(),
  pid:process.pid,
  mode:"TRILLIONX_HARDWARE_FABRIC",
  honesty:"REAL_ONLY_OR_UNAVAILABLE ; RAID60+/mirror/GPU fabric are runtime orchestration layers unless backed by real OS devices",
  cpu_threads:os.cpus().length,
  cpu_model:os.cpus()[0]?.model || "UNKNOWN",
  total_ram_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
  free_ram_gb:+(os.freemem()/1024/1024/1024).toFixed(2),
  gpu_detection:GPU,
  cpu_features:CPU_FEATURES,
  processor_fabric:"ACTIVE",
  coprocessor_fabric:"ACTIVE_DETECT_ONLY",
  gpu_fabric:"ACTIVE_IF_AVAILABLE_ELSE_UNAVAILABLE",
  memory_fabric:"ACTIVE",
  mirror_fabric:"ACTIVE_LOGICAL",
  raid60_plus:"ACTIVE_LOGICAL",
  cache_fabric:"ACTIVE",
  io_fabric:"ACTIVE",
  watchdog:"ACTIVE",
  manual_secure_push:"AVAILABLE_BUT_NOT_AUTOMATIC"
};

const METRICS={
  sha256_hps:0,
  sha512_hps:0,
  aes256_ops:0,
  gzip_MBps:0,
  memory_MBps:0,
  worker_count:0,
  mirror_files:0,
  raid60_blocks:0,
  integrity_hashes:0,
  rss_mb:0,
  free_ram_gb:0,
  uptime:0,
  loadavg:[0,0,0]
};

const TELEMETRY=[];

function push(type,data){
  TELEMETRY.push({time:new Date().toISOString(),type,data});
  if(TELEMETRY.length>3000) TELEMETRY.shift();
  save("hardware_fabric/telemetry/live_telemetry.json",TELEMETRY);
}

function initMirrorRaid(){
  for(let m=0;m<8;m++){
    fs.mkdirSync(`hardware_fabric/mirror/mirror_${m}`,{recursive:true});
    fs.writeFileSync(`hardware_fabric/mirror/mirror_${m}/MIRROR_STATE.json`,JSON.stringify({
      mirror:m,
      time:new Date().toISOString(),
      mode:"LOGICAL_MIRROR",
      physical_claim:false
    },null,2));
  }

  for(let stripe=0;stripe<6;stripe++){
    for(let parity=0;parity<2;parity++){
      const dir=`hardware_fabric/raid60_plus/stripe_${stripe}/parity_${parity}`;
      fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(`${dir}/BLOCK_STATE.json`,JSON.stringify({
        stripe,parity,
        mode:"LOGICAL_RAID60_PLUS",
        physical_claim:false,
        checksum:crypto.createHash("sha256").update(`${stripe}:${parity}:${Date.now()}`).digest("hex")
      },null,2));
      METRICS.raid60_blocks++;
    }
  }

  METRICS.mirror_files=sh("find hardware_fabric/mirror -type f | wc -l");
  push("raid60_mirror_init",{mirrors:8,raid60_blocks:METRICS.raid60_blocks});
}

function cryptoLoop(){
  setInterval(()=>{
    let c=0; const t=Date.now();
    while(Date.now()-t<1000){crypto.createHash("sha256").update("TX"+Math.random()).digest("hex");c++;}
    METRICS.sha256_hps=c;
    push("sha256",{hps:c});
  },1500);

  setInterval(()=>{
    let c=0; const t=Date.now();
    while(Date.now()-t<1000){crypto.createHash("sha512").update("TX"+Math.random()).digest("hex");c++;}
    METRICS.sha512_hps=c;
    push("sha512",{hps:c});
  },1800);

  setInterval(()=>{
    const key=crypto.randomBytes(32), iv=crypto.randomBytes(16), buf=Buffer.alloc(65536);
    let c=0; const t=Date.now();
    while(Date.now()-t<1000){
      const x=crypto.createCipheriv("aes-256-cbc",key,iv);
      x.update(buf); x.final(); c++;
    }
    METRICS.aes256_ops=c;
    push("aes256",{ops:c});
  },2200);
}

function memoryCodecLoop(){
  setInterval(()=>{
    const size=512*1024*1024;
    const b=Buffer.alloc(size,7);
    const t=Date.now();
    Buffer.from(b);
    const dt=(Date.now()-t)/1000;
    METRICS.memory_MBps=Math.round((size/1024/1024)/Math.max(dt,0.001));
    push("memory",{MBps:METRICS.memory_MBps});
  },5000);

  setInterval(()=>{
    const raw=Buffer.alloc(64*1024*1024,1);
    const t=Date.now();
    zlib.gzipSync(raw);
    const dt=(Date.now()-t)/1000;
    METRICS.gzip_MBps=Math.round(64/Math.max(dt,0.001));
    push("codec",{gzip_MBps:METRICS.gzip_MBps});
  },6500);
}

function workers(){
  const count=Math.max(2,Math.min(8,os.cpus().length));
  METRICS.worker_count=count;
  for(let i=0;i<count;i++){
    const w=new Worker(`
      const crypto=require("crypto");
      const {parentPort}=require("worker_threads");
      function loop(){
        let c=0; const t=Date.now();
        while(Date.now()-t<1000){crypto.createHash("sha256").update("W"+Math.random()).digest("hex");c++;}
        parentPort.postMessage({hps:c});
        setImmediate(loop);
      }
      loop();
    `,{eval:true});
    w.on("message",m=>push("worker",{id:i,hps:m.hps}));
    w.on("error",e=>push("worker_error",{id:i,error:String(e)}));
  }
}

function integritySnapshot(){
  setInterval(()=>{
    const files=sh("find hardware_fabric -type f | head -300").split(/\n/).filter(Boolean);
    const map={time:new Date().toISOString(),files:{}};
    for(const f of files){
      try{
        const h=crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
        map.files[f]=h;
      }catch(e){}
    }
    METRICS.integrity_hashes=Object.keys(map.files).length;
    save("hardware_fabric/integrity/latest_integrity.json",map);
    push("integrity",{files:METRICS.integrity_hashes});
  },30000);
}

function watchdog(){
  setInterval(()=>{
    METRICS.rss_mb=+(process.memoryUsage().rss/1024/1024).toFixed(2);
    METRICS.free_ram_gb=+(os.freemem()/1024/1024/1024).toFixed(2);
    METRICS.uptime=Math.round(process.uptime());
    METRICS.loadavg=os.loadavg();
    save("hardware_fabric/metrics/live_metrics.json",METRICS);
    save("hardware_fabric/watchdog/runtime_watchdog.json",{time:new Date().toISOString(),state:STATE,metrics:METRICS});
  },2000);
}

function manualPush(){
  return {
    status:"MANUAL_ONLY_NOT_EXECUTED",
    command:"git status --short && git add <selected-files> && git commit -m 'message' && git push",
    reason:"automatic push disabled to avoid disk growth and irreversible mistakes"
  };
}

initMirrorRaid();
save("hardware_fabric/processor/cpuinfo_head.txt",{lscpu:LSCPU,cpuinfo_head:CPUINFO,flags:FLAGS});
save("hardware_fabric/gpu/gpu_detection.json",GPU);
save("hardware_fabric/registry/hardware_state.json",STATE);

cryptoLoop();
memoryCodecLoop();
workers();
integritySnapshot();
watchdog();

const server=http.createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");

  if(req.url==="/api/hardware/status") return res.end(JSON.stringify(STATE,null,2));
  if(req.url==="/api/hardware/metrics") return res.end(JSON.stringify(METRICS,null,2));
  if(req.url==="/api/hardware/telemetry") return res.end(JSON.stringify(TELEMETRY.slice(-300),null,2));
  if(req.url==="/api/hardware/gpu") return res.end(JSON.stringify(GPU,null,2));
  if(req.url==="/api/hardware/cpu") return res.end(JSON.stringify({lscpu:LSCPU,features:CPU_FEATURES},null,2));
  if(req.url==="/api/hardware/push") return res.end(JSON.stringify(manualPush(),null,2));

  res.statusCode=404;
  res.end(JSON.stringify({error:"NOT_FOUND"}));
});

server.listen(17000,"0.0.0.0",()=>{
  console.log("==================================================================");
  console.log(" TRILLIONX HARDWARE FABRIC ONLINE");
  console.log("==================================================================");
  console.log("PORT              : 17000");
  console.log("CPU THREADS       : "+STATE.cpu_threads);
  console.log("TOTAL RAM GB      : "+STATE.total_ram_gb);
  console.log("GPU               : "+(GPU.nvidia_smi||"UNAVAILABLE"));
  console.log("WORKERS           : "+METRICS.worker_count);
  console.log("RAID60+ LOGICAL   : "+METRICS.raid60_blocks+" blocks");
  console.log("SECURE PUSH       : MANUAL ONLY");
  console.log("==================================================================");
});
