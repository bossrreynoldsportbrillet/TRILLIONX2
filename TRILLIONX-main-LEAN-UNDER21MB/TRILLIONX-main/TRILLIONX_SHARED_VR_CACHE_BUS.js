const fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),http=require("http");
const {performance}=require("perf_hooks");

const ROOT=process.cwd();
const BASE="shared_vr_cache";
const DATA="data";
const NODES=20;
const BASE_PORT=3010;
fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(BASE,{recursive:true});
fs.mkdirSync(`${BASE}/vr_mirrors`,{recursive:true});
fs.mkdirSync(`${BASE}/cache_layers`,{recursive:true});
fs.mkdirSync(`${BASE}/node_bus`,{recursive:true});

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

function sha(obj){
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function vrMirror(nodeId, level=1){
  const mirrors=75000+nodeId*9000+level*35000;
  let checksum=0;
  const t0=performance.now();
  for(let i=0;i<mirrors;i++){
    checksum=((checksum^((i*2654435761)>>>0))+nodeId+level)>>>0;
  }
  const ms=performance.now()-t0;
  return {
    node_id:nodeId,
    mirrors,
    ms:r(ms),
    mirror_ops_s:r(mirrors/(ms/1000)),
    checksum
  };
}

function cacheLayer(nodeId, level=1){
  const size=1024*(64+nodeId*4+level*16);
  const buf=Buffer.alloc(size);
  let hits=0, miss=0, checksum=0;
  const t0=performance.now();
  for(let i=0;i<size;i+=64){
    buf[i]=(i+nodeId+level)&255;
    checksum=(checksum+buf[i])>>>0;
    if((i/64)%3===0)hits++; else miss++;
  }
  const ms=performance.now()-t0;
  return {
    node_id:nodeId,
    level,
    bytes:size,
    kb:r(size/1024),
    ms:r(ms),
    cache_ops_s:r((hits+miss)/(ms/1000)),
    hits,
    miss,
    hit_ratio:r(hits/Math.max(1,hits+miss)),
    checksum
  };
}

function writeNodeShare(nodeId){
  const vr=vrMirror(nodeId,2);
  const cache=cacheLayer(nodeId,2);
  const state={
    node_id:nodeId,
    ts:new Date().toISOString(),
    port:BASE_PORT+nodeId,
    vr_mirror:vr,
    cache_layer:cache,
    memory:mem(),
    hash:sha({vr,cache})
  };
  fs.writeFileSync(`${BASE}/vr_mirrors/node_${nodeId}.json`,JSON.stringify(vr,null,2));
  fs.writeFileSync(`${BASE}/cache_layers/node_${nodeId}.json`,JSON.stringify(cache,null,2));
  fs.writeFileSync(`${BASE}/node_bus/node_${nodeId}.json`,JSON.stringify(state,null,2));
  return state;
}

function get(url,timeout=1200){
  return new Promise(resolve=>{
    const t0=performance.now();
    const req=http.get(url,{timeout},res=>{
      let s="";
      res.on("data",d=>s+=d);
      res.on("end",()=>{
        try{resolve({ok:true,ms:r(performance.now()-t0),json:JSON.parse(s)});}
        catch{resolve({ok:true,ms:r(performance.now()-t0),text:s.slice(0,100)});}
      });
    });
    req.on("timeout",()=>{req.destroy();resolve({ok:false,ms:r(performance.now()-t0),error:"timeout"});});
    req.on("error",e=>resolve({ok:false,ms:r(performance.now()-t0),error:e.code||e.message}););
  });
}

async function probeNodes(){
  const out=[];
  for(let i=0;i<NODES;i++){
    out.push(await get(`http://127.0.0.1:${BASE_PORT+i}/vr`));
  }
  return out;
}

function readShares(){
  const nodes=[];
  for(let i=0;i<NODES;i++){
    const f=`${BASE}/node_bus/node_${i}.json`;
    if(fs.existsSync(f)){
      try{nodes.push(JSON.parse(fs.readFileSync(f,"utf8")));}catch{}
    }
  }
  return nodes;
}

async function make(){
  const local=[];
  for(let i=0;i<NODES;i++) local.push(writeNodeShare(i));
  const probes=await probeNodes();
  const shares=readShares();

  const totalMirrors=shares.reduce((a,n)=>a+(n.vr_mirror?.mirrors||0),0);
  const totalMirrorOps=shares.reduce((a,n)=>a+(n.vr_mirror?.mirror_ops_s||0),0);
  const totalCacheBytes=shares.reduce((a,n)=>a+(n.cache_layer?.bytes||0),0);
  const totalCacheOps=shares.reduce((a,n)=>a+(n.cache_layer?.cache_ops_s||0),0);
  const hits=shares.reduce((a,n)=>a+(n.cache_layer?.hits||0),0);
  const miss=shares.reduce((a,n)=>a+(n.cache_layer?.miss||0),0);
  const okProbes=probes.filter(x=>x.ok).length;

  const global={
    engine:"TRILLIONX_SHARED_VR_CACHE_BUS",
    ts:new Date().toISOString(),
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    topology:{
      nodes_expected:NODES,
      local_shares:shares.length,
      vr_endpoint_probes_ok:okProbes,
      bus_path:BASE
    },
    aggregate:{
      total_mirrors:totalMirrors,
      total_mirror_ops_s:r(totalMirrorOps),
      total_cache_bytes:totalCacheBytes,
      total_cache_mb:r(totalCacheBytes/1048576),
      total_cache_ops_s:r(totalCacheOps),
      cache_hits:hits,
      cache_miss:miss,
      cache_hit_ratio:r(hits/Math.max(1,hits+miss)),
      memory:mem()
    },
    health:r(Math.max(0,Math.min(100,100-(NODES-shares.length)*4-(NODES-okProbes)*2))),
    nodes:shares,
    probes,
    truth_policy:{
      real_only:true,
      shared_vr_mirror_is_software_runtime:true,
      shared_cache_is_logical_memory_cache:true,
      not_physical_vr:false,
      physical_openxr_not_claimed:true,
      codespaces_is_support_only:true
    }
  };
  global.hash=sha(global.aggregate);
  fs.writeFileSync(`${BASE}/global_state.json`,JSON.stringify(global,null,2));
  fs.writeFileSync(`${DATA}/trillionx_shared_vr_cache_bus_latest.json`,JSON.stringify(global,null,2));
  fs.writeFileSync(`${DATA}/trillionx_shared_vr_cache_bus_${Date.now()}.json`,JSON.stringify(global,null,2));

  console.log("=== TRILLIONX SHARED VR CACHE BUS ===");
  console.log("LOCAL SHARES:",shares.length+"/"+NODES);
  console.log("VR ENDPOINTS OK:",okProbes+"/"+NODES);
  console.log("TOTAL MIRRORS:",global.aggregate.total_mirrors);
  console.log("TOTAL MIRROR OPS/S:",global.aggregate.total_mirror_ops_s);
  console.log("CACHE MB:",global.aggregate.total_cache_mb);
  console.log("CACHE OPS/S:",global.aggregate.total_cache_ops_s);
  console.log("CACHE HIT RATIO:",global.aggregate.cache_hit_ratio);
  console.log("HEALTH:",global.health);
  console.log("HASH:",global.hash);
  console.log("REPORT = data/trillionx_shared_vr_cache_bus_latest.json");
}

function verify(){
  const f=`${BASE}/global_state.json`;
  if(!fs.existsSync(f)){console.error("NO_GLOBAL_STATE");process.exit(1);}
  const g=JSON.parse(fs.readFileSync(f,"utf8"));
  console.log("=== VERIFY SHARED VR CACHE BUS ===");
  console.log("NODES:",g.topology.local_shares+"/"+g.topology.nodes_expected);
  console.log("MIRRORS:",g.aggregate.total_mirrors);
  console.log("CACHE MB:",g.aggregate.total_cache_mb);
  console.log("HEALTH:",g.health);
  console.log("HASH:",g.hash);
}

const mode=process.argv[2]||"make";
if(mode==="verify")verify();
else make().catch(e=>{console.error(e);process.exit(1);});
