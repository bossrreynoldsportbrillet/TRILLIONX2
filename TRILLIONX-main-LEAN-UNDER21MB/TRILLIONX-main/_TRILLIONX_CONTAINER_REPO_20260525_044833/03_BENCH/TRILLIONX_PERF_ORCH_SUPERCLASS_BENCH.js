const os=require("os");
const fs=require("fs");
const http=require("http");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance}=require("perf_hooks");
const {execSync,spawnSync}=require("child_process");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}
function sh(cmd,timeout=8000){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}

if(!isMainThread){
  const loops=workerData.loops||2_000_000;
  const t0=performance.now();
  let acc=0;
  for(let i=1;i<=loops;i++){
    acc += Math.sqrt(i) * Math.sin(i%997) + Math.log1p(i%991);
    if((i & 4095)===0) acc%=1000000007;
  }
  const buf=crypto.randomBytes(4*1024*1024);
  const h=crypto.createHash("sha256").update(buf).digest("hex");
  parentPort.postMessage({
    ms:+(performance.now()-t0).toFixed(2),
    loops,
    checksum:+acc.toFixed(4),
    hash:h.slice(0,16)
  });
  return;
}

function detectSupport(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/).filter(Boolean);
  const has=f=>flags.includes(f);

  return {
    time:new Date().toISOString(),
    runtime:{
      node:process.version,
      platform:process.platform,
      arch:process.arch,
      pid:process.pid,
      codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
      container:fs.existsSync("/.dockerenv"),
      hostname:os.hostname()
    },
    cpu:{
      model:(os.cpus()[0]||{}).model||"UNKNOWN",
      logical_cpus:os.cpus().length,
      reported_speed_mhz:(os.cpus()[0]||{}).speed||null,
      flags:{
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
      lscpu:sh("lscpu 2>/dev/null | head -80")
    },
    memory:{
      total_gb:gb(os.totalmem()),
      free_gb:gb(os.freemem())
    },
    disk:{
      cwd:process.cwd(),
      df:sh("df -h . 2>/dev/null | tail -1")
    },
    git:{
      remote:sh("git remote -v 2>/dev/null"),
      head:sh("git log --oneline -1 2>/dev/null")
    },
    doctrine:"REAL_MEASURED_OR_UNAVAILABLE_NO_FAKE_SUPERCOMPUTER"
  };
}

function nativeSimdLatest(){
  const latest="data/trillionx_native_simd_avx_latest.json";
  if(fs.existsSync(latest)){
    try{return JSON.parse(fs.readFileSync(latest,"utf8"));}
    catch(e){return {available:false,error:e.message};}
  }
  return {available:false,reason:"native SIMD report not found"};
}

async function apiProbe(paths){
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

function matrixBench(n=192){
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
    checksum:+checksum.toFixed(5)
  };
}

function hashBench(mbSize=64,rounds=16){
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

function compressionBench(mbSize=32){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  const gz=zlib.gzipSync(buf,{level:1});
  const unzip=zlib.gunzipSync(gz);
  const ms=performance.now()-t0;
  return {
    input_mb:mbSize,
    output_mb:mb(gz.length),
    ratio:+(gz.length/buf.length).toFixed(4),
    integrity:unzip.length===buf.length,
    ms:+ms.toFixed(2),
    mb_per_sec:+(mbSize/(ms/1000)).toFixed(2)
  };
}

function ioBench(mbSize=64){
  const file=`data/io_bench_${Date.now()}.bin`;
  const buf=crypto.randomBytes(mbSize*1024*1024);
  let t0=performance.now();
  fs.writeFileSync(file,buf);
  const writeMs=performance.now()-t0;
  t0=performance.now();
  const read=fs.readFileSync(file);
  const readMs=performance.now()-t0;
  fs.unlinkSync(file);
  return {
    mb:mbSize,
    write_ms:+writeMs.toFixed(2),
    read_ms:+readMs.toFixed(2),
    write_mb_s:+(mbSize/(writeMs/1000)).toFixed(2),
    read_mb_s:+(mbSize/(readMs/1000)).toFixed(2),
    integrity:read.length===buf.length
  };
}

async function workerBench(workerCount=Math.min(os.cpus().length,4), loops=2_000_000){
  const t0=performance.now();
  const jobs=[];
  for(let i=0;i<workerCount;i++){
    jobs.push(new Promise((resolve,reject)=>{
      const w=new Worker(__filename,{workerData:{loops}});
      w.on("message",resolve);
      w.on("error",reject);
      w.on("exit",code=>{if(code!==0)reject(new Error("worker exit "+code));});
    }));
  }
  const results=await Promise.all(jobs);
  const ms=performance.now()-t0;
  const totalLoops=workerCount*loops;
  return {
    worker_count:workerCount,
    loops_per_worker:loops,
    total_loops:totalLoops,
    total_ms:+ms.toFixed(2),
    loops_per_sec:+(totalLoops/(ms/1000)).toFixed(2),
    jobs_per_sec:+(workerCount/(ms/1000)).toFixed(2),
    results
  };
}

function classify(report){
  const nodeGops=report.compute.matrix.approx_gops || 0;
  const native=report.native_simd?.native_result || {};
  const nativeBest=Math.max(
    native?.scalar?.gops||0,
    native?.avx?.gops||0,
    native?.avx512?.gops||0
  );
  const workers=report.orchestration.workers.loops_per_sec || 0;
  const apiOk=report.orchestration.api.filter(x=>x.ok).length;
  const apiTotal=report.orchestration.api.length;

  let classLabel="NODE_SMALL_VIRTUAL";
  if(nativeBest>=20 || workers>=50000000) classLabel="WORKSTATION_CLASS_INDICATIVE";
  else if(nativeBest>=5 || nodeGops>=0.2) classLabel="CODESPACES_HPC_FEATURED_NODE_INDICATIVE";
  else classLabel="BASIC_CONTAINER_NODE";

  let superEq="NONE";
  if(classLabel==="CODESPACES_HPC_FEATURED_NODE_INDICATIVE"){
    superEq="single virtualized HPC-capable node features, not a supercomputer";
  }
  if(classLabel==="WORKSTATION_CLASS_INDICATIVE"){
    superEq="single workstation-class compute profile, not cluster/exascale";
  }

  return {
    classification:classLabel,
    equivalent_system_reading:superEq,
    real_host:report.support.runtime.codespaces ? "CODESPACES_VIRTUALIZED_HOST" : "LOCAL_OR_CONTAINER_HOST",
    native_best_gops:+nativeBest.toFixed(4),
    node_matrix_gops:nodeGops,
    worker_loops_per_sec:workers,
    api_success:`${apiOk}/${apiTotal}`,
    trillionx_orchestration_score:+(
      Math.min(40,nativeBest*4)+
      Math.min(20,nodeGops*30)+
      Math.min(20,workers/2000000)+
      Math.min(20,(apiOk/apiTotal)*20)
    ).toFixed(2),
    warning:"This is an indicative equivalence classifier. It does not claim Frontier/Captain/exascale performance.",
    doctrine:"BENCHMARK_TRUTH_REAL_HOST_ONLY"
  };
}

(async()=>{
  console.log("=== TRILLIONX PERFORMANCE + ORCHESTRATION + SUPERCLASS BENCH ===");

  const support=detectSupport();
  const native=nativeSimdLatest();

  const apiPaths=[
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

  const api=await apiProbe(apiPaths);
  const matrix=matrixBench(192);
  const hash=hashBench(64,16);
  const compression=compressionBench(32);
  const io=ioBench(64);
  const workers=await workerBench(Math.min(os.cpus().length,4),2_000_000);

  const report={
    name:"TRILLIONX_PERFORMANCE_ORCHESTRATION_SUPERCLASS_BENCH",
    version:"V1",
    time:new Date().toISOString(),
    support,
    native_simd:native,
    compute:{matrix,hash,compression,io},
    orchestration:{api,workers},
    memory_now:{
      rss_mb:mb(process.memoryUsage().rss),
      heap_used_mb:mb(process.memoryUsage().heapUsed),
      external_mb:mb(process.memoryUsage().external)
    },
    truth_policy:{
      real_only:true,
      no_fake_supercomputer:true,
      target_threadripper_profile_not_physical_claim:true,
      equivalent_classification_indicative_only:true
    }
  };

  report.classification=classify(report);

  const file=`${OUTDIR}/trillionx_perf_orch_superclass_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillionx_perf_orch_superclass_latest.json`,JSON.stringify(report,null,2));

  console.log("HOST:",support.cpu.model);
  console.log("SIMD:",support.cpu.flags);
  console.log("NATIVE BEST GOPS:",report.classification.native_best_gops);
  console.log("NODE MATRIX GOPS:",matrix.approx_gops);
  console.log("WORKER LOOPS/S:",workers.loops_per_sec);
  console.log("API SUCCESS:",report.classification.api_success);
  console.log("CLASSIFICATION:",report.classification.classification);
  console.log("EQUIVALENT:",report.classification.equivalent_system_reading);
  console.log("ORCH SCORE:",report.classification.trillionx_orchestration_score);
  console.log("REPORT =",file);
})();
