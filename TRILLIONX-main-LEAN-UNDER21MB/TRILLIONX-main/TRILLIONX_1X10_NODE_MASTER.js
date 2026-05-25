"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("mesh_1x10",{recursive:true});
fs.mkdirSync("logs",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});

const MODE=process.argv[2]||"master";
const NODE_ID=Number(process.argv[3]||0);
const MASTER_PORT=3150;
const NODE_BASE=3110;
const NODE_COUNT=10;
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

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

function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex")}

function vrMirror(id,level=1){
 const mirrors=80000+id*15000+level*20000;
 const t0=performance.now();
 let x=0;
 for(let i=0;i<mirrors;i++){
  x=((x^((i*2654435761)>>>0))+id+level)>>>0;
 }
 const ms=performance.now()-t0;
 return {node_id:id,mirrors,ms:r(ms),mirror_ops_s:r(mirrors/(ms/1000)),checksum:x};
}

function cacheWork(id){
 const size=256*1024+id*32768;
 const buf=Buffer.alloc(size);
 let hits=0,miss=0,chk=0;
 const t0=performance.now();
 for(let i=0;i<size;i+=64){
  buf[i]=(i+id)&255;
  chk=(chk+buf[i])>>>0;
  if((i/64)%4===0)hits++; else miss++;
 }
 const ms=performance.now()-t0;
 return {
  bytes:size,
  mb:r(size/1048576),
  ms:r(ms),
  cache_ops_s:r((hits+miss)/(ms/1000)),
  hits,miss,
  hit_ratio:r(hits/Math.max(1,hits+miss)),
  checksum:chk
 };
}

function compute(id){
 const loops=180000+id*25000;
 const t0=performance.now();
 let acc=0;
 for(let i=1;i<=loops;i++){
  acc+=Math.sqrt(i%99991)*Math.sin((i+id)%8191);
  if((i&8191)===0)acc%=1000000007;
 }
 const digest=sha(id+"|"+acc+"|"+loops).slice(0,24);
 const ms=performance.now()-t0;
 return {loops,ms:r(ms),loops_s:r(loops/(ms/1000)),digest,checksum:r(acc)};
}

function startNode(id){
 const port=NODE_BASE+id;
 const name=`TRILLIONX_1X10_NODE_${String(id).padStart(2,"0")}`;
 const created=new Date().toISOString();

 const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/status"){
   res.type="text/plain";
   res.end(`${name} ACTIVE PORT ${port}\n`);
   return;
  }

  if(req.url==="/health"||req.url==="/api/health"){
   const work=compute(id);
   const vr=vrMirror(id,1);
   const cache=cacheWork(id);
   const payload={
    node_id:id,
    node_name:name,
    port,
    status:"ACTIVE",
    created,
    target:"TRILLIONX",
    role:"WORKER_NODE",
    work,
    vr_mirror:vr,
    cache,
    memory:mem(),
    score:r(work.loops_s/1000+vr.mirror_ops_s/100000+cache.cache_ops_s/10000),
    truth_policy:{
     real_only:true,
     node_is_local_runtime_process:true,
     not_physical_machine:true,
     vr_mirror_is_software_runtime:true,
     host:"CODESPACES_SUPPORT_ONLY"
    }
   };
   fs.writeFileSync(`mesh_1x10/node_${id}_latest.json`,JSON.stringify(payload,null,2));
   res.setHeader("content-type","application/json");
   res.end(JSON.stringify(payload,null,2));
   return;
  }

  if(req.url==="/vr"||req.url==="/api/vr"){
   const payload={node_id:id,node_name:name,port,status:"VR_MIRROR_ACTIVE",vr_mirror:vrMirror(id,2),memory:mem()};
   res.setHeader("content-type","application/json");
   res.end(JSON.stringify(payload,null,2));
   return;
  }

  res.statusCode=404;
  res.end("not found");
 });

 server.listen(port,"127.0.0.1",()=>{
  const reg={node_id:id,node_name:name,port,status:"ACTIVE",created,target:"TRILLIONX"};
  fs.writeFileSync(`mesh_1x10/node_${id}.json`,JSON.stringify(reg,null,2));
  console.log(`${name} ACTIVE http://127.0.0.1:${port}`);
 });
}

function get(url,timeout=1800){
 return new Promise(resolve=>{
  const t0=performance.now();
  const req=http.get(url,{timeout},res=>{
   let s="";
   res.on("data",d=>s+=d);
   res.on("end",()=>{
    try{resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),json:JSON.parse(s)})}
    catch{resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),text:s.slice(0,200)})}
   });
  });
  req.on("timeout",()=>{req.destroy();resolve({ok:false,ms:r(performance.now()-t0),error:"timeout"})});
  req.on("error",e=>resolve({ok:false,ms:r(performance.now()-t0),error:e.code||e.message}));
 });
}

async function aggregate(){
 const health=[];
 const vr=[];
 for(let i=0;i<NODE_COUNT;i++){
  health.push(await get(`http://127.0.0.1:${NODE_BASE+i}/health`));
  vr.push(await get(`http://127.0.0.1:${NODE_BASE+i}/vr`));
 }

 const nodes=health.filter(x=>x.json).map(x=>x.json);
 const vrNodes=vr.filter(x=>x.json).map(x=>x.json);

 const totalLoops=nodes.reduce((a,n)=>a+(n.work?.loops_s||0),0);
 const totalMirrorOps=nodes.reduce((a,n)=>a+(n.vr_mirror?.mirror_ops_s||0),0);
 const totalCacheOps=nodes.reduce((a,n)=>a+(n.cache?.cache_ops_s||0),0);
 const totalCacheMB=nodes.reduce((a,n)=>a+(n.cache?.mb||0),0);
 const totalRss=nodes.reduce((a,n)=>a+(n.memory?.rss_mb||0),0);
 const avgLatency=health.reduce((a,x)=>a+(x.ms||0),0)/Math.max(1,health.length);

 const active=nodes.length;
 const vrActive=vrNodes.length;
 const healthScore=Math.max(0,Math.min(100,
  100-(NODE_COUNT-active)*8-(NODE_COUNT-vrActive)*4-(avgLatency>500?8:0)-(totalRss>2500?8:0)
 ));

 const report={
  engine:"TRILLIONX_1X10_NODE_MASTER",
  ts:new Date().toISOString(),
  target:"TRILLIONX",
  host_role:"CODESPACES_SUPPORT_ONLY",
  topology:{
   type:"ONE_MASTER_TEN_WORKER_NODES",
   master_port:MASTER_PORT,
   node_base_port:NODE_BASE,
   nodes_requested:NODE_COUNT,
   nodes_active:active,
   vr_nodes_active:vrActive,
   ports:Array.from({length:NODE_COUNT},(_,i)=>NODE_BASE+i)
  },
  aggregate:{
   total_loops_s:r(totalLoops),
   total_mirror_ops_s:r(totalMirrorOps),
   total_cache_ops_s:r(totalCacheOps),
   total_cache_mb:r(totalCacheMB),
   avg_latency_ms:r(avgLatency),
   total_node_rss_mb:r(totalRss),
   health:r(healthScore),
   verdict:active===NODE_COUNT&&vrActive===NODE_COUNT?"TRILLIONX_1X10_ACTIVE":"TRILLIONX_1X10_PARTIAL"
  },
  nodes,
  vr_nodes:vrNodes,
  raw:{health,vr},
  truth_policy:{
   real_only:true,
   one_master_ten_local_nodes:true,
   not_ten_physical_machines:true,
   no_fake_cluster_power:true,
   vr_mirror_is_software_runtime:true,
   host:"CODESPACES_SUPPORT_ONLY"
  }
 };

 fs.writeFileSync(`data/trillionx_1x10_node_master_${Date.now()}.json`,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_1x10_node_master_latest.json",JSON.stringify(report,null,2));
 fs.writeFileSync("mesh_1x10/master_latest.json",JSON.stringify(report,null,2));
 return report;
}

async function startMaster(){
 const server=http.createServer(async(req,res)=>{
  if(req.url==="/"||req.url==="/health"||req.url==="/api/1x10"){
   const report=await aggregate();
   res.setHeader("content-type","application/json");
   res.end(JSON.stringify({
    engine:report.engine,
    topology:report.topology,
    aggregate:report.aggregate,
    truth_policy:report.truth_policy
   },null,2));
   return;
  }

  if(req.url==="/full"||req.url==="/api/1x10/full"){
   const report=await aggregate();
   res.setHeader("content-type","application/json");
   res.end(JSON.stringify(report,null,2));
   return;
  }

  res.statusCode=404;
  res.end("not found");
 });

 server.listen(MASTER_PORT,"127.0.0.1",()=>{
  console.log(`TRILLIONX 1x10 MASTER ACTIVE http://127.0.0.1:${MASTER_PORT}`);
 });
}

async function once(){
 const report=await aggregate();
 console.log("=== TRILLIONX 1x10 SUMMARY ===");
 console.log("NODES:",report.topology.nodes_active+"/"+NODE_COUNT);
 console.log("VR:",report.topology.vr_nodes_active+"/"+NODE_COUNT);
 console.log("LOOPS/S:",report.aggregate.total_loops_s);
 console.log("MIRROR OPS/S:",report.aggregate.total_mirror_ops_s);
 console.log("CACHE OPS/S:",report.aggregate.total_cache_ops_s);
 console.log("CACHE MB:",report.aggregate.total_cache_mb);
 console.log("LATENCY:",report.aggregate.avg_latency_ms);
 console.log("HEALTH:",report.aggregate.health);
 console.log("VERDICT:",report.aggregate.verdict);
}

if(MODE==="node") startNode(NODE_ID);
else if(MODE==="once") once();
else startMaster();
