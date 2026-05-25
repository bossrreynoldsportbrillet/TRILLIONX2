const os=require("os");
const fs=require("fs");
const http=require("http");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance}=require("perf_hooks");
const {execSync}=require("child_process");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}
function sh(cmd,timeout=8000){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}

if(!isMainThread){
  const loops=workerData.loops||3_000_000;
  const t0=performance.now();
  let x=0;
  for(let i=1;i<=loops;i++){
    x += Math.sqrt(i)*Math.sin(i%997)+Math.log1p(i%991);
    if((i&4095)===0) x%=1000000007;
  }
  const buf=crypto.randomBytes(4*1024*1024);
  const h=crypto.createHash("sha256").update(buf).digest("hex");
  parentPort.postMessage({
    ms:+(performance.now()-t0).toFixed(2),
    loops,
    checksum:+x.toFixed(4),
    hash:h.slice(0,16)
  });
  return;
}

function detectHost(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/).filter(Boolean);
  const has=f=>flags.includes(f);

  return {
    cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    reported_speed_mhz:(os.cpus()[0]||{}).speed||null,
    ram_gb:gb(os.totalmem()),
    free_ram_gb:gb(os.freemem()),
    platform:process.platform,
    arch:process.arch,
    node:process.version,
    codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
    container:fs.existsSync("/.dockerenv"),
    simd:{
      sse:has("sse"),
      sse2:has("sse2"),
      sse4_1:has("sse4_1"),
      sse4_2:has("sse4_2"),
      avx:has("avx"),
      avx2:has("avx2"),
      avx512f:has("avx512f"),
      fma:has("fma"),
      aes:has("aes"),
      sha_ni:has("sha_ni")
    },
    lscpu:sh("lscpu 2>/dev/null | head -80"),
    remote:sh("git remote -v 2>/dev/null"),
    head:sh("git log --oneline -1 2>/dev/null")
  };
}

function loadJson(file){
  if(!fs.existsSync(file)) return {available:false,reason:`missing ${file}`};
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}
  catch(e){return {available:false,error:e.message,file};}
}

async function apiProbe(){
  const paths=[
    "/api/ping",
    "/api/system",
    "/api/capacity",
    "/api/modules",
    "/api/security",
    "/api/supercompute",
    "/api/trillionx/virtual-threadripper/verdict",
    "/api/trillionx/support-base",
    "/api/trillionx/backups/verdict"
  ];
  const base="http://127.0.0.1:3000";
  const out=[];
  for(const path of paths){
    const t0=performance.now();
    const r=await new Promise(resolve=>{
      const req=http.get(base+path,res=>{
        let data="";
        res.on("data",d=>data+=d);
        res.on("end",()=>resolve({
          path,
          ok:res.statusCode>=200&&res.statusCode<300,
          status:res.statusCode,
          ms:+(performance.now()-t0).toFixed(2),
          bytes:Buffer.byteLength(data)
        }));
      });
      req.on("error",e=>resolve({path,ok:false,status:0,ms:+(performance.now()-t0).toFixed(2),error:e.message}));
      req.setTimeout(5000,()=>{req.destroy();resolve({path,ok:false,status:0,ms:5000,error:"timeout"});});
    });
    out.push(r);
  }
  return out;
}

function matrixBench(n=224){
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
    n,
    ms:+ms.toFixed(2),
    approx_ops:ops,
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(6)
  };
}

function hashBench(mbSize=64,rounds=24){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  let digest="";
  for(let i=0;i<rounds;i++){
    digest=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
  }
  const ms=performance.now()-t0;
  return {
    total_mb:mbSize*rounds,
    ms:+ms.toFixed(2),
    mb_per_sec:+((mbSize*rounds)/(ms/1000)).toFixed(2),
    digest:digest.slice(0,24)
  };
}

function compressBench(mbSize=32){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  const gz=zlib.gzipSync(buf,{level:1});
  const out=zlib.gunzipSync(gz);
  const ms=performance.now()-t0;
  return {
    input_mb:mbSize,
    output_mb:mb(gz.length),
    ratio:+(gz.length/buf.length).toFixed(4),
    integrity:out.length===buf.length,
    ms:+ms.toFixed(2),
    mb_per_sec:+(mbSize/(ms/1000)).toFixed(2)
  };
}

function ioBench(mbSize=64){
  const f=`data/threadripper_profile_io_${Date.now()}.bin`;
  const buf=crypto.randomBytes(mbSize*1024*1024);
  let t0=performance.now();
  fs.writeFileSync(f,buf);
  const writeMs=performance.now()-t0;
  t0=performance.now();
  const read=fs.readFileSync(f);
  const readMs=performance.now()-t0;
  fs.unlinkSync(f);
  return {
    mb:mbSize,
    write_ms:+writeMs.toFixed(2),
    read_ms:+readMs.toFixed(2),
    write_mb_s:+(mbSize/(writeMs/1000)).toFixed(2),
    read_mb_s:+(mbSize/(readMs/1000)).toFixed(2),
    integrity:read.length===buf.length
  };
}

async function workerBench(){
  const wc=Math.min(os.cpus().length,4);
  const loops=3_000_000;
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
    worker_count:wc,
    loops_per_worker:loops,
    total_loops:wc*loops,
    total_ms:+ms.toFixed(2),
    loops_per_sec:+((wc*loops)/(ms/1000)).toFixed(2),
    jobs_per_sec:+(wc/(ms/1000)).toFixed(2),
    results
  };
}

function threadripperProjection(real, nativeBest){
  const hostCpus=real.host.logical_cpus || 1;
  const target={
    label:"DUAL_THREADRIPPER_9000VW_3NM_266MB_3D_VCACHE_ECC",
    sockets:2,
    assumed_logical_threads:256,
    cache_mb:266,
    ecc:true,
    status:"VIRTUAL_TARGET_PROFILE_NOT_PHYSICAL_CLAIM"
  };

  const threadScale=target.assumed_logical_threads/hostCpus;
  const cacheFactor=1.15;
  const workstationEfficiency=0.62;
  const projectionFactor=+(threadScale*cacheFactor*workstationEfficiency).toFixed(2);

  return {
    target,
    projection_method:"indicative scaling from real TRILLIONX benchmark, not physical measurement",
    real_host_logical_cpus:hostCpus,
    target_logical_threads:target.assumed_logical_threads,
    thread_scale:+threadScale.toFixed(2),
    cache_factor:cacheFactor,
    efficiency_guard:workstationEfficiency,
    projection_factor:projectionFactor,
    projected_native_best_gops:+(nativeBest*projectionFactor).toFixed(4),
    projected_worker_loops_per_sec:+(real.workers.loops_per_sec*projectionFactor).toFixed(2),
    projected_hash_mb_per_sec:+(real.hash.mb_per_sec*projectionFactor).toFixed(2),
    verdict:"THREADRIPPER_PROFILE_PROJECTION_ONLY_REAL_CONFIRMATION_REQUIRED"
  };
}

function classify(real,nativeBest,projection){
  const apiOk=real.api.filter(x=>x.ok).length;
  const apiTotal=real.api.length;
  const score=+(
    Math.min(30,nativeBest*3.2)+
    Math.min(20,real.matrix.approx_gops*25)+
    Math.min(20,real.workers.loops_per_sec/2000000)+
    Math.min(15,real.hash.mb_per_sec/120)+
    Math.min(15,(apiOk/apiTotal)*15)
  ).toFixed(2);

  return {
    real_classification:"TRILLIONX_ON_CODESPACES_HPC_FEATURED_NODE",
    real_equivalent:"single virtualized HPC-capable node features, not a supercomputer",
    threadripper_profile_classification:
      projection.projected_native_best_gops>500 ? "THREADRIPPER_PROFILE_HIGH_WORKSTATION_CLUSTERLIKE_INDICATIVE" :
      projection.projected_native_best_gops>100 ? "THREADRIPPER_PROFILE_WORKSTATION_HPC_INDICATIVE" :
      "THREADRIPPER_PROFILE_WORKSTATION_INDICATIVE",
    api_success:`${apiOk}/${apiTotal}`,
    trillionx_real_orchestration_score:score,
    trillionx_threadripper_profile_score:+Math.min(100,score*1.18).toFixed(2),
    warning:"Threadripper score is a profile projection, not a real sensor measurement.",
    doctrine:"REAL_MEASURED_CODESPACES_PLUS_THREADRIPPER_TARGET_PROFILE_SEPARATED"
  };
}

(async()=>{
  console.log("=== TRILLIONX FULL + THREADRIPPER PROFILE BENCH ===");

  const host=detectHost();
  const native=loadJson("data/trillionx_native_simd_avx_latest.json");
  const nativeResult=native.native_result || {};
  const nativeBest=Math.max(
    nativeResult?.scalar?.gops||0,
    nativeResult?.avx?.gops||0,
    nativeResult?.avx512?.gops||0
  );

  const api=await apiProbe();
  const matrix=matrixBench(224);
  const hash=hashBench(64,24);
  const compression=compressBench(32);
  const io=ioBench(64);
  const workers=await workerBench();

  const real={
    host,
    api,
    native_best_gops:+nativeBest.toFixed(4),
    matrix,
    hash,
    compression,
    io,
    workers
  };

  const projection=threadripperProjection(real,nativeBest);
  const classification=classify(real,nativeBest,projection);

  const report={
    name:"TRILLIONX_FULL_THREADRIPPER_PROFILE_BENCH",
    version:"V1",
    time:new Date().toISOString(),
    real_measured:real,
    threadripper_9000vw_profile:projection,
    classification,
    truth_policy:{
      real_only:true,
      no_fake_cpu:true,
      no_fake_supercomputer:true,
      threadripper_profile_not_physical_claim:true,
      physical_confirmation_required:true,
      executed_by:"TRILLIONX",
      executed_on:host.codespaces ? "CODESPACES_VIRTUALIZED_HOST" : "LOCAL_HOST"
    },
    memory_now:{
      rss_mb:mb(process.memoryUsage().rss),
      heap_used_mb:mb(process.memoryUsage().heapUsed),
      external_mb:mb(process.memoryUsage().external)
    }
  };

  const file=`${OUTDIR}/trillionx_full_threadripper_profile_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillionx_full_threadripper_profile_latest.json`,JSON.stringify(report,null,2));

  console.log("EXECUTED BY: TRILLIONX");
  console.log("EXECUTED ON:",report.truth_policy.executed_on);
  console.log("REAL CPU:",host.cpu_model);
  console.log("REAL NATIVE BEST GOPS:",real.native_best_gops);
  console.log("REAL WORKER LOOPS/S:",workers.loops_per_sec);
  console.log("REAL HASH MB/S:",hash.mb_per_sec);
  console.log("REAL API:",classification.api_success);
  console.log("THREADRIPPER PROFILE:",projection.target.label);
  console.log("PROJECTION FACTOR:",projection.projection_factor);
  console.log("PROJECTED NATIVE GOPS:",projection.projected_native_best_gops);
  console.log("REAL SCORE:",classification.trillionx_real_orchestration_score);
  console.log("THREADRIPPER PROFILE SCORE:",classification.trillionx_threadripper_profile_score);
  console.log("CLASSIFICATION:",classification.threadripper_profile_classification);
  console.log("REPORT =",file);
})();
