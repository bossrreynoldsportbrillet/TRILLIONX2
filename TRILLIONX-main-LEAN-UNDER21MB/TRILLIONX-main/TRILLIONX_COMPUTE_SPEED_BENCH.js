const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance}=require("perf_hooks");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}

if(!isMainThread){
  const loops=workerData.loops||5_000_000;
  const t0=performance.now();
  let acc=0;
  for(let i=1;i<=loops;i++){
    acc += Math.sqrt(i)*Math.sin(i%997)+Math.log1p(i%991);
    if((i&4095)===0) acc%=1000000007;
  }
  const ms=performance.now()-t0;
  parentPort.postMessage({
    loops,
    ms:+ms.toFixed(2),
    loops_per_sec:+(loops/(ms/1000)).toFixed(2),
    checksum:+acc.toFixed(4)
  });
  return;
}

function detect(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/);
  const has=f=>flags.includes(f);
  return {
    cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    ram_gb:gb(os.totalmem()),
    node:process.version,
    platform:process.platform,
    arch:process.arch,
    codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
    container:fs.existsSync("/.dockerenv"),
    simd:{
      avx:has("avx"),
      avx2:has("avx2"),
      avx512f:has("avx512f"),
      fma:has("fma"),
      aes:has("aes"),
      sha_ni:has("sha_ni")
    }
  };
}

function loadNative(){
  const f="data/trillionx_native_simd_avx_latest.json";
  if(!fs.existsSync(f)) return {available:false};
  try{return JSON.parse(fs.readFileSync(f,"utf8"));}
  catch(e){return {available:false,error:e.message};}
}

function floatPressure(loops=12_000_000){
  const t0=performance.now();
  let x=0.0001;
  for(let i=1;i<=loops;i++){
    x += Math.sqrt(i)*Math.sin(i%1024)*Math.cos(i%511);
    if((i&8191)===0) x%=999999.937;
  }
  const ms=performance.now()-t0;
  return {
    name:"float_math_pressure",
    loops,
    ms:+ms.toFixed(2),
    loops_per_sec:+(loops/(ms/1000)).toFixed(2),
    checksum:+x.toFixed(5)
  };
}

function intPressure(loops=80_000_000){
  const t0=performance.now();
  let x=0x12345678|0;
  for(let i=0;i<loops;i++){
    x = ((x ^ (i*2654435761)) + ((x<<5)|(x>>>7)))|0;
  }
  const ms=performance.now()-t0;
  return {
    name:"int32_bitwise_pressure",
    loops,
    ms:+ms.toFixed(2),
    loops_per_sec:+(loops/(ms/1000)).toFixed(2),
    checksum:x
  };
}

function typedArrayBench(size=8_000_000, rounds=10){
  const a=new Float32Array(size);
  const b=new Float32Array(size);
  const c=new Float32Array(size);
  for(let i=0;i<size;i++){a[i]=(i%1009)*0.001;b[i]=((i*17)%997)*0.001;}
  const t0=performance.now();
  for(let r=0;r<rounds;r++){
    for(let i=0;i<size;i++){
      c[i]=Math.fround(Math.fround(a[i]*1.0001)+Math.fround(b[i]*0.9999));
    }
  }
  const ms=performance.now()-t0;
  const ops=size*rounds*3;
  let checksum=0;
  for(let i=0;i<size;i+=8192) checksum+=c[i];
  return {
    name:"float32_vector_typedarray",
    size,
    rounds,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(5)
  };
}

function matrixBench(n=256){
  const A=new Float64Array(n*n);
  const B=new Float64Array(n*n);
  const C=new Float64Array(n*n);
  for(let i=0;i<n*n;i++){A[i]=(i%97)/97;B[i]=(i%89)/89;}
  const t0=performance.now();
  for(let i=0;i<n;i++){
    for(let k=0;k<n;k++){
      const aik=A[i*n+k];
      for(let j=0;j<n;j++) C[i*n+j]+=aik*B[k*n+j];
    }
  }
  const ms=performance.now()-t0;
  const ops=2*n*n*n;
  let checksum=0;
  for(let i=0;i<C.length;i+=Math.max(1,Math.floor(C.length/1024))) checksum+=C[i];
  return {
    name:"dense_matrix_float64",
    n,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(5)
  };
}

function hashBench(mbSize=96, rounds=24){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  let digest="";
  for(let i=0;i<rounds;i++){
    digest=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
  }
  const ms=performance.now()-t0;
  return {
    name:"sha256_speed",
    total_mb:mbSize*rounds,
    ms:+ms.toFixed(2),
    mb_per_sec:+((mbSize*rounds)/(ms/1000)).toFixed(2),
    digest:digest.slice(0,24)
  };
}

function compressionBench(mbSize=64){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  const gz=zlib.gzipSync(buf,{level:1});
  const out=zlib.gunzipSync(gz);
  const ms=performance.now()-t0;
  return {
    name:"gzip_level1_speed",
    input_mb:mbSize,
    output_mb:mb(gz.length),
    ratio:+(gz.length/buf.length).toFixed(4),
    integrity:out.length===buf.length,
    ms:+ms.toFixed(2),
    mb_per_sec:+(mbSize/(ms/1000)).toFixed(2)
  };
}

async function workerSpeed(){
  const wc=Math.min(os.cpus().length,4);
  const loops=5_000_000;
  const t0=performance.now();
  const jobs=[];
  for(let i=0;i<wc;i++){
    jobs.push(new Promise((resolve,reject)=>{
      const w=new Worker(__filename,{workerData:{loops}});
      w.on("message",resolve);
      w.on("error",reject);
      w.on("exit",code=>{if(code!==0)reject(new Error("worker exit "+code));});
    }));
  }
  const results=await Promise.all(jobs);
  const ms=performance.now()-t0;
  return {
    name:"worker_parallel_compute_speed",
    worker_count:wc,
    loops_per_worker:loops,
    total_loops:wc*loops,
    ms:+ms.toFixed(2),
    loops_per_sec:+((wc*loops)/(ms/1000)).toFixed(2),
    results
  };
}

function score(real,nativeBest){
  const gops =
    (nativeBest||0)*7 +
    (real.matrix.approx_gops||0)*10 +
    (real.typed.approx_gops||0)*6;

  const throughput =
    (real.hash.mb_per_sec||0)/120 +
    (real.compression.mb_per_sec||0)/60 +
    (real.workers.loops_per_sec||0)/2500000 +
    (real.float.loops_per_sec||0)/5000000 +
    (real.int.loops_per_sec||0)/50000000;

  const rawScore = gops + throughput;
  const computeScore = +Math.min(100, rawScore).toFixed(2);

  return {
    raw_score:+rawScore.toFixed(2),
    trillionx_compute_speed_score:computeScore,
    class:
      computeScore>=90 ? "VERY_FAST_FOR_CURRENT_PROFILE" :
      computeScore>=75 ? "FAST_COMPUTE_NODE" :
      computeScore>=55 ? "GOOD_COMPUTE_NODE" :
      computeScore>=35 ? "MEDIUM_COMPUTE_NODE" :
      "LOW_COMPUTE_NODE",
    note:"Score is local to this benchmark scale, not TOP500 FLOPS."
  };
}

function projectThreadripper(real,nativeBest,host){
  const targetThreads=256;
  const hostThreads=host.logical_cpus || 2;
  const projectionFactor=+((targetThreads/hostThreads)*1.15*0.62).toFixed(2);

  return {
    target:"DUAL_THREADRIPPER_9000VW_3NM_266MB_3D_VCACHE_ECC",
    projection_only:true,
    physical_confirmation_required:true,
    factor:projectionFactor,
    projected_native_best_gops:+(nativeBest*projectionFactor).toFixed(4),
    projected_worker_loops_per_sec:+(real.workers.loops_per_sec*projectionFactor).toFixed(2),
    projected_hash_mb_per_sec:+(real.hash.mb_per_sec*projectionFactor).toFixed(2),
    projected_matrix_gops:+(real.matrix.approx_gops*projectionFactor).toFixed(4)
  };
}

(async()=>{
  console.log("=== TRILLIONX COMPUTE SPEED BENCH ===");

  const host=detect();
  const native=loadNative();
  const nr=native.native_result||{};
  const nativeBest=Math.max(nr?.scalar?.gops||0,nr?.avx?.gops||0,nr?.avx512?.gops||0);

  const float=floatPressure();
  const int=intPressure();
  const typed=typedArrayBench();
  const matrix=matrixBench();
  const hash=hashBench();
  const compression=compressionBench();
  const workers=await workerSpeed();

  const real={native_best_gops:+nativeBest.toFixed(4),float,int,typed,matrix,hash,compression,workers};
  const compute_score=score(real,nativeBest);
  const threadripper_projection=projectThreadripper(real,nativeBest,host);

  const report={
    name:"TRILLIONX_COMPUTE_SPEED_BENCH",
    version:"V1",
    time:new Date().toISOString(),
    executed_by:"TRILLIONX",
    executed_on:host.codespaces ? "CODESPACES_VIRTUALIZED_HOST" : "LOCAL_HOST",
    host,
    real_measured_compute_speed:real,
    compute_score,
    threadripper_9000vw_projection:threadripper_projection,
    truth_policy:{
      real_only:true,
      no_fake_cpu:true,
      benchmark_measures_current_host:true,
      threadripper_is_projection_until_physical_detection:true
    },
    memory_now:{
      rss_mb:mb(process.memoryUsage().rss),
      heap_used_mb:mb(process.memoryUsage().heapUsed),
      external_mb:mb(process.memoryUsage().external)
    }
  };

  const file=`${OUTDIR}/trillionx_compute_speed_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillionx_compute_speed_latest.json`,JSON.stringify(report,null,2));

  console.log("EXECUTED BY:",report.executed_by);
  console.log("EXECUTED ON:",report.executed_on);
  console.log("CPU:",host.cpu_model);
  console.log("SIMD:",host.simd);
  console.log("NATIVE BEST GOPS:",real.native_best_gops);
  console.log("MATRIX GOPS:",matrix.approx_gops);
  console.log("TYPEDARRAY GOPS:",typed.approx_gops);
  console.log("HASH MB/S:",hash.mb_per_sec);
  console.log("WORKER LOOPS/S:",workers.loops_per_sec);
  console.log("COMPUTE SPEED SCORE:",compute_score.trillionx_compute_speed_score);
  console.log("CLASS:",compute_score.class);
  console.log("THREADRIPPER PROJECTED NATIVE GOPS:",threadripper_projection.projected_native_best_gops);
  console.log("REPORT =",file);
})();
