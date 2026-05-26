const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance, monitorEventLoopDelay}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});

function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}

if(!isMainThread){
  const {loops, cryptoMb}=workerData;
  const t0=performance.now();
  let acc=0;
  for(let i=1;i<=loops;i++){
    acc += Math.sqrt(i)*Math.sin(i%997)+Math.log1p(i%991);
    if((i&4095)===0) acc%=1000000007;
  }
  const buf=crypto.randomBytes(cryptoMb*1024*1024);
  const hash=crypto.createHash("sha256").update(buf).digest("hex");
  parentPort.postMessage({
    ok:true,
    ms:+(performance.now()-t0).toFixed(2),
    loops,
    cryptoMb,
    checksum:+acc.toFixed(3),
    hash:hash.slice(0,16)
  });
  return;
}

function host(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const flags=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const has=f=>flags.split(/\s+/).includes(f);
  return {
    cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    ram_gb:gb(os.totalmem()),
    free_ram_gb:gb(os.freemem()),
    codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
    simd:{avx:has("avx"),avx2:has("avx2"),avx512f:has("avx512f"),fma:has("fma"),aes:has("aes"),sha_ni:has("sha_ni")}
  };
}

function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:mb(m.rss),
    heap_mb:mb(m.heapUsed),
    external_mb:mb(m.external),
    free_ram_gb:gb(os.freemem())
  };
}

function matrix(n){
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
  return {n,ms:+ms.toFixed(2),gops:+(ops/(ms/1000)/1e9).toFixed(4)};
}

function memory(sizeMb, rounds){
  const n=Math.floor(sizeMb*1024*1024/8);
  const a=new Float64Array(n);
  const b=new Float64Array(n);
  for(let i=0;i<n;i++) a[i]=i%997;
  const t0=performance.now();
  for(let r=0;r<rounds;r++){
    for(let i=0;i<n;i++) b[i]=a[i]*1.000001+b[i]*0.000001;
  }
  const ms=performance.now()-t0;
  const moved=sizeMb*1024*1024*rounds*2;
  return {size_mb:sizeMb,rounds,ms:+ms.toFixed(2),gb_s:+((moved/(ms/1000))/1073741824).toFixed(3)};
}

function hash(sizeMb, rounds){
  const buf=crypto.randomBytes(sizeMb*1024*1024);
  const t0=performance.now();
  let h="";
  for(let i=0;i<rounds;i++) h=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
  const ms=performance.now()-t0;
  return {total_mb:sizeMb*rounds,ms:+ms.toFixed(2),mb_s:+((sizeMb*rounds)/(ms/1000)).toFixed(2),hash:h.slice(0,16)};
}

function comp(sizeMb){
  const buf=crypto.randomBytes(sizeMb*1024*1024);
  const t0=performance.now();
  const gz=zlib.gzipSync(buf,{level:1});
  const out=zlib.gunzipSync(gz);
  const ms=performance.now()-t0;
  return {input_mb:sizeMb,ms:+ms.toFixed(2),mb_s:+(sizeMb/(ms/1000)).toFixed(2),integrity:out.length===buf.length};
}

async function workers(count, loops, cryptoMb, timeoutMs){
  const t0=performance.now();
  const jobs=[];
  for(let i=0;i<count;i++){
    jobs.push(new Promise(resolve=>{
      const w=new Worker(__filename,{workerData:{loops,cryptoMb}});
      const timer=setTimeout(()=>{try{w.terminate();}catch(e){} resolve({ok:false,error:"timeout"});},timeoutMs);
      w.on("message",m=>{clearTimeout(timer);resolve(m);});
      w.on("error",e=>{clearTimeout(timer);resolve({ok:false,error:e.message});});
      w.on("exit",c=>{if(c!==0){clearTimeout(timer);resolve({ok:false,error:"exit_"+c});}});
    }));
  }
  const r=await Promise.all(jobs);
  const ms=performance.now()-t0;
  const ok=r.filter(x=>x.ok).length;
  return {count,ok,failed:count-ok,loops,total_loops:count*loops,ms:+ms.toFixed(2),loops_s:+((count*loops)/(ms/1000)).toFixed(2),results:r};
}

function levels(){
  const arr=[];
  for(let l=1;l<=12;l++){
    arr.push({
      level:l,
      matrixN:128+l*12,
      memMb:32+l*12,
      memRounds:2+Math.floor(l/3),
      hashMb:16+l*4,
      hashRounds:4+Math.floor(l/2),
      compMb:8+l*3,
      workers:Math.min(2+Math.floor(l/4), os.cpus().length, 4),
      loops:700000+l*350000,
      workerCryptoMb:1+Math.floor(l/4),
      timeout:18000+l*2500
    });
  }
  return arr;
}

function score(x){
  return +(x.level*8 + Math.min(20,x.results.matrix.gops*28) + Math.min(20,x.results.memory.gb_s*2.2) + Math.min(20,x.results.hash.mb_s/45) + Math.min(15,x.results.comp.mb_s/25) + Math.min(25,x.results.workers.loops_s/120000)).toFixed(2);
}

(async()=>{
  const h=host();
  const mon=monitorEventLoopDelay({resolution:20});
  mon.enable();

  const report={
    name:"TRILLIONX_LADDER_SATURATION_BENCH",
    version:"V1",
    time:new Date().toISOString(),
    executed_by:"TRILLIONX",
    executed_on:h.codespaces?"CODESPACES_VIRTUALIZED_HOST":"LOCAL_HOST",
    host:h,
    levels:[],
    truth_policy:{real_only:true,controlled_ladder:true,no_fake_cpu:true}
  };

  console.log("=== TRILLIONX LADDER SATURATION BENCH ===");
  console.log("HOST:",h.cpu_model);
  console.log("SIMD:",JSON.stringify(h.simd));

  for(const cfg of levels()){
    mon.reset();
    const before=mem();
    const t0=performance.now();

    console.log(`\n--- LADDER LEVEL ${cfg.level} ---`);

    let results;
    try{
      results={
        matrix:matrix(cfg.matrixN),
        memory:memory(cfg.memMb,cfg.memRounds),
        hash:hash(cfg.hashMb,cfg.hashRounds),
        comp:comp(cfg.compMb),
        workers:await workers(cfg.workers,cfg.loops,cfg.workerCryptoMb,cfg.timeout)
      };
    }catch(e){
      report.stop_reason="ERROR_"+e.message;
      report.levels.push({level:cfg.level,config:cfg,before,error:e.message,after:mem()});
      break;
    }

    const ms=performance.now()-t0;
    const after=mem();
    const p95=+(mon.percentile(95)/1e6).toFixed(2);
    const item={level:cfg.level,config:cfg,before,after,ms:+ms.toFixed(2),event_loop_p95_ms:p95,results};
    item.score=score(item);

    const flags=[];
    if(after.rss_mb>850) flags.push("RSS_HIGH");
    if(after.free_ram_gb<0.35) flags.push("FREE_RAM_LOW");
    if(p95>350) flags.push("EVENT_LOOP_HIGH");
    if(ms>35000) flags.push("LEVEL_SLOW");
    if(results.workers.failed>0) flags.push("WORKER_FAIL");

    item.flags=flags;
    report.levels.push(item);

    console.log("MATRIX GOPS:",results.matrix.gops);
    console.log("MEM GB/S:",results.memory.gb_s);
    console.log("HASH MB/S:",results.hash.mb_s);
    console.log("COMP MB/S:",results.comp.mb_s);
    console.log("WORKER LOOPS/S:",results.workers.loops_s);
    console.log("RSS MB:",after.rss_mb);
    console.log("EVENT LOOP P95:",p95);
    console.log("SCORE:",item.score);
    console.log("FLAGS:",flags.join(",")||"NONE");

    if(flags.length){
      report.stop_reason="CONTROLLED_STOP_"+flags.join("_");
      break;
    }

    await new Promise(r=>setTimeout(r,250));
  }

  mon.disable();

  const maxLevel=Math.max(...report.levels.map(x=>x.level||0),0);
  const maxScore=Math.max(...report.levels.map(x=>x.score||0),0);
  report.summary={
    max_level_reached:maxLevel,
    max_score:+maxScore.toFixed(2),
    stop_reason:report.stop_reason||"NO_SATURATION_IN_LADDER",
    verdict:report.stop_reason?"SATURATION_OR_LIMIT_FOUND":"TRILLIONX_STABLE_ON_ALL_LADDER_LEVELS",
    reading:"Finer progressive ladder; avoids huge level jumps that can kill Codespaces abruptly."
  };

  const file=`data/trillionx_ladder_saturation_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_ladder_saturation_latest.json",JSON.stringify(report,null,2));

  console.log("\n=== SUMMARY ===");
  console.log("MAX LEVEL:",report.summary.max_level_reached);
  console.log("MAX SCORE:",report.summary.max_score);
  console.log("STOP:",report.summary.stop_reason);
  console.log("VERDICT:",report.summary.verdict);
  console.log("REPORT =",file);
})();
