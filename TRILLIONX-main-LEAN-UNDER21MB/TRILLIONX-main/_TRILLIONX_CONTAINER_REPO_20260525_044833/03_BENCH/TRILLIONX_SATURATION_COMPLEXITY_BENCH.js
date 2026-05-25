const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance, monitorEventLoopDelay}=require("perf_hooks");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

if(!isMainThread){
  const cfg=workerData;
  const t0=performance.now();
  let checksum=0;

  for(let round=0; round<cfg.rounds; round++){
    for(let i=1;i<=cfg.loops;i++){
      checksum += Math.sqrt(i+round)*Math.sin((i+round)%997)+Math.log1p(i%991);
      if((i&4095)===0) checksum%=1000000007;
    }

    const buf=crypto.randomBytes(cfg.crypto_mb*1024*1024);
    const h=crypto.createHash("sha256").update(buf).digest("hex");
    checksum += parseInt(h.slice(0,8),16)%100000;
  }

  parentPort.postMessage({
    ok:true,
    ms:+(performance.now()-t0).toFixed(2),
    loops:cfg.loops,
    rounds:cfg.rounds,
    crypto_mb:cfg.crypto_mb,
    checksum:+checksum.toFixed(4)
  });
  return;
}

function detectHost(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/);
  const has=f=>flags.includes(f);
  return {
    cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    ram_gb:gb(os.totalmem()),
    free_ram_gb:gb(os.freemem()),
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

function loadNativeBest(){
  const f="data/trillionx_native_simd_avx_latest.json";
  if(!fs.existsSync(f)) return 0;
  try{
    const j=JSON.parse(fs.readFileSync(f,"utf8"));
    const n=j.native_result||{};
    return Math.max(n?.scalar?.gops||0,n?.avx?.gops||0,n?.avx512?.gops||0);
  }catch(e){return 0;}
}

function matrixComplex(n){
  const A=new Float64Array(n*n);
  const B=new Float64Array(n*n);
  const C=new Float64Array(n*n);
  for(let i=0;i<n*n;i++){A[i]=(i%97)/97;B[i]=(i%89)/89;}
  const t0=performance.now();

  for(let i=0;i<n;i++){
    for(let k=0;k<n;k++){
      const aik=A[i*n+k];
      for(let j=0;j<n;j++){
        C[i*n+j]+=aik*B[k*n+j];
      }
    }
  }

  const ms=performance.now()-t0;
  const ops=2*n*n*n;
  let checksum=0;
  for(let i=0;i<C.length;i+=Math.max(1,Math.floor(C.length/2048))) checksum+=C[i];

  return {
    n,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(5)
  };
}

function memoryBandwidth(sizeMb, rounds){
  const n=Math.floor(sizeMb*1024*1024/8);
  const a=new Float64Array(n);
  const b=new Float64Array(n);
  for(let i=0;i<n;i++){a[i]=i%997;b[i]=0;}
  const t0=performance.now();
  let checksum=0;

  for(let r=0;r<rounds;r++){
    for(let i=0;i<n;i++){
      b[i]=a[i]*1.0000001+b[i]*0.000001;
    }
  }

  for(let i=0;i<n;i+=4096) checksum+=b[i];
  const ms=performance.now()-t0;
  const movedBytes=sizeMb*1024*1024*rounds*2;

  return {
    size_mb:sizeMb,
    rounds,
    ms:+ms.toFixed(2),
    approx_gb_s:+((movedBytes/(ms/1000))/1073741824).toFixed(3),
    checksum:+checksum.toFixed(5)
  };
}

function compressionComplex(sizeMb){
  const buf=crypto.randomBytes(sizeMb*1024*1024);
  const t0=performance.now();
  const gz=zlib.gzipSync(buf,{level:1});
  const out=zlib.gunzipSync(gz);
  const ms=performance.now()-t0;
  return {
    input_mb:sizeMb,
    output_mb:mb(gz.length),
    ratio:+(gz.length/buf.length).toFixed(4),
    integrity:out.length===buf.length,
    ms:+ms.toFixed(2),
    mb_s:+(sizeMb/(ms/1000)).toFixed(2)
  };
}

function hashComplex(sizeMb, rounds){
  const buf=crypto.randomBytes(sizeMb*1024*1024);
  const t0=performance.now();
  let digest="";
  for(let r=0;r<rounds;r++){
    digest=crypto.createHash("sha512").update(buf).update(String(r)).digest("hex");
  }
  const ms=performance.now()-t0;
  return {
    algo:"sha512",
    total_mb:sizeMb*rounds,
    ms:+ms.toFixed(2),
    mb_s:+((sizeMb*rounds)/(ms/1000)).toFixed(2),
    digest:digest.slice(0,24)
  };
}

async function workerComplex(workerCount, loops, rounds, cryptoMb, timeoutMs){
  const t0=performance.now();
  const jobs=[];
  for(let i=0;i<workerCount;i++){
    jobs.push(new Promise((resolve)=>{
      const w=new Worker(__filename,{workerData:{loops,rounds,crypto_mb:cryptoMb}});
      const timer=setTimeout(()=>{
        try{w.terminate();}catch(e){}
        resolve({ok:false,error:"worker_timeout"});
      },timeoutMs);

      w.on("message",msg=>{
        clearTimeout(timer);
        resolve(msg);
      });
      w.on("error",e=>{
        clearTimeout(timer);
        resolve({ok:false,error:e.message});
      });
      w.on("exit",code=>{
        if(code!==0){
          clearTimeout(timer);
          resolve({ok:false,error:"worker_exit_"+code});
        }
      });
    }));
  }
  const results=await Promise.all(jobs);
  const ms=performance.now()-t0;
  const ok=results.filter(x=>x.ok).length;
  const totalLoops=workerCount*loops*rounds;

  return {
    worker_count:workerCount,
    loops,
    rounds,
    crypto_mb_per_round:cryptoMb,
    total_loops:totalLoops,
    ok_workers:ok,
    failed_workers:workerCount-ok,
    ms:+ms.toFixed(2),
    loops_s:+(totalLoops/(ms/1000)).toFixed(2),
    results
  };
}

function pressureVerdict(before, after, levelMs, eventLoopP95Ms){
  const rssLimitMb=Math.min(gb(os.totalmem())*1024*0.72, 4096);
  const rssMb=after.rss_mb;
  const freeGb=gb(os.freemem());

  const limits=[];
  if(rssMb>rssLimitMb) limits.push("RSS_PRESSURE_HIGH");
  if(freeGb<0.35) limits.push("FREE_RAM_LOW");
  if(levelMs>45000) limits.push("LEVEL_TIME_TOO_HIGH");
  if(eventLoopP95Ms>600) limits.push("EVENT_LOOP_LATENCY_HIGH");

  return {
    rss_limit_mb:+rssLimitMb.toFixed(2),
    rss_mb:rssMb,
    free_ram_gb:freeGb,
    level_ms:+levelMs.toFixed(2),
    event_loop_p95_ms:eventLoopP95Ms,
    saturation_flags:limits,
    continue:limits.length===0
  };
}

function memNow(){
  const m=process.memoryUsage();
  return {
    rss_mb:mb(m.rss),
    heap_used_mb:mb(m.heapUsed),
    heap_total_mb:mb(m.heapTotal),
    external_mb:mb(m.external),
    free_ram_gb:gb(os.freemem())
  };
}

function complexityScore(level, results){
  const gops=results.matrix.approx_gops || 0;
  const gbps=results.memory.approx_gb_s || 0;
  const hash=results.hash.mb_s || 0;
  const comp=results.compression.mb_s || 0;
  const loops=results.workers.loops_s || 0;

  return +(
    level*10 +
    Math.min(25,gops*25) +
    Math.min(20,gbps*3) +
    Math.min(20,hash/160) +
    Math.min(15,comp/80) +
    Math.min(30,loops/2000000)
  ).toFixed(2);
}

async function run(){
  const host=detectHost();
  const nativeBest=loadNativeBest();

  const mode=(process.argv[2]||"safe").toLowerCase();
  const maxLevel=mode==="fire" ? 6 : mode==="heavy" ? 5 : 4;

  const levels=[
    {level:1, matrixN:160, memMb:64, memRounds:4, hashMb:32, hashRounds:8, compMb:16, workers:2, loops:1_500_000, workerRounds:1, workerCryptoMb:2, timeout:20000},
    {level:2, matrixN:192, memMb:96, memRounds:5, hashMb:48, hashRounds:10, compMb:24, workers:2, loops:2_500_000, workerRounds:1, workerCryptoMb:3, timeout:25000},
    {level:3, matrixN:224, memMb:128, memRounds:6, hashMb:64, hashRounds:12, compMb:32, workers:Math.min(4,os.cpus().length), loops:3_500_000, workerRounds:1, workerCryptoMb:4, timeout:30000},
    {level:4, matrixN:256, memMb:192, memRounds:7, hashMb:96, hashRounds:14, compMb:48, workers:Math.min(4,os.cpus().length), loops:5_000_000, workerRounds:1, workerCryptoMb:5, timeout:40000},
    {level:5, matrixN:320, memMb:256, memRounds:8, hashMb:128, hashRounds:16, compMb:64, workers:Math.min(6,os.cpus().length), loops:7_000_000, workerRounds:2, workerCryptoMb:6, timeout:60000},
    {level:6, matrixN:384, memMb:384, memRounds:9, hashMb:160, hashRounds:20, compMb:96, workers:Math.min(8,os.cpus().length), loops:10_000_000, workerRounds:2, workerCryptoMb:8, timeout:90000}
  ].slice(0,maxLevel);

  const monitor=monitorEventLoopDelay({resolution:20});
  monitor.enable();

  const report={
    name:"TRILLIONX_SATURATION_COMPLEXITY_BENCH",
    version:"V1",
    mode,
    time:new Date().toISOString(),
    executed_by:"TRILLIONX",
    executed_on:host.codespaces ? "CODESPACES_VIRTUALIZED_HOST" : "LOCAL_HOST",
    host,
    native_best_gops:nativeBest,
    levels:[],
    stop_reason:null,
    truth_policy:{
      real_only:true,
      no_fake_cpu:true,
      progressive_until_saturation:true,
      saturation_is_controlled:true,
      threadripper_projection_not_used_for_real_measure:true
    }
  };

  console.log("=== TRILLIONX SATURATION COMPLEXITY BENCH ===");
  console.log("MODE:",mode);
  console.log("HOST:",host.cpu_model);
  console.log("SIMD:",JSON.stringify(host.simd));
  console.log("MAX LEVEL:",maxLevel);

  for(const cfg of levels){
    console.log(`\n--- LEVEL ${cfg.level} START ---`);
    const before=memNow();
    const t0=performance.now();
    monitor.reset();

    let results={};
    try{
      results.matrix=matrixComplex(cfg.matrixN);
      results.memory=memoryBandwidth(cfg.memMb,cfg.memRounds);
      results.hash=hashComplex(cfg.hashMb,cfg.hashRounds);
      results.compression=compressionComplex(cfg.compMb);
      results.workers=await workerComplex(cfg.workers,cfg.loops,cfg.workerRounds,cfg.workerCryptoMb,cfg.timeout);
    }catch(e){
      report.stop_reason="ERROR_"+e.message;
      report.levels.push({
        level:cfg.level,
        config:cfg,
        before,
        error:e.message,
        after:memNow()
      });
      break;
    }

    const levelMs=performance.now()-t0;
    const after=memNow();
    const eventLoopP95Ms=+(monitor.percentile(95)/1e6).toFixed(2);
    const verdict=pressureVerdict(before,after,levelMs,eventLoopP95Ms);
    const score=complexityScore(cfg.level,results);

    const item={
      level:cfg.level,
      config:cfg,
      before,
      after,
      results,
      event_loop_p95_ms:eventLoopP95Ms,
      complexity_score:score,
      verdict
    };

    report.levels.push(item);

    console.log("LEVEL:",cfg.level);
    console.log("MATRIX GOPS:",results.matrix.approx_gops);
    console.log("MEM GB/S:",results.memory.approx_gb_s);
    console.log("HASH MB/S:",results.hash.mb_s);
    console.log("COMP MB/S:",results.compression.mb_s);
    console.log("WORKER LOOPS/S:",results.workers.loops_s);
    console.log("RSS MB:",after.rss_mb);
    console.log("EVENT LOOP P95 MS:",eventLoopP95Ms);
    console.log("SCORE:",score);
    console.log("FLAGS:",verdict.saturation_flags.join(",")||"NONE");

    if(!verdict.continue){
      report.stop_reason="SATURATION_CONTROL_STOP_"+verdict.saturation_flags.join("_");
      console.log("STOP:",report.stop_reason);
      break;
    }

    await sleep(300);
  }

  monitor.disable();

  const last=report.levels[report.levels.length-1] || {};
  const maxScore=Math.max(...report.levels.map(x=>x.complexity_score||0),0);
  const maxLevelReached=Math.max(...report.levels.map(x=>x.level||0),0);

  report.summary={
    max_level_reached:maxLevelReached,
    max_complexity_score:+maxScore.toFixed(2),
    saturation_reached:!!report.stop_reason,
    stop_reason:report.stop_reason || "NO_SATURATION_WITHIN_SELECTED_MODE",
    final_rss_mb:last.after?.rss_mb ?? null,
    final_event_loop_p95_ms:last.event_loop_p95_ms ?? null,
    final_verdict:
      report.stop_reason ? "TRILLIONX_SATURATION_LIMIT_FOUND_OR_CONTROLLED_STOP" :
      "TRILLIONX_STABLE_UNDER_SELECTED_COMPLEXITY",
    reading:"This measures TRILLIONX executing increasingly complex workloads on the real current host."
  };

  const file=`${OUTDIR}/trillionx_saturation_complexity_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillionx_saturation_complexity_latest.json`,JSON.stringify(report,null,2));

  console.log("\n=== SUMMARY ===");
  console.log("MAX LEVEL:",report.summary.max_level_reached);
  console.log("MAX SCORE:",report.summary.max_complexity_score);
  console.log("SATURATION:",report.summary.saturation_reached);
  console.log("STOP:",report.summary.stop_reason);
  console.log("VERDICT:",report.summary.final_verdict);
  console.log("REPORT =",file);
}

run().catch(e=>{
  console.error("FATAL",e);
  process.exit(1);
});
