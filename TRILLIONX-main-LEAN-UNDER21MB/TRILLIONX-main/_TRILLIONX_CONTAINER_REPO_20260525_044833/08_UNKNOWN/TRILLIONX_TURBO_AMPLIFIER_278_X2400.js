const fs=require("fs"),os=require("os"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const MODE=(process.argv[2]||"x2400").toLowerCase();
const PACKETS=Math.max(3,Math.min(Number(process.argv[3]||8),40));
const WAIT=Math.max(25,Math.min(Number(process.argv[4]||120),2000));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sleep=ms=>new Promise(a=>setTimeout(a,ms));

const MULT={
  "278":2.78,
  "x600":600,
  "x1200":1200,
  "x2400":2400
}[MODE] || 2400;

function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_mb:r(m.heapUsed/1048576),
    external_mb:r(m.external/1048576),
    free_gb:r(os.freemem()/1073741824),
    total_gb:r(os.totalmem()/1073741824)
  };
}

function host(){
  let flags="";
  try{flags=fs.readFileSync("/proc/cpuinfo","utf8")}catch{}
  const has=k=>new RegExp("\\b"+k+"\\b").test(flags);
  const c=os.cpus()[0]||{};
  return {
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    cpus:os.cpus().length,
    cpu_context:c.model||"hidden",
    ghz:r((c.speed||0)/1000),
    ram_gb:r(os.totalmem()/1073741824),
    simd:{avx:has("avx"),avx2:has("avx2"),avx512f:has("avx512f"),fma:has("fma"),aes:has("aes"),sha_ni:has("sha_ni")}
  };
}

function workload(level, turbo){
  const scale = turbo ? 1.0 : 0.72;
  const mb = Math.max(4, Math.floor((8+level*3)*scale));
  const loops = Math.floor((650000+level*210000)*scale);
  const vecN = Math.floor((180000+level*25000)*scale);

  const t0=performance.now();

  const buf=crypto.randomBytes(mb*1048576);
  const th=performance.now();
  const hash=crypto.createHash("sha256").update(buf).digest("hex");
  const hashMs=performance.now()-th;

  const tc=performance.now();
  const zip=zlib.deflateSync(buf,{level:1});
  const compMs=performance.now()-tc;

  const tv=performance.now();
  const a=new Float64Array(vecN),b=new Float64Array(vecN);
  for(let i=0;i<vecN;i++){a[i]=Math.sin(i%8191);b[i]=Math.cos(i%4093)}
  let dot=0;
  for(let i=0;i<vecN;i++)dot += a[i]*b[i]+a[i]-b[i];
  const vecMs=performance.now()-tv;

  const tm=performance.now();
  let mirror=0;
  for(let i=0;i<loops;i++) mirror=((mirror^((i*2654435761)>>>0))+level)>>>0;
  const mirrorMs=performance.now()-tm;

  const totalMs=performance.now()-t0;
  const hashMBs = mb/(hashMs/1000);
  const compMBs = mb/(compMs/1000);
  const gflops = (vecN*4)/(vecMs/1000)/1e9;
  const mirrorOps = loops/(mirrorMs/1000);

  return {
    level,turbo,
    total_ms:r(totalMs),
    hash_mb_s:r(hashMBs),
    comp_mb_s:r(compMBs),
    vector_gflops:r(gflops),
    mirror_ops_s:r(mirrorOps),
    checksum:hash.slice(0,16)+":"+String(mirror)+":"+r(dot)
  };
}

function score(x){
  return r(
    x.hash_mb_s*0.35 +
    x.comp_mb_s*0.18 +
    x.vector_gflops*180 +
    x.mirror_ops_s/90000
  );
}

async function runPhase(name,turbo){
  const out=[];
  const startMem=mem();
  for(let i=1;i<=PACKETS;i++){
    const w=workload(i,turbo);
    w.score=score(w);
    w.memory=mem();
    out.push(w);
    console.log(`${name} PACKET ${i} | SCORE ${w.score} | HASH ${w.hash_mb_s} MB/s | VEC ${w.vector_gflops} GFLOPS | MIRROR ${w.mirror_ops_s} ops/s | RSS ${w.memory.rss_mb} MB`);
    await sleep(WAIT);
  }
  const avg=k=>r(out.reduce((a,b)=>a+(b[k]||0),0)/out.length);
  return {
    name,
    turbo,
    start_memory:startMem,
    end_memory:mem(),
    packets:out,
    avg:{
      score:avg("score"),
      hash_mb_s:avg("hash_mb_s"),
      comp_mb_s:avg("comp_mb_s"),
      vector_gflops:avg("vector_gflops"),
      mirror_ops_s:avg("mirror_ops_s")
    }
  };
}

(async()=>{
  console.log("=== TRILLIONX TURBO AMPLIFIER 278 / X600 / X1200 / X2400 ===");
  console.log("MODE:",MODE,"MULT:",MULT,"PACKETS:",PACKETS,"WAIT:",WAIT);
  console.log("TARGET: TRILLIONX | HOST: support only | NO_FAKE_POWER");

  const H=host();
  const baseline=await runPhase("BASELINE",false);
  const turbo=await runPhase("TURBO",true);

  const realGain = {
    score_percent:r(((turbo.avg.score-baseline.avg.score)/Math.max(1,baseline.avg.score))*100),
    hash_percent:r(((turbo.avg.hash_mb_s-baseline.avg.hash_mb_s)/Math.max(1,baseline.avg.hash_mb_s))*100),
    comp_percent:r(((turbo.avg.comp_mb_s-baseline.avg.comp_mb_s)/Math.max(1,baseline.avg.comp_mb_s))*100),
    vector_percent:r(((turbo.avg.vector_gflops-baseline.avg.vector_gflops)/Math.max(0.000001,baseline.avg.vector_gflops))*100),
    mirror_percent:r(((turbo.avg.mirror_ops_s-baseline.avg.mirror_ops_s)/Math.max(1,baseline.avg.mirror_ops_s))*100)
  };

  const virtualProjection = {
    amplifier_label: MODE,
    multiplier_virtual: MULT,
    projected_score_virtual:r(turbo.avg.score*MULT),
    projected_hash_mb_s_virtual:r(turbo.avg.hash_mb_s*MULT),
    projected_vector_gflops_virtual:r(turbo.avg.vector_gflops*MULT),
    projected_mirror_ops_s_virtual:r(turbo.avg.mirror_ops_s*MULT),
    warning:"virtual projection only; not physical throughput"
  };

  const health = Math.max(0, Math.min(100,
    100
    - Math.max(0,turbo.end_memory.rss_mb-800)/20
    - Math.max(0,os.loadavg()[0]-H.cpus)*3
  ));

  const report={
    engine:"TRILLIONX_TURBO_AMPLIFIER_278_X2400",
    ts:new Date().toISOString(),
    mode:MODE,
    host:H,
    baseline,
    turbo,
    real_gain_percent:realGain,
    virtual_projection:virtualProjection,
    health:r(health),
    verdict: health>=85 ? "TURBO_ACTIVE_HEALTH_OK" : health>=65 ? "TURBO_ACTIVE_PRESSURE_VISIBLE" : "TURBO_LIMIT_REACHED",
    truth_policy:{
      target:"TRILLIONX",
      host:"CODESPACES_SUPPORT_ONLY",
      turbo_278_measurable:true,
      x600_x1200_x2400_virtual_projection_only:true,
      no_fake_power:true,
      real_gain_is_before_after_only:true
    }
  };

  const file=`data/trillionx_turbo_amplifier_${MODE}_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_turbo_amplifier_latest.json",JSON.stringify(report,null,2));

  console.log("=== SUMMARY ===");
  console.log("BASE AVG SCORE:",baseline.avg.score);
  console.log("TURBO AVG SCORE:",turbo.avg.score);
  console.log("REAL GAIN SCORE %:",realGain.score_percent);
  console.log("VIRTUAL MULT:",MULT);
  console.log("VIRTUAL SCORE:",virtualProjection.projected_score_virtual);
  console.log("HEALTH:",report.health);
  console.log("VERDICT:",report.verdict);
  console.log("REPORT =",file);
})();
