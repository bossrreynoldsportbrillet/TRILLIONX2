const fs=require("fs"),os=require("os"),cp=require("child_process"),http=require("http");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const LOOP_MS=Number(process.argv[2]||15000);
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=(c,t=8000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:t}).trim()}catch(e){return String(e.stderr||e.message||"")}};
const hasFile=f=>fs.existsSync(f);
const now=()=>new Date().toISOString();

const RUNTIMES=[
  {
    name:"APP_JS_CORE",
    check:"curl -fsS http://127.0.0.1:3000/api/mobile-health >/dev/null || curl -fsS http://127.0.0.1:3000/ >/dev/null",
    start:"PORT=3000 TRILLIONX_COMPACT_OUTPUT=1 TRILLIONX_OUTPUT_MAX=2500 nohup node app.js > logs/app.core.log 2>&1 &",
    port:3000,
    mandatory:true
  },
  {
    name:"FIRMWARE_STAGE0",
    check:"test -f data/trillionx_firmware_stage0_latest.json",
    start:"node TRILLIONX_FIRMWARE_STAGE0.js > logs/firmware_stage0.log 2>&1",
    mandatory:true
  },
  {
    name:"USEFUL_WORK_RUNTIME",
    check:"curl -fsS http://127.0.0.1:3044/api/useful-runtime >/dev/null",
    start:"nohup node TRILLIONX_USEFUL_WORK_RUNTIME.js server 3044 > runtime_state/useful_work_runtime.log 2>&1 &",
    port:3044,
    mandatory:true
  },
  {
    name:"HYPERBOLIC_JOKER_CONTROLLER",
    check:"curl -fsS http://127.0.0.1:3033/api/hyperbolic-controller >/dev/null",
    start:"nohup node TRILLIONX_HYPERBOLIC_MICROCONTROLLER_JOKER.js server 3033 > controllers/hyperbolic_microcontroller.log 2>&1 &",
    port:3033,
    mandatory:true
  },
  {
    name:"MESH_20_VR_NODES",
    check:"test -f data/trillionx_20_node_vr_mesh_latest.json && curl -fsS http://127.0.0.1:3010/vr >/dev/null && curl -fsS http://127.0.0.1:3029/vr >/dev/null",
    start:"./TRILLIONX_20_NODE_VR_MESH_START.sh > logs/mesh20_vr_start.log 2>&1",
    ports:"3010-3029",
    mandatory:true
  },
  {
    name:"SHARED_VR_CACHE_BUS",
    check:"test -f data/trillionx_shared_vr_cache_bus_latest.json",
    start:"node TRILLIONX_SHARED_VR_CACHE_BUS.js make > logs/shared_vr_cache_bus.log 2>&1",
    mandatory:true
  },
  {
    name:"RAID60_PLUS_LOGICAL",
    check:"test -f raid60_plus/latest_manifest.json",
    start:"node TRILLIONX_RAID60_PLUS_LOGICAL_STORAGE.js make > logs/raid60_plus.log 2>&1",
    mandatory:true
  },
  {
    name:"NETWORK_CONNECTIONS_TOTAL",
    check:"test -f data/trillionx_network_connections_total_latest.json",
    start:"node TRILLIONX_NETWORK_CONNECTIONS_TOTAL.js > logs/network_connections_total.log 2>&1",
    mandatory:true
  },
  {
    name:"NETWORK_MICROSECOND_LATENCY",
    check:"test -f data/trillionx_network_microsecond_latency_latest.json",
    start:"node TRILLIONX_NETWORK_MICROSECOND_LATENCY_BENCH.js micro 20 8 2500 > logs/network_microsecond.log 2>&1",
    mandatory:false
  }
];

function checkRuntime(rt){
  const out=sh(rt.check,6000);
  const ok=out==="" || !/curl|failed|No such|not found|Connection refused|error/i.test(out);
  return {ok,out};
}

function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_mb:r(m.heapUsed/1048576),
    free_gb:r(os.freemem()/1073741824),
    total_gb:r(os.totalmem()/1073741824),
    load1:r(os.loadavg()[0])
  };
}

function startRuntime(rt){
  console.log(`[START] ${rt.name}`);
  const out=sh(rt.start,30000);
  if(out) console.log(out.slice(-1200));
}

async function cycle(){
  const results=[];
  console.log("\n=== TRILLIONX RUNTIME CONSTANT ACTIVATION CYCLE ===",now());

  for(const rt of RUNTIMES){
    const c=checkRuntime(rt);
    if(!c.ok){
      startRuntime(rt);
      await new Promise(r=>setTimeout(r,2000));
    }
    const after=checkRuntime(rt);
    results.push({
      name:rt.name,
      mandatory:!!rt.mandatory,
      port:rt.port||rt.ports||null,
      active:after.ok,
      detail:after.ok?"OK":String(after.out||"FAILED").slice(-500)
    });
    console.log(`${rt.name}: ${after.ok?"ACTIVE":"FAILED"}`);
  }

  const active=results.filter(x=>x.active).length;
  const mandatory=results.filter(x=>x.mandatory).length;
  const mandatoryActive=results.filter(x=>x.mandatory&&x.active).length;
  const health=r((mandatoryActive/Math.max(1,mandatory))*100);

  const report={
    engine:"TRILLIONX_RUNTIME_CONSTANT_ACTIVATOR",
    ts:now(),
    loop_ms:LOOP_MS,
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    active,
    total:RUNTIMES.length,
    mandatory_active:mandatoryActive,
    mandatory_total:mandatory,
    health,
    verdict:health>=100?"ALL_MANDATORY_RUNTIMES_ACTIVE":health>=80?"RUNTIMES_PARTIAL_ACTIVE":"RUNTIMES_REVIEW_REQUIRED",
    memory:mem(),
    runtimes:results,
    truth_policy:{
      real_only:true,
      activation_constant:true,
      no_fake_gpu:true,
      no_fake_vr:true,
      codespaces_support_only:true
    }
  };

  fs.writeFileSync("data/trillionx_runtime_constant_activator_latest.json",JSON.stringify(report,null,2));
  fs.writeFileSync("runtime_state/runtime_constant_activator_latest.json",JSON.stringify(report,null,2));

  console.log("HEALTH:",health,report.verdict);
  console.log("MEM:",JSON.stringify(report.memory));
  return report;
}

async function main(){
  const mode=process.argv[3]||"daemon";
  if(mode==="once"){
    await cycle();
    return;
  }
  console.log("TRILLIONX CONSTANT RUNTIME ACTIVATOR STARTED");
  while(true){
    await cycle();
    await new Promise(r=>setTimeout(r,LOOP_MS));
  }
}

main().catch(e=>{console.error(e);process.exit(1)});
