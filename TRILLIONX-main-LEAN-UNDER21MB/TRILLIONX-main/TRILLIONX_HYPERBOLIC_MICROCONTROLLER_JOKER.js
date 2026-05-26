const fs=require("fs"), os=require("os"), crypto=require("crypto"), http=require("http");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("controllers",{recursive:true});

const r=x=>Number.isFinite(x)?+x.toFixed(6):0;
const now=()=>new Date().toISOString();

function readJson(p,d=null){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return d}}
function sha(o){return crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex")}

const SOURCES={
  joker_external_public_status:"NO_CLEAR_PUBLIC_TECH_STANDARD_FOUND_FOR_TRILLIONX_JOKER_1_1_2_0",
  joker_math_note:"Public search mostly finds Joker modules in algebraic topology; TRILLIONX Joker is treated as internal controller profile.",
  hyperbolic_note:"Hyperbolic graph methods are suitable for hierarchical / high-curvature structure maps."
};

const JOKER={
  "1.1":{
    name:"JOKER_1_1_STABILITY_GUARD",
    role:"stability, rollback, health, contradiction guard",
    rules:[
      "NO_FAKE_POWER",
      "NO_FAKE_GPU",
      "NO_FAKE_VR",
      "REAL_ONLY_OR_UNAVAILABLE",
      "HEALTH_BEFORE_SCORE",
      "ROLLBACK_ON_PRESSURE",
      "CODESPACES_SUPPORT_ONLY"
    ],
    thresholds:{health_min:72,rss_mb_max:1200,latency_ms_max:1500,error_max:3}
  },
  "2.0":{
    name:"JOKER_2_0_ADAPTIVE_AMPLIFIER",
    role:"adaptive routing, packet scaling, mirror/cache balancing, mesh aggregation",
    rules:[
      "AUTO_DETECT_REQUIRED",
      "PACKETIZE_HEAVY_WORK",
      "AMPLIFY_ONLY_AS_VIRTUAL_PROJECTION",
      "MEASURE_REAL_GAIN_SEPARATELY",
      "SHARE_VR_CACHE",
      "RAID60_PLUS_PROTECT"
    ],
    thresholds:{target_health:88,packet_scale_max:2400,mirror_ratio_min:0.60,cache_hit_min:0.33}
  }
};

function hyperbolicScore(x){
  const h=Math.max(0,Math.min(100,x.health||0));
  const routes=Math.log1p(x.routes||0);
  const api=Math.log1p(x.api||0);
  const nodes=Math.log1p(x.nodes||0);
  const mirrors=Math.log1p(x.mirrors||0);
  const cache=Math.log1p(x.cache_mb||0);
  const curvature = -1 / (1 + routes + api + nodes + mirrors + cache);
  const control = h + routes*2 + api*1.5 + nodes*4 + mirrors*1.2 + cache*3;
  return {curvature:r(curvature),control_score:r(control),health:h};
}

function collectState(){
  const repo=readJson("data/trillionx_repo_master_index_latest.json",{});
  const mesh20=readJson("data/trillionx_20_node_vr_mesh_latest.json",{});
  const shared=readJson("data/trillionx_shared_vr_cache_bus_latest.json",{});
  const raid=readJson("raid60_plus/latest_manifest.json",{});
  const net=readJson("data/trillionx_network_connections_total_latest.json",{});
  const backend=readJson("data/trillionx_backend_capability_registry_latest.json",{});
  const m=process.memoryUsage();

  const state={
    ts:now(),
    engine:"TRILLIONX_HYPERBOLIC_MICROCONTROLLER",
    repo:{routes:repo.score?.routes||repo.summary?.routes||0,api:repo.score?.api_strings||repo.summary?.api_strings||0,health:repo.health||repo.summary?.health||0},
    mesh:{nodes:mesh20.topology?.nodes_active||0,vr_nodes:mesh20.topology?.vr_nodes_active||0,health:mesh20.aggregate?.health||0},
    shared:{mirrors:shared.aggregate?.total_mirrors||0,mirror_ops_s:shared.aggregate?.total_mirror_ops_s||0,cache_mb:shared.aggregate?.total_cache_mb||0,cache_hit_ratio:shared.aggregate?.cache_hit_ratio||0,health:shared.health||0},
    raid:{protected_files:raid.summary?.protected_files||0,stripes:raid.summary?.stripes||0,parity_blocks:raid.summary?.parity_blocks||0},
    network:{ports:net.summary?.ports_detected||0,health:net.summary?.health||0},
    backend:{gpu:backend.gpu?.status||backend.verdict||"UNKNOWN",vr:backend.vr?.status||"UNKNOWN"},
    memory:{rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),free_gb:r(os.freemem()/1073741824)}
  };

  const inputs={
    health:Math.max(state.repo.health,state.mesh.health,state.shared.health,state.network.health,0),
    routes:state.repo.routes,
    api:state.repo.api,
    nodes:state.mesh.nodes,
    mirrors:state.shared.mirrors,
    cache_mb:state.shared.cache_mb
  };
  state.hyperbolic=hyperbolicScore(inputs);
  return state;
}

function decide(state){
  const actions=[];
  let mode="STABLE_CONTROL";

  if(state.memory.rss_mb > JOKER["1.1"].thresholds.rss_mb_max){
    mode="ROLLBACK_PRESSURE";
    actions.push("JOKER_1_1_MEMORY_ROLLBACK");
  }
  if((state.shared.cache_hit_ratio||0) < JOKER["2.0"].thresholds.cache_hit_min){
    actions.push("JOKER_2_0_CACHE_REBALANCE");
  }
  if((state.mesh.nodes||0) < 20){
    actions.push("MESH_RESTART_RECOMMENDED");
  }
  if((state.network.health||0) < 70){
    actions.push("NETWORK_RESCAN_RECOMMENDED");
  }
  if(String(state.backend.gpu).includes("UNAVAILABLE")){
    actions.push("GPU_PROFILE_ONLY_KEEP_NO_FAKE_GPU");
  }

  if(actions.length===0) actions.push("NO_ACTION_SYSTEM_STABLE");

  const verdict =
    mode==="ROLLBACK_PRESSURE" ? "CONTROL_PRESSURE_ROLLBACK_REQUIRED" :
    state.hyperbolic.health>=88 ? "HYPERBOLIC_CONTROL_EXCELLENT" :
    state.hyperbolic.health>=70 ? "HYPERBOLIC_CONTROL_GOOD" :
    "HYPERBOLIC_CONTROL_REVIEW";

  return {mode,actions,verdict};
}

function makeReport(){
  const state=collectState();
  const decision=decide(state);
  const report={
    engine:"TRILLIONX_HYPERBOLIC_MICROCONTROLLER_JOKER",
    version:"V1",
    ts:now(),
    sources:SOURCES,
    joker:JOKER,
    state,
    decision,
    truth_policy:{
      real_only:true,
      joker_is_internal_trillionx_profile:true,
      no_external_standard_claim:true,
      no_fake_gpu:true,
      no_fake_vr:true,
      hyperbolic_controller_is_software_runtime:true
    },
    signature:sha({state,decision,JOKER})
  };
  const file=`data/trillionx_hyperbolic_microcontroller_joker_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_hyperbolic_microcontroller_joker_latest.json",JSON.stringify(report,null,2));
  fs.writeFileSync("controllers/hyperbolic_microcontroller_joker_latest.json",JSON.stringify(report,null,2));
  return {file,report};
}

function startServer(port=3033){
  const server=http.createServer((req,res)=>{
    if(req.url==="/"||req.url==="/health"||req.url==="/api/hyperbolic-controller"){
      const {report}=makeReport();
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify({
        engine:report.engine,
        verdict:report.decision.verdict,
        mode:report.decision.mode,
        actions:report.decision.actions,
        curvature:report.state.hyperbolic.curvature,
        control_score:report.state.hyperbolic.control_score,
        health:report.state.hyperbolic.health,
        signature:report.signature
      },null,2));
      return;
    }
    res.statusCode=404;res.end("not found");
  });
  server.listen(port,"127.0.0.1",()=>console.log("HYPERBOLIC MICROCONTROLLER ACTIVE http://127.0.0.1:"+port));
}

const mode=process.argv[2]||"run";
if(mode==="server") startServer(Number(process.argv[3]||3033));
else {
  const {file,report}=makeReport();
  console.log("=== TRILLIONX HYPERBOLIC MICROCONTROLLER + JOKER ===");
  console.log("CURVATURE:",report.state.hyperbolic.curvature);
  console.log("CONTROL SCORE:",report.state.hyperbolic.control_score);
  console.log("MODE:",report.decision.mode);
  console.log("ACTIONS:",report.decision.actions.join(","));
  console.log("VERDICT:",report.decision.verdict);
  console.log("REPORT =",file);
}
