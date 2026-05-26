"use strict";

const fs=require("fs");
const os=require("os");
const path=require("path");
const http=require("http");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker}=require("worker_threads");
const {execSync}=require("child_process");

const ROOT=process.cwd();

function sh(cmd, timeout=8000){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function mkdir(p){fs.mkdirSync(p,{recursive:true});}
function save(p,o){mkdir(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2));}
function text(p,s){mkdir(path.dirname(p));fs.writeFileSync(p,s);}
function shaFile(p){
  try{return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}
  catch(e){return null;}
}

const FLAGS=sh("grep -m1 '^flags' /proc/cpuinfo || true");
const hasFlag=x=>new RegExp("\\b"+x+"\\b").test(FLAGS);

const CPU={
  model:os.cpus()[0]?.model||"UNKNOWN",
  threads:os.cpus().length,
  total_ram_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
  free_ram_gb:+(os.freemem()/1024/1024/1024).toFixed(2),
  flags:{
    sse:hasFlag("sse"),
    sse2:hasFlag("sse2"),
    sse3:hasFlag("pni")||hasFlag("sse3"),
    ssse3:hasFlag("ssse3"),
    sse4_1:hasFlag("sse4_1"),
    sse4_2:hasFlag("sse4_2"),
    avx:hasFlag("avx"),
    avx2:hasFlag("avx2"),
    avx512f:hasFlag("avx512f"),
    aes_ni:hasFlag("aes"),
    sha_ni:hasFlag("sha_ni")||hasFlag("sha"),
    fma:hasFlag("fma"),
    bmi1:hasFlag("bmi1"),
    bmi2:hasFlag("bmi2"),
    pclmulqdq:hasFlag("pclmulqdq")
  }
};

const GPU={
  nvidia_smi:sh("command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || echo GPU_UNAVAILABLE"),
  opencl:sh("command -v clinfo >/dev/null && clinfo | head -120 || echo OPENCL_UNAVAILABLE"),
  vulkan:sh("command -v vulkaninfo >/dev/null && vulkaninfo --summary | head -80 || echo VULKAN_UNAVAILABLE")
};

const LINEAGE_RULES=[
  ["UI",/ui|button|render|terminal|html|css|cockpit|frontend|visual/i],
  ["API",/api|route|endpoint|express|app\.get|app\.post|router/i],
  ["RUNTIME",/runtime|daemon|watchdog|orchestrator|scheduler|worker|cluster|mesh|phase|core/i],
  ["CRYPTO",/crypto|sha256|sha512|aes|hash|btc|eth|blockchain|stratum|mining/i],
  ["CODEC",/codec|gzip|brotli|zlib|compress|decompress|encode|decode/i],
  ["MEMORY",/memory|cache|ram|mmap|buffer|sharedarraybuffer|l1|l2|l3|l4|l5|l6|l56/i],
  ["STORAGE",/raid60|raid|mirror|stripe|parity|storage|disk|snapshot|backup/i],
  ["GPU_COPROCESSOR",/gpu|cuda|opencl|vulkan|webgpu|coprocessor|processor|avx|sse|simd/i],
  ["NETWORK",/network|socket|websocket|port|ping|latency|reconnect|dns|packet/i],
  ["BENCH",/bench|benchmark|flops|hpc|stress|score|throughput|performance/i],
  ["REGISTRY",/registry|catalog|manifest|dict|map|ledger|index|state/i],
  ["SCRIPT",/\.sh$|script|repair|start|launch|activate|install|optimize/i]
];

function listFiles(){
  const raw=sh("find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.npm-cache/*' | sort",20000);
  return raw==="UNAVAILABLE"?[]:raw.split(/\n/).filter(Boolean);
}

function classify(file){
  for(const [name,re] of LINEAGE_RULES){
    if(re.test(file)) return name;
  }
  return "OTHER";
}

const files=listFiles();
const lineages={};
for(const f of files){
  const lin=classify(f);
  if(!lineages[lin]) lineages[lin]=[];
  lineages[lin].push(f);
}

const selected={};
for(const [lin,arr] of Object.entries(lineages)){
  selected[lin]=arr.map(f=>{
    let size=0;
    try{size=fs.statSync(f).size;}catch(e){}
    return {file:f,size,sha256:shaFile(f)};
  }).sort((a,b)=>b.size-a.size).slice(0,120);
}

for(const [lin,arr] of Object.entries(selected)){
  save(`phylo_recovery/lineages/${lin}.json`,arr);
}

save("phylo_recovery/scan/all_files.json",{count:files.length,files});
save("phylo_recovery/registry/phylogenetic_index.json",{
  time:new Date().toISOString(),
  root:ROOT,
  total_files:files.length,
  lineage_counts:Object.fromEntries(Object.entries(lineages).map(([k,v])=>[k,v.length])),
  cpu:CPU,
  gpu:GPU,
  doctrine:"identify existing elements, classify by lineage, mount logical layers, activate detected runtime only",
  honesty:"REAL_ONLY_OR_UNAVAILABLE"
});

function buildComputerMounts(){
  const mounts={
    computer:"TRILLIONX_COMPUTER",
    processor:CPU,
    gpu:GPU,
    lineages:Object.fromEntries(Object.entries(lineages).map(([k,v])=>[k,v.length])),
    mounts:{
      cpu:"phylo_recovery/computer/cpu",
      gpu:"phylo_recovery/computer/gpu",
      memory:"phylo_recovery/computer/memory",
      cache:"phylo_recovery/computer/cache",
      mirror:"phylo_recovery/computer/mirror",
      raid60_plus:"phylo_recovery/computer/raid60_plus",
      registry:"phylo_recovery/registry",
      activation:"phylo_recovery/activation"
    }
  };
  save("phylo_recovery/mounts/computer_mounts.json",mounts);
  save("phylo_recovery/computer/cpu/cpu_state.json",CPU);
  save("phylo_recovery/computer/gpu/gpu_state.json",GPU);

  for(let i=0;i<16;i++){
    save(`phylo_recovery/computer/mirror/M${String(i).padStart(2,"0")}/state.json`,{
      mirror:i,mode:"LOGICAL_MIRROR",source:"phylo_recovery",physical_claim:false
    });
  }

  let blocks=0;
  for(let s=0;s<12;s++){
    for(let p=0;p<2;p++){
      save(`phylo_recovery/computer/raid60_plus/S${String(s).padStart(2,"0")}/P${p}/block.json`,{
        stripe:s,parity:p,mode:"LOGICAL_RAID60_PLUS",physical_claim:false,
        checksum:crypto.createHash("sha256").update(`${s}:${p}:${Date.now()}`).digest("hex")
      });
      blocks++;
    }
  }
  save("phylo_recovery/computer/raid60_plus/summary.json",{stripes:12,parity_per_stripe:2,blocks});
}

buildComputerMounts();

const METRICS={
  sha256_hps:0,
  sha512_hps:0,
  aes256_ops:0,
  gzip_MBps:0,
  brotli_MBps:0,
  memory_MBps:0,
  jobs_done:0,
  queue_depth:0,
  workers:0,
  lineage_counts:Object.fromEntries(Object.entries(lineages).map(([k,v])=>[k,v.length])),
  rss_mb:0,
  free_ram_gb:0,
  uptime:0,
  loadavg:[0,0,0]
};

const JOBS=[];
const TELEMETRY=[];

function push(type,data){
  TELEMETRY.push({time:new Date().toISOString(),type,data});
  if(TELEMETRY.length>5000) TELEMETRY.shift();
  save("phylo_recovery/telemetry/live.json",TELEMETRY);
}

function activateCrypto(){
  setInterval(()=>{let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha256").update("PHYLO"+Math.random()).digest("hex");c++;}METRICS.sha256_hps=c;push("sha256",{hps:c});},1400);
  setInterval(()=>{let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha512").update("PHYLO"+Math.random()).digest("hex");c++;}METRICS.sha512_hps=c;push("sha512",{hps:c});},1700);
  setInterval(()=>{const k=crypto.randomBytes(32),iv=crypto.randomBytes(16),buf=Buffer.alloc(65536);let c=0,t=Date.now();while(Date.now()-t<1000){const x=crypto.createCipheriv("aes-256-cbc",k,iv);x.update(buf);x.final();c++;}METRICS.aes256_ops=c;push("aes256",{ops:c});},2100);
}

function activateMemoryCodec(){
  setInterval(()=>{
    const size=512*1024*1024;
    const b=Buffer.alloc(size,7);
    const t=Date.now(); Buffer.from(b);
    METRICS.memory_MBps=Math.round((size/1024/1024)/Math.max((Date.now()-t)/1000,0.001));
    push("memory",{MBps:METRICS.memory_MBps});
  },5000);

  setInterval(()=>{
    const raw=Buffer.alloc(64*1024*1024,1);
    let t=Date.now(); zlib.gzipSync(raw);
    METRICS.gzip_MBps=Math.round(64/Math.max((Date.now()-t)/1000,0.001));
    t=Date.now(); zlib.brotliCompressSync(raw);
    METRICS.brotli_MBps=Math.round(64/Math.max((Date.now()-t)/1000,0.001));
    push("codecs",{gzip_MBps:METRICS.gzip_MBps,brotli_MBps:METRICS.brotli_MBps});
  },7000);
}

function activateWorkers(){
  const count=Math.max(2,Math.min(12,os.cpus().length*2));
  METRICS.workers=count;
  for(let i=0;i<count;i++){
    const w=new Worker(`
      const crypto=require("crypto");
      const {parentPort}=require("worker_threads");
      function loop(){let c=0,t=Date.now();while(Date.now()-t<1000){crypto.createHash("sha256").update("W"+Math.random()).digest("hex");c++;}parentPort.postMessage({hps:c});setImmediate(loop);}
      loop();
    `,{eval:true});
    w.on("message",m=>push("worker",{id:i,hps:m.hps}));
    w.on("error",e=>push("worker_error",{id:i,error:String(e)}));
  }
}

function activateScheduler(){
  setInterval(()=>{
    JOBS.push({id:"PHYLO_JOB_"+Date.now(),status:"QUEUED",lineage:"AUTO",created:new Date().toISOString()});
    if(JOBS.length>5000) JOBS.shift();
    METRICS.queue_depth=JOBS.length;
  },250);
  setInterval(()=>{
    if(JOBS.length){
      const j=JOBS.shift(); j.status="DONE"; j.finished=new Date().toISOString();
      METRICS.jobs_done++; METRICS.queue_depth=JOBS.length;
      save("phylo_recovery/scheduler/last_job.json",j);
    }
  },150);
}

function watchdog(){
  setInterval(()=>{
    METRICS.rss_mb=+(process.memoryUsage().rss/1024/1024).toFixed(2);
    METRICS.free_ram_gb=+(os.freemem()/1024/1024/1024).toFixed(2);
    METRICS.uptime=Math.round(process.uptime());
    METRICS.loadavg=os.loadavg();
    save("phylo_recovery/metrics/live_metrics.json",METRICS);
    save("phylo_recovery/watchdog/runtime_watchdog.json",{
      time:new Date().toISOString(),
      metrics:METRICS,
      cpu:CPU,
      gpu:GPU
    });
  },2000);
}

activateCrypto();
activateMemoryCodec();
activateWorkers();
activateScheduler();
watchdog();

const server=http.createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");

  if(req.url==="/api/phylo/status") return res.end(JSON.stringify({
    mode:"TRILLIONX_PHYLOGENETIC_RECOVERY",
    boot:new Date().toISOString(),
    root:ROOT,
    cpu:CPU,
    gpu:GPU,
    lineages:Object.fromEntries(Object.entries(lineages).map(([k,v])=>[k,v.length])),
    doctrine:"recover existing elements, update, mount, activate",
    honesty:"REAL_ONLY_OR_UNAVAILABLE"
  },null,2));

  if(req.url==="/api/phylo/metrics") return res.end(JSON.stringify(METRICS,null,2));
  if(req.url==="/api/phylo/lineages") return res.end(JSON.stringify(selected,null,2));
  if(req.url==="/api/phylo/telemetry") return res.end(JSON.stringify(TELEMETRY.slice(-500),null,2));
  if(req.url==="/api/phylo/mounts") return res.end(fs.readFileSync("phylo_recovery/mounts/computer_mounts.json","utf8"));
  if(req.url==="/api/phylo/push") return res.end(JSON.stringify({
    mode:"MANUAL_ONLY",
    automatic_push:false,
    safe_push:[
      "git status --short",
      "git add <selected files only>",
      "git commit -m 'TRILLIONX phylo recovery mount activation'",
      "git push origin dev-ui-runtime-next"
    ]
  },null,2));

  res.statusCode=404;
  res.end(JSON.stringify({error:"NOT_FOUND"}));
});

server.listen(19000,"0.0.0.0",()=>{
  console.log("================================================================================================");
  console.log(" TRILLIONX PHYLOGENETIC RECOVERY ONLINE");
  console.log("================================================================================================");
  console.log("PORT        : 19000");
  console.log("FILES       : "+files.length);
  console.log("LINEAGES    : "+Object.keys(lineages).length);
  console.log("CPU THREADS : "+CPU.threads);
  console.log("RAM GB      : "+CPU.total_ram_gb);
  console.log("GPU         : "+GPU.nvidia_smi);
  console.log("PUSH        : MANUAL ONLY");
  console.log("================================================================================================");
});
