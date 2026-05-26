const http=require("http");
const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const BASE=process.env.TRILLIONS_URL||"http://127.0.0.1:3000";
const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

const critical=[
  "/api/ping",
  "/api/system",
  "/api/network",
  "/api/capacity",
  "/api/modules",
  "/api/security",
  "/api/supercompute"
];

const optional=[
  "/api/launcher/verdict",
  "/api/repo-bootstrap/verdict",
  "/api/auto-detect/verdict",
  "/api/recognition/mandatory",
  "/api/boot-truth-control",
  "/api/self-test/run",
  "/api/route-registry/summary",
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
  "/api/metrics-basic"
];

const routes=[...critical,...optional];

function get(path,timeout=12000){
  return new Promise(resolve=>{
    const t0=performance.now();
    const req=http.get(BASE+path,res=>{
      let data="";
      res.on("data",d=>data+=d);
      res.on("end",()=>{
        const ms=+(performance.now()-t0).toFixed(2);
        let parsed=null;
        try{parsed=JSON.parse(data)}catch(e){}
        const text=String(data||"");
        const notRegistered=res.statusCode===404 && text.includes("Cannot GET");
        resolve({
          path,
          ok:res.statusCode>=200&&res.statusCode<300,
          registered:!notRegistered,
          status:res.statusCode,
          ms,
          bytes:Buffer.byteLength(text),
          json:parsed,
          error:res.statusCode>=400 ? text.slice(0,180) : undefined,
          recognition:
            res.statusCode>=200&&res.statusCode<300 ? "REAL_ROUTE_RESPONDED" :
            notRegistered ? "ROUTE_NOT_REGISTERED" :
            "ROUTE_ERROR_OR_UNAVAILABLE"
        });
      });
    });
    req.on("error",e=>resolve({
      path,ok:false,registered:false,status:0,
      ms:+(performance.now()-t0).toFixed(2),
      error:e.message,
      recognition:"SERVER_UNREACHABLE_OR_NETWORK_ERROR"
    }));
    req.setTimeout(timeout,()=>{req.destroy();resolve({
      path,ok:false,registered:false,status:0,ms:timeout,
      error:"timeout",
      recognition:"TIMEOUT"
    });});
  });
}

function localBench(){
  const cpu0=process.cpuUsage();
  const t0=performance.now();
  let x=0;
  for(let i=0;i<3_000_000;i++) x+=Math.sqrt(i)+Math.sin(i);
  const buf=crypto.randomBytes(4*1024*1024);
  const h=crypto.createHash("sha256").update(buf).digest("hex");
  const cpu=process.cpuUsage(cpu0);
  return {
    ok:true,
    type:"REAL_MEASURED_LOCAL_NODE",
    duration_ms:+(performance.now()-t0).toFixed(2),
    math_iterations:3_000_000,
    random_hash_mb:4,
    sha256:h.slice(0,32),
    cpu_user_ms:+(cpu.user/1000).toFixed(2),
    cpu_system_ms:+(cpu.system/1000).toFixed(2),
    rss_mb:+(process.memoryUsage().rss/1048576).toFixed(2),
    heap_used_mb:+(process.memoryUsage().heapUsed/1048576).toFixed(2),
    checksum:+x.toFixed(3)
  };
}

function classify(results){
  const crit=results.filter(r=>critical.includes(r.path));
  const opt=results.filter(r=>optional.includes(r.path));

  const criticalFailed=crit.filter(r=>!r.ok);
  const ok=results.filter(r=>r.ok).length;
  const registered=results.filter(r=>r.registered).length;
  const notRegistered=results.filter(r=>r.recognition==="ROUTE_NOT_REGISTERED");
  const routeErrors=results.filter(r=>r.recognition==="ROUTE_ERROR_OR_UNAVAILABLE"||r.recognition==="TIMEOUT"||r.recognition==="SERVER_UNREACHABLE_OR_NETWORK_ERROR");
  const avg=results.filter(r=>r.ok).reduce((a,b)=>a+b.ms,0)/Math.max(ok,1);
  const slow=results.filter(r=>r.ok&&r.ms>2000);

  let classification="A";
  let verdict="HEALTH_TOTAL_OK";

  if(criticalFailed.length){
    classification="C";
    verdict="HEALTH_FAIL_CRITICAL_ROUTES";
  }else if(routeErrors.length){
    classification="B";
    verdict="HEALTH_PARTIAL_ROUTE_ERRORS";
  }else if(notRegistered.length>0){
    classification="B+";
    verdict="HEALTH_OK_WITH_OPTIONAL_ROUTES_NOT_REGISTERED";
  }else if(slow.length>3 || avg>1000){
    classification="A-";
    verdict="HEALTH_OK_WITH_LATENCY_WARNINGS";
  }

  return {
    classification,
    verdict,
    ok_routes:ok,
    registered_routes:registered,
    total_tested:results.length,
    critical_ok:crit.filter(r=>r.ok).length+"/"+crit.length,
    optional_ok:opt.filter(r=>r.ok).length+"/"+opt.length,
    success_percent:+(ok/results.length*100).toFixed(2),
    avg_latency_ms:+avg.toFixed(2),
    optional_missing_count:notRegistered.length,
    route_error_count:routeErrors.length,
    slow_routes:slow.map(x=>({path:x.path,ms:x.ms})),
    critical_failed:criticalFailed.map(x=>({path:x.path,status:x.status,recognition:x.recognition,error:x.error})),
    optional_missing:notRegistered.map(x=>x.path),
    action:
      criticalFailed.length ? "Corriger les routes critiques ou vérifier node app.js." :
      notRegistered.length ? "Serveur OK. Les 404 sont des modules optionnels non encore intégrés ou nommés autrement." :
      "Rien de critique détecté."
  };
}

(async()=>{
  console.log("=== TRILLIONS HEALTH BENCH TOTAL V2 ===");
  console.log("BASE =",BASE);
  const results=[];
  for(const r of routes){
    const x=await get(r);
    results.push(x);
    console.log(`${x.ok?"OK ":"-- "} ${String(x.ms).padStart(8)} ms ${r} :: ${x.recognition}`);
  }

  const bench=localBench();
  const summary=classify(results);
  const report={
    name:"TRILLIONS_HEALTH_BENCH_TOTAL_V2",
    time:new Date().toISOString(),
    doctrine:"REAL_MEASURED_OR_UNAVAILABLE_NO_FAKE_METRICS",
    host:{
      hostname:os.hostname(),
      platform:process.platform,
      arch:process.arch,
      node:process.version,
      cpus:os.cpus().length,
      ram_gb:+(os.totalmem()/1073741824).toFixed(2)
    },
    mandatory_detection:{
      required:true,
      critical_routes:critical,
      rule:"Only critical routes fail the health verdict. Optional absent routes are classified as ROUTE_NOT_REGISTERED."
    },
    summary,
    local_benchmark:bench,
    routes:results
  };

  const file=`${OUTDIR}/trillions_health_bench_total_v2_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillions_health_bench_total_latest.json`,JSON.stringify(report,null,2));

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary,null,2));
  console.log("\n=== LOCAL BENCH ===");
  console.log(JSON.stringify(bench,null,2));
  console.log("\nREPORT =",file);
})();
