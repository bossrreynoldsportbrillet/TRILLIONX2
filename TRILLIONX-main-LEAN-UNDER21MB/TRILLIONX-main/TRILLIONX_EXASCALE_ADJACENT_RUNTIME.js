"use strict";

const fs=require("fs"),os=require("os"),crypto=require("crypto"),zlib=require("zlib"),cp=require("child_process");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("wasm",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const MODE=process.argv[2]||"run";
const DURATION_MS=Math.max(1000,Math.min(Number(process.argv[3]||15000),300000));
const WORKERS=Math.max(1,Math.min(Number(process.argv[4]||Math.max(1,os.cpus().length)),32));
const PACKET_SIZE=Math.max(16,Math.min(Number(process.argv[5]||128),2048));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const us=ms=>Math.round(ms*1000);

function sh(c,t=4000){
  try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}
  catch{return""}
}
function has(c){return !!sh(`command -v ${c} 2>/dev/null`)}
function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_mb:r(m.heapUsed/1048576),
    external_mb:r(m.external/1048576),
    arraybuf_mb:r((m.arrayBuffers||0)/1048576),
    free_gb:r(os.freemem()/1073741824),
    total_gb:r(os.totalmem()/1073741824),
    load1:r(os.loadavg()[0])
  };
}
function pct(a,p){
  const b=a.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!b.length)return null;
  return b[Math.min(b.length-1,Math.floor(b.length*p))];
}
function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex")}
function shaBuf(b){return crypto.createHash("sha256").update(b).digest("hex")}

async function ensureWasm(){
  const wat=`(module
    (func $mix (param $n i32) (result i32)
      (local $i i32)
      (local $x i32)
      (local.set $i (i32.const 0))
      (local.set $x (i32.const 2166136261))
      (loop $loop
        (local.set $x
          (i32.add
            (i32.xor (local.get $x) (local.get $i))
            (i32.mul (local.get $i) (i32.const 16777619))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $loop (i32.lt_u (local.get $i) (local.get $n)))
      )
      (local.get $x)
    )
    (export "mix" (func $mix))
  )`;
  fs.writeFileSync("wasm/trillionx_mix.wat",wat);
  if(has("wat2wasm")){
    sh("wat2wasm wasm/trillionx_mix.wat -o wasm/trillionx_mix.wasm",5000);
  }
  if(fs.existsSync("wasm/trillionx_mix.wasm")){
    try{
      const bytes=fs.readFileSync("wasm/trillionx_mix.wasm");
      const mod=await WebAssembly.instantiate(bytes,{});
      return {mode:"REAL_WASM",mix:mod.instance.exports.mix};
    }catch(e){
      return {mode:"WASM_LOAD_FAILED_JS_FALLBACK",error:e.message,mix:null};
    }
  }
  return {mode:"JS_FALLBACK_WAT2WASM_NOT_AVAILABLE",mix:null};
}

function jsMix(n){
  let x=2166136261>>>0;
  for(let i=0;i<n;i++) x=((x^i)+(Math.imul(i,16777619)))>>>0;
  return x|0;
}

async function dependentPipeline(job, wasmInfo){
  const t0=performance.now();

  // Stage A: crypto seed
  const seed=sha(job.seed+"|"+job.id+"|"+job.depth);
  const buf=Buffer.from(seed.repeat(Math.ceil(job.bytes/64)).slice(0,job.bytes));

  // Stage B: compression feeds vector size
  const zip=zlib.deflateSync(buf,{level:1});
  const vectorN=PACKET_SIZE*64+(zip.length%4096);

  // Stage C: vector math feeds graph
  let dot=0;
  for(let i=0;i<vectorN;i++){
    dot += Math.sin((i+job.id)%8191)*Math.cos((i+zip.length)%4093);
  }

  // Stage D: graph shortest-path micro
  const n=24+(job.id%8);
  const dist=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:(((i*j+j+job.id)%7===0)?((i+j+job.depth)%97)+1:1e9)));
  let graphOps=0;
  for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const v=dist[i][k]+dist[k][j];
    if(v<dist[i][j])dist[i][j]=v;
    graphOps++;
  }

  // Stage E: WASM or JS heavy mix feeds final digest
  const wasmN=PACKET_SIZE*512+Math.abs(Math.floor(dot)%50000);
  const mix = wasmInfo.mix ? wasmInfo.mix(wasmN) : jsMix(wasmN);

  // Stage F: final digest
  const final=sha(seed+"|"+zip.length+"|"+r(dot)+"|"+graphOps+"|"+mix);
  const ms=performance.now()-t0;

  return {
    id:job.id,
    ok:true,
    class:job.class,
    ms:r(ms),
    us:us(ms),
    bytes:job.bytes,
    compressed:zip.length,
    vectorN,
    graphN:n,
    graphOps,
    wasm_mode:wasmInfo.mode,
    mix,
    digest:final.slice(0,24),
    useful_ops:job.bytes+vectorN*4+graphOps+(wasmN||0)
  };
}

if(!isMainThread){
  (async()=>{
    const wasmInfo=await ensureWasm();
    parentPort.on("message",async(msg)=>{
      if(msg.type==="job"){
        try{
          const res=await dependentPipeline(msg.job,wasmInfo);
          parentPort.postMessage({type:"result",res});
        }catch(e){
          parentPort.postMessage({type:"result",res:{id:msg.job.id,ok:false,error:e.message}});
        }
      }
      if(msg.type==="stop")process.exit(0);
    });
    parentPort.postMessage({type:"ready",worker_id:workerData.worker_id,wasm_mode:wasmInfo.mode});
  })();
  return;
}

function makeJob(id,previousDigest){
  const classes=["BTC_CRYPTO","VECTOR","GRAPH","COMPRESSION","VR_CACHE","NETWORK","REGISTRY"];
  return {
    id,
    class:classes[id%classes.length],
    seed:previousDigest||"TRILLIONX_EXASCALE_ADJACENT",
    depth:1+(id%11),
    bytes:PACKET_SIZE*1024+(id%17)*2048
  };
}

async function runMaster(){
  console.log("=== TRILLIONX EXASCALE-ADJACENT RUNTIME ===");
  console.log("TARGET=TRILLIONX | HOST=CODESPACES_SUPPORT_ONLY | NO_FAKE_EXASCALE");
  console.log("DURATION_MS:",DURATION_MS,"WORKERS:",WORKERS,"PACKET_SIZE:",PACKET_SIZE);

  const wasmMain=await ensureWasm();
  console.log("WASM:",wasmMain.mode);

  const workers=[];
  const ready=[];
  for(let i=0;i<WORKERS;i++){
    const w=new Worker(__filename,{workerData:{worker_id:i}});
    workers.push(w);
    w.on("message",m=>{
      if(m.type==="ready")ready.push(m);
    });
  }

  const startWait=performance.now();
  while(ready.length<WORKERS && performance.now()-startWait<10000){
    await new Promise(r=>setTimeout(r,50));
  }

  let nextJob=0, completed=0, failed=0, inFlight=0;
  let previousDigest="TRILLIONX_START";
  let totalUsefulOps=0,totalBytes=0;
  const lat=[], workerModes={};
  for(const x of ready)workerModes[x.wasm_mode]=(workerModes[x.wasm_mode]||0)+1;

  const started=performance.now();
  const results=[];
  const queue=[];

  function dispatch(w){
    if(performance.now()-started>DURATION_MS)return false;
    const job=makeJob(nextJob++,previousDigest);
    inFlight++;
    w.postMessage({type:"job",job});
    return true;
  }

  await new Promise(resolve=>{
    for(const w of workers){
      w.on("message",m=>{
        if(m.type==="result"){
          inFlight--;
          const res=m.res;
          results.push(res);
          if(res.ok){
            completed++;
            previousDigest=res.digest;
            totalUsefulOps+=res.useful_ops||0;
            totalBytes+=res.bytes||0;
            lat.push(res.us||0);
          }else failed++;
          if(performance.now()-started<DURATION_MS)dispatch(w);
          else if(inFlight===0)resolve();
        }
      });
      dispatch(w);
    }

    const timer=setInterval(()=>{
      if(performance.now()-started>DURATION_MS && inFlight===0){
        clearInterval(timer);resolve();
      }
    },100);
  });

  for(const w of workers){
    try{w.postMessage({type:"stop"})}catch{}
  }

  const totalMs=performance.now()-started;
  const throughput=completed/(totalMs/1000);
  const usefulOpsS=totalUsefulOps/(totalMs/1000);
  const mbS=(totalBytes/1048576)/(totalMs/1000);
  const health=Math.max(0,Math.min(100,
    100
    -(failed*0.5)
    -(mem().rss_mb>1400?10:0)
    -(throughput<1?10:0)
  ));

  const summary={
    completed,
    failed,
    total_ms:r(totalMs),
    total_us:us(totalMs),
    packets_s:r(throughput),
    useful_ops_s:r(usefulOpsS),
    mb_s:r(mbS),
    p50_us:pct(lat,0.50),
    p95_us:pct(lat,0.95),
    p99_us:pct(lat,0.99),
    workers_requested:WORKERS,
    workers_ready:ready.length,
    worker_wasm_modes:workerModes,
    final_digest:previousDigest,
    health:r(health),
    verdict:health>=85?"EXASCALE_ADJACENT_RUNTIME_GOOD":health>=65?"EXASCALE_ADJACENT_RUNTIME_PARTIAL":"EXASCALE_ADJACENT_RUNTIME_REVIEW",
    reading:"Distributed worker-process style orchestration + dependent benchmarks + WASM/fallback + long stress. Exascale-adjacent means useful orchestration, not physical exaFLOPS."
  };

  const report={
    engine:"TRILLIONX_EXASCALE_ADJACENT_RUNTIME",
    ts:new Date().toISOString(),
    mode:MODE,
    duration_ms:DURATION_MS,
    packet_size:PACKET_SIZE,
    host:{node:process.version,cpus:os.cpus().length,cpu:os.cpus()[0]?.model,ram_gb:r(os.totalmem()/1073741824)},
    policy:{
      target:"TRILLIONX",
      host:"CODESPACES_SUPPORT_ONLY",
      real_only:true,
      no_fake_exascale:true,
      exascale_adjacent:true,
      worker_threads_distributed:true,
      wasm_real_if_available:true,
      dependent_benchmarks:true,
      long_stress:true
    },
    summary,
    sample_results:results.slice(-80),
    memory:mem()
  };

  const file=`data/trillionx_exascale_adjacent_runtime_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_exascale_adjacent_runtime_latest.json",JSON.stringify(report,null,2));

  console.log("=== SUMMARY ===");
  console.log("COMPLETED:",summary.completed,"FAILED:",summary.failed);
  console.log("PACKETS/S:",summary.packets_s);
  console.log("USEFUL OPS/S:",summary.useful_ops_s);
  console.log("MB/S:",summary.mb_s);
  console.log("P50/P95/P99 µs:",summary.p50_us,summary.p95_us,summary.p99_us);
  console.log("WASM MODES:",JSON.stringify(summary.worker_wasm_modes));
  console.log("HEALTH:",summary.health);
  console.log("VERDICT:",summary.verdict);
  console.log("REPORT =",file);
}

runMaster().catch(e=>{console.error(e);process.exit(1)});
