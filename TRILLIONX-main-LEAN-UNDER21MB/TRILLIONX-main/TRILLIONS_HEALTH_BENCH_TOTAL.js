const http=require("http");
const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const BASE=process.env.TRILLIONS_URL||"http://127.0.0.1:3000";
const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

const routes=[
  "/api/ping",
  "/api/system",
  "/api/network",
  "/api/repo",
  "/api/cockpit",
  "/api/capacity",
  "/api/full",
  "/api/launcher/verdict",
  "/api/repo-bootstrap/verdict",
  "/api/boot-truth-control",
  "/api/self-test/run",
  "/api/route-registry/summary",
  "/api/auto-detect/verdict",
  "/api/recognition/mandatory",
  "/api/multimeter",
  "/api/multiplier",
  "/api/multiprogram/run",
  "/api/network-open/verdict",
  "/api/devirtualize/verdict",
  "/api/launch-engine/verdict",
  "/api/launch-engine/vs10/verdict",
  "/api/provider-router/health",
  "/api/benchmark-truth-v2/verdict",
  "/api/big-modules/full",
  "/api/gpu/cuda",
  "/api/media/ffmpeg",
  "/api/sqlite",
  "/api/storage-cache",
  "/api/compression",
  "/api/observability",
  "/api/metrics-basic",
  "/api/modules",
  "/api/security",
  "/api/supercompute"
];

function get(path,timeout=12000){
  return new Promise(resolve=>{
    const t0=performance.now();
    const req=http.get(BASE+path,res=>{
      let data="";
      res.on("data",d=>data+=d);
      res.on("end",()=>{
        const ms=+(performance.now()-t0).toFixed(2);
        let json=null;
        try{json=JSON.parse(data)}catch(e){}
        resolve({
          path,
          ok:res.statusCode>=200&&res.statusCode<300,
          status:res.statusCode,
          ms,
          bytes:Buffer.byteLength(data),
          json,
          text:json?undefined:data.slice(0,400)
        });
      });
    });
    req.on("error",e=>resolve({path,ok:false,status:0,ms:+(performance.now()-t0).toFixed(2),error:e.message}));
    req.setTimeout(timeout,()=>{req.destroy();resolve({path,ok:false,status:0,ms:timeout,error:"timeout"});});
  });
}

function localBench(){
  const cpu0=process.cpuUsage();
  const t0=performance.now();

  let x=0;
  for(let i=0;i<3_000_000;i++) x+=Math.sqrt(i)^Math.sin(i);

  const buf=crypto.randomBytes(4*1024*1024);
  const h=crypto.createHash("sha256").update(buf).digest("hex");

  const cpu=process.cpuUsage(cpu0);
  const ms=performance.now()-t0;
  return {
    ok:true,
    type:"REAL_MEASURED_LOCAL_NODE",
    duration_ms:+ms.toFixed(2),
    math_iterations:3_000_000,
    random_hash_mb:4,
    sha256:h.slice(0,32),
    cpu_user_ms:+(cpu.user/1000).toFixed(2),
    cpu_system_ms:+(cpu.system/1000).toFixed(2),
    rss_mb:+(process.memoryUsage().rss/1048576).toFixed(2),
    heap_used_mb:+(process.memoryUsage().heapUsed/1048576).toFixed(2)
  };
}

function classify(results){
  const ok=results.filter(r=>r.ok).length;
  const total=results.length;
  const avg=results.filter(r=>r.ok).reduce((a,b)=>a+b.ms,0)/Math.max(ok,1);
  const failed=results.filter(r=>!r.ok);
  const slow=results.filter(r=>r.ok&&r.ms>2000);
  const critical=[
    "/api/ping",
    "/api/system",
    "/api/launcher/verdict",
    "/api/repo-bootstrap/verdict",
    "/api/auto-detect/verdict",
    "/api/recognition/mandatory"
  ];
  const critical_failed=results.filter(r=>critical.includes(r.path)&&!r.ok);

  let classif="A";
  if(critical_failed.length) classif="C";
  else if(failed.length>total*0.30) classif="C";
  else if(failed.length>0||slow.length>5) classif="B";
  else if(avg>1000) classif="B+";
  else classif="A";

  return {
    classification:classif,
    ok_routes:ok,
    total_routes:total,
    success_percent:+(ok/total*100).toFixed(2),
    avg_latency_ms:+avg.toFixed(2),
    failed_routes:failed.map(x=>({path:x.path,status:x.status,error:x.error||x.text})),
    slow_routes:slow.map(x=>({path:x.path,ms:x.ms})),
    critical_failed:critical_failed.map(x=>x.path),
    verdict:
      classif==="A" ? "HEALTH_TOTAL_OK" :
      classif==="B+" ? "HEALTH_OK_WITH_LATENCY" :
      classif==="B" ? "HEALTH_PARTIAL_CHECK_WARNINGS" :
      "HEALTH_FAIL_CRITICAL_ROUTE_OR_MANY_FAILURES"
  };
}

(async()=>{
  console.log("=== TRILLIONS HEALTH BENCH TOTAL ===");
  console.log("BASE =",BASE);
  const started=new Date().toISOString();

  const results=[];
  for(const r of routes){
    const x=await get(r);
    results.push(x);
    console.log(`${x.ok?"OK ":"KO "} ${String(x.ms).padStart(8)} ms ${r}`);
  }

  const bench=localBench();
  const summary=classify(results);
  const report={
    name:"TRILLIONS_HEALTH_BENCH_TOTAL",
    time:started,
    host:{
      hostname:os.hostname(),
      platform:process.platform,
      arch:process.arch,
      node:process.version,
      cpus:os.cpus().length,
      ram_gb:+(os.totalmem()/1073741824).toFixed(2)
    },
    doctrine:"REAL_MEASURED_OR_UNAVAILABLE_NO_FAKE_METRICS",
    mandatory_detection:{
      required:true,
      routes:[
        "/api/auto-detect/verdict",
        "/api/recognition/mandatory",
        "/api/launcher/verdict",
        "/api/repo-bootstrap/verdict"
      ]
    },
    summary,
    local_benchmark:bench,
    routes:results.map(r=>({
      path:r.path,
      ok:r.ok,
      status:r.status,
      ms:r.ms,
      bytes:r.bytes,
      error:r.error,
      recognition:
        r.ok ? "REAL_ROUTE_RESPONDED" :
        "UNAVAILABLE_OR_ROUTE_FAILED"
    }))
  };

  const file=`${OUTDIR}/trillions_health_bench_total_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillions_health_bench_total_latest.json`,JSON.stringify(report,null,2));

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary,null,2));
  console.log("\n=== LOCAL BENCH ===");
  console.log(JSON.stringify(bench,null,2));
  console.log("\nREPORT =",file);
})();
