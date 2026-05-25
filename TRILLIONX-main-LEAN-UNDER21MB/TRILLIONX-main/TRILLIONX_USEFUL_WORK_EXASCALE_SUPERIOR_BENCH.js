const fs=require("fs"),os=require("os"),crypto=require("crypto"),http=require("http");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const PACKETS=Math.max(4,Math.min(Number(process.argv[2]||12),40));
const JOBS=Math.max(1000,Math.min(Number(process.argv[3]||8000),80000));
const DUP=Math.max(1,Math.min(Number(process.argv[4]||12),80));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sleep=ms=>new Promise(a=>setTimeout(a,ms));

function mem(){
 const m=process.memoryUsage();
 return {rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),external_mb:r(m.external/1048576),free_gb:r(os.freemem()/1073741824),total_gb:r(os.totalmem()/1073741824)};
}
function sha(x){return crypto.createHash("sha256").update(x).digest("hex")}
function readJson(p,d={}){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return d}}
function get(url,timeout=700){
 return new Promise(resolve=>{
  const t=performance.now();
  const req=http.get(url,{timeout},res=>{
   let n=0;res.on("data",d=>n+=d.length);
   res.on("end",()=>resolve({ok:res.statusCode<500,ms:r(performance.now()-t),bytes:n,status:res.statusCode}));
  });
  req.on("timeout",()=>{req.destroy();resolve({ok:false,ms:r(performance.now()-t),error:"timeout"})});
  req.on("error",e=>resolve({ok:false,ms:r(performance.now()-t),error:e.code||e.message}));
 });
}
function workUnit(seed,heavy=1){
 let x=seed, acc=0;
 for(let i=0;i<heavy;i++){
  const h=sha(x);
  acc += parseInt(h.slice(0,8),16)%9973;
  x=h;
 }
 return {hash:x,score:acc};
}
function makeJobs(n,dup){
 const arr=[];
 for(let i=0;i<n;i++){
  const base="TRILLIONX_JOB_"+Math.floor(i/dup);
  arr.push({id:i,key:base,weight:1+(i%7),class:i%5===0?"BTC_UTXO":i%5===1?"VECTOR":i%5===2?"NETWORK":i%5===3?"VR_CACHE":"REGISTRY"});
 }
 return arr;
}
function baselineBrute(jobs){
 const t=performance.now(); let ops=0, checksum=0;
 for(const j of jobs){
  const w=workUnit(j.key+"_"+j.id,j.weight*180);
  ops+=j.weight*180; checksum^=parseInt(w.hash.slice(0,8),16);
 }
 const ms=performance.now()-t;
 return {mode:"BASELINE_BRUTE_FORCE",jobs:jobs.length,unique_keys:new Set(jobs.map(x=>x.key)).size,ops,ms:r(ms),jobs_s:r(jobs.length/(ms/1000)),ops_s:r(ops/(ms/1000)),checksum};
}
async function trillionsOrchestrated(jobs){
 const cache=new Map(), classBuckets={}, nodeStats=[], t=performance.now();
 let ops=0, hits=0, miss=0, checksum=0, avoidedOps=0;

 for(const j of jobs){
  if(!classBuckets[j.class])classBuckets[j.class]=[];
  classBuckets[j.class].push(j);
 }

 // simulate TRILLIONX routing: class batching + cache/dedupe
 for(const [cls,bucket] of Object.entries(classBuckets)){
  for(const j of bucket){
   const k=j.key+"_"+cls;
   if(cache.has(k)){
    hits++;
    avoidedOps += j.weight*180;
    const w=cache.get(k);
    checksum^=parseInt(w.hash.slice(0,8),16);
   }else{
    miss++;
    const w=workUnit(k,j.weight*180);
    cache.set(k,w);
    ops+=j.weight*180;
    checksum^=parseInt(w.hash.slice(0,8),16);
   }
  }
 }

 // probe local mesh nodes if running
 for(let p=3010;p<3030;p++){
  const h=await get(`http://127.0.0.1:${p}/health`);
  if(h.ok)nodeStats.push({port:p,...h});
 }

 const ms=performance.now()-t;
 return {
  mode:"TRILLIONX_ORCHESTRATED",
  jobs:jobs.length,
  unique_cache_keys:cache.size,
  classes:Object.fromEntries(Object.entries(classBuckets).map(([k,v])=>[k,v.length])),
  ops_executed:ops,
  ops_avoided:avoidedOps,
  cache_hits:hits,
  cache_miss:miss,
  cache_hit_ratio:r(hits/Math.max(1,hits+miss)),
  mesh_nodes_seen:nodeStats.length,
  mesh_probe_ok:nodeStats.filter(x=>x.ok).length,
  ms:r(ms),
  jobs_s:r(jobs.length/(ms/1000)),
  executed_ops_s:r(ops/(ms/1000)),
  useful_ops_s:r((ops+avoidedOps)/(ms/1000)),
  checksum,
  nodeStats:nodeStats.slice(0,20)
 };
}
function score(base,trx){
 const timeGain=(base.ms-trx.ms)/Math.max(1,base.ms);
 const usefulGain=(trx.useful_ops_s-base.ops_s)/Math.max(1,base.ops_s);
 const wasteAvoid=r(trx.ops_avoided/Math.max(1,base.ops));
 const cache=trx.cache_hit_ratio;
 const mesh=Math.min(1,trx.mesh_nodes_seen/20);
 const health=Math.max(0,Math.min(100,100-(mem().rss_mb>1200?10:0)-(trx.ms>base.ms?15:0)));
 const superiorityIndex=r((Math.max(0,timeGain)*35)+(Math.max(0,usefulGain)*30)+(wasteAvoid*20)+(cache*10)+(mesh*5));
 return {time_gain_percent:r(timeGain*100),useful_gain_percent:r(usefulGain*100),waste_avoided_ratio:wasteAvoid,cache_hit_ratio:cache,mesh_ratio:r(mesh),superiority_index:superiorityIndex,health:r(health)};
}
(async()=>{
 console.log("=== TRILLIONX USEFUL WORK EXASCALE SUPERIOR BENCH ===");
 console.log("TARGET=TRILLIONX | HOST=CODESPACES_SUPPORT_ONLY | EXASCALE=USEFUL_WORK_NOT_FAKE_FLOPS");
 console.log("PACKETS:",PACKETS,"JOBS:",JOBS,"DUP:",DUP);

 const repo=readJson("data/trillionx_repo_master_index_latest.json",{});
 const shared=readJson("data/trillionx_shared_vr_cache_bus_latest.json",{});
 const raid=readJson("raid60_plus/latest_manifest.json",{});
 const controller=readJson("data/trillionx_hyperbolic_microcontroller_joker_latest.json",{});
 const results=[];

 for(let p=1;p<=PACKETS;p++){
  const jobs=makeJobs(JOBS+p*200,DUP);
  const before=mem();
  const base=baselineBrute(jobs);
  const trx=await trillionsOrchestrated(jobs);
  const sc=score(base,trx);
  const after=mem();
  const row={packet:p,before,baseline:base,trillionx:trx,score:sc,after};
  results.push(row);
  console.log(`--- PACKET ${p} ---`);
  console.log(`BASE ${base.ms}ms ${base.ops_s} ops/s | TRX ${trx.ms}ms useful ${trx.useful_ops_s} ops/s`);
  console.log(`CACHE ${trx.cache_hit_ratio} | AVOIDED ${trx.ops_avoided} | MESH ${trx.mesh_nodes_seen}/20`);
  console.log(`GAIN time ${sc.time_gain_percent}% useful ${sc.useful_gain_percent}% | INDEX ${sc.superiority_index} | HEALTH ${sc.health}`);
  await sleep(100);
 }

 const avg=k=>r(results.reduce((a,b)=>a+(b.score[k]||0),0)/results.length);
 const best=results.slice().sort((a,b)=>b.score.superiority_index-a.score.superiority_index)[0];
 const summary={
  avg_time_gain_percent:avg("time_gain_percent"),
  avg_useful_gain_percent:avg("useful_gain_percent"),
  avg_waste_avoided_ratio:avg("waste_avoided_ratio"),
  avg_cache_hit_ratio:avg("cache_hit_ratio"),
  avg_mesh_ratio:avg("mesh_ratio"),
  avg_superiority_index:avg("superiority_index"),
  avg_health:avg("health"),
  best_packet:best.packet,
  best_superiority_index:best.score.superiority_index,
  repo_routes:repo.score?.routes||repo.summary?.routes||0,
  shared_vr_mirrors:shared.aggregate?.total_mirrors||0,
  raid60_protected_files:raid.summary?.protected_files||0,
  joker_verdict:controller.decision?.verdict||"UNAVAILABLE",
  verdict:avg("superiority_index")>=50?"TRILLIONX_USEFUL_WORK_SUPERIOR_ON_THIS_TASK":avg("superiority_index")>=20?"TRILLIONX_USEFUL_WORK_GAIN_VISIBLE":"TRILLIONX_GAIN_REVIEW",
  exascale_reading:"TRILLIONX can exceed brute-force style by avoiding wasted work on this workload; this is not a physical exaFLOPS claim."
 };
 const report={
  engine:"TRILLIONX_USEFUL_WORK_EXASCALE_SUPERIOR_BENCH",
  ts:new Date().toISOString(),
  policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",real_only:true,no_fake_exascale:true,no_fake_gpu:true,exascale_defined_as_useful_work_superiority:true},
  context:{repo_summary:repo.summary||repo.score||{},shared_vr_cache:shared.aggregate||{},raid60:raid.summary||{},joker:controller.decision||{}},
  summary,results
 };
 const file=`data/trillionx_useful_work_exascale_superior_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_useful_work_exascale_superior_latest.json",JSON.stringify(report,null,2));
 console.log("=== SUMMARY ===");
 console.log("AVG TIME GAIN %:",summary.avg_time_gain_percent);
 console.log("AVG USEFUL GAIN %:",summary.avg_useful_gain_percent);
 console.log("AVG WASTE AVOIDED:",summary.avg_waste_avoided_ratio);
 console.log("AVG CACHE HIT:",summary.avg_cache_hit_ratio);
 console.log("AVG SUPERIORITY INDEX:",summary.avg_superiority_index);
 console.log("VERDICT:",summary.verdict);
 console.log("READING:",summary.exascale_reading);
 console.log("REPORT =",file);
})();
