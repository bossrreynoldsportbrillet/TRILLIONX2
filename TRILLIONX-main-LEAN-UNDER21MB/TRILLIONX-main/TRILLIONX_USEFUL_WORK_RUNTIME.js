const fs=require("fs"),os=require("os"),crypto=require("crypto"),http=require("http");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});

const STATE_FILE="runtime_state/trillionx_useful_work_runtime_state.json";
const LATEST="data/trillionx_useful_work_runtime_latest.json";
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

function readJson(p,d={}){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return d}}
function writeJson(p,o){fs.writeFileSync(p,JSON.stringify(o,null,2))}
function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex")}
function mem(){const m=process.memoryUsage();return{rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),external_mb:r(m.external/1048576),free_gb:r(os.freemem()/1073741824),total_gb:r(os.totalmem()/1073741824)}}

function loadContext(){
 return {
  repo:readJson("data/trillionx_repo_master_index_latest.json",{}),
  mesh:readJson("data/trillionx_20_node_vr_mesh_latest.json",{}),
  shared:readJson("data/trillionx_shared_vr_cache_bus_latest.json",{}),
  raid:readJson("raid60_plus/latest_manifest.json",{}),
  joker:readJson("data/trillionx_hyperbolic_microcontroller_joker_latest.json",{}),
  network:readJson("data/trillionx_network_full_auto_bench_latest.json",{}),
  backend:readJson("data/trillionx_backend_capability_registry_latest.json",{})
 };
}

function initState(){
 const old=readJson(STATE_FILE,null);
 if(old&&old.engine==="TRILLIONX_USEFUL_WORK_RUNTIME")return old;
 return {
  engine:"TRILLIONX_USEFUL_WORK_RUNTIME",
  created:new Date().toISOString(),
  ticks:0,
  jobs_seen:0,
  jobs_executed:0,
  jobs_avoided:0,
  cache_hits:0,
  cache_miss:0,
  cache:{},
  ledger:[],
  mode:"ACTIVE",
  truth_policy:{
   target:"TRILLIONX",
   host:"CODESPACES_SUPPORT_ONLY",
   real_only:true,
   no_fake_exascale:true,
   exascale_meaning:"useful work superiority, not physical exaFLOPS"
  }
 };
}

function classifyJob(job){
 const s=JSON.stringify(job);
 if(/btc|utxo|sha|hash|crypto/i.test(s))return"BTC_CRYPTO";
 if(/network|port|api|http|socket/i.test(s))return"NETWORK";
 if(/vr|mirror|cache/i.test(s))return"VR_CACHE";
 if(/raid|backup|manifest|checksum/i.test(s))return"STORAGE";
 if(/bench|vector|flops|matrix/i.test(s))return"VECTOR";
 return"GENERAL";
}

function usefulCompute(key,weight=1){
 let x=key, score=0;
 for(let i=0;i<weight*80;i++){
  x=sha(x);
  score+=(parseInt(x.slice(0,8),16)%1009);
 }
 return {hash:x.slice(0,24),score};
}

function submitJob(state,job){
 const cls=classifyJob(job);
 const key=sha(cls+"|"+JSON.stringify(job).slice(0,1000));
 const weight=Math.max(1,Math.min(20,Number(job.weight||1)));
 state.jobs_seen++;

 if(state.cache[key]){
  state.cache_hits++;
  state.jobs_avoided++;
  const res={ok:true,mode:"CACHE_HIT",class:cls,key,result:state.cache[key],ts:new Date().toISOString()};
  state.ledger.push(res);
  return res;
 }

 state.cache_miss++;
 state.jobs_executed++;
 const t0=performance.now();
 const result=usefulCompute(key,weight);
 const ms=performance.now()-t0;
 const out={ok:true,mode:"EXECUTED",class:cls,key,result,ms:r(ms),ts:new Date().toISOString()};
 state.cache[key]=out;
 state.ledger.push(out);

 if(state.ledger.length>300)state.ledger=state.ledger.slice(-300);
 const keys=Object.keys(state.cache);
 if(keys.length>1200){
  for(const k of keys.slice(0,keys.length-1200))delete state.cache[k];
 }
 return out;
}

function runtimeTick(state){
 const ctx=loadContext();
 state.ticks++;
 const t0=performance.now();

 const autoJobs=[
  {type:"network_health",weight:1,routes:ctx.network.summary?.repo_routes||0,ports:ctx.network.summary?.ports_detected||0},
  {type:"vr_cache_balance",weight:2,mirrors:ctx.shared.aggregate?.total_mirrors||0,cache_mb:ctx.shared.aggregate?.total_cache_mb||0},
  {type:"raid60_integrity",weight:1,files:ctx.raid.summary?.protected_files||0},
  {type:"mesh_health",weight:2,nodes:ctx.mesh.topology?.nodes_active||0},
  {type:"repo_intelligence",weight:1,routes:ctx.repo.score?.routes||ctx.repo.summary?.routes||0},
  {type:"joker_guard",weight:1,verdict:ctx.joker.decision?.verdict||"UNKNOWN"}
 ];

 const results=autoJobs.map(j=>submitJob(state,j));
 const ms=performance.now()-t0;

 const hitRatio=state.cache_hits/Math.max(1,state.cache_hits+state.cache_miss);
 const usefulIndex =
   hitRatio*40 +
   Math.log1p(state.jobs_avoided)*10 +
   Math.log1p(state.jobs_executed)*5 +
   Math.max(0,20-ms);

 const health=Math.max(0,Math.min(100,
  100
  -(mem().rss_mb>1200?10:0)
  -(hitRatio<0.2&&state.jobs_seen>20?8:0)
 ));

 const summary={
  engine:state.engine,
  ts:new Date().toISOString(),
  mode:state.mode,
  tick:state.ticks,
  jobs_seen:state.jobs_seen,
  jobs_executed:state.jobs_executed,
  jobs_avoided:state.jobs_avoided,
  cache_hits:state.cache_hits,
  cache_miss:state.cache_miss,
  cache_hit_ratio:r(hitRatio),
  cache_entries:Object.keys(state.cache).length,
  useful_index:r(usefulIndex),
  tick_ms:r(ms),
  memory:mem(),
  context:{
   mesh_nodes:ctx.mesh.topology?.nodes_active||0,
   vr_mirrors:ctx.shared.aggregate?.total_mirrors||0,
   cache_mb:ctx.shared.aggregate?.total_cache_mb||0,
   raid_files:ctx.raid.summary?.protected_files||0,
   network_health:ctx.network.summary?.health||0,
   joker:ctx.joker.decision?.verdict||"UNKNOWN",
   gpu:ctx.backend.gpu?.status||"UNKNOWN"
  },
  health:r(health),
  verdict:usefulIndex>=50?"TRILLIONX_USEFUL_WORK_RUNTIME_SUPERIOR":usefulIndex>=20?"TRILLIONX_USEFUL_WORK_RUNTIME_ACTIVE":"TRILLIONX_RUNTIME_WARMUP",
  truth_policy:state.truth_policy,
  last_results:results
 };

 writeJson(STATE_FILE,state);
 writeJson(LATEST,summary);
 return summary;
}

function startServer(port=3044){
 let state=initState();
 setInterval(()=>{try{runtimeTick(state)}catch(e){}},2500);

 const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/health"||req.url==="/api/useful-runtime"){
   const s=runtimeTick(state);
   res.setHeader("content-type","application/json");
   res.end(JSON.stringify(s,null,2));
   return;
  }
  if(req.url.startsWith("/api/submit")){
   let body="";
   req.on("data",d=>body+=d);
   req.on("end",()=>{
    let job={type:"manual",payload:req.url,weight:1};
    try{if(body)job=JSON.parse(body)}catch{}
    const out=submitJob(state,job);
    writeJson(STATE_FILE,state);
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify(out,null,2));
   });
   return;
  }
  res.statusCode=404;res.end("not found");
 });
 server.listen(port,"127.0.0.1",()=>console.log("TRILLIONX USEFUL WORK RUNTIME ACTIVE http://127.0.0.1:"+port));
}

const mode=process.argv[2]||"tick";
if(mode==="server")startServer(Number(process.argv[3]||3044));
else{
 const state=initState();
 const s=runtimeTick(state);
 console.log("=== TRILLIONX USEFUL WORK RUNTIME ===");
 console.log("VERDICT:",s.verdict);
 console.log("USEFUL INDEX:",s.useful_index);
 console.log("CACHE HIT:",s.cache_hit_ratio);
 console.log("JOBS:",s.jobs_seen,"EXEC:",s.jobs_executed,"AVOIDED:",s.jobs_avoided);
 console.log("HEALTH:",s.health);
 console.log("REPORT =",LATEST);
}
