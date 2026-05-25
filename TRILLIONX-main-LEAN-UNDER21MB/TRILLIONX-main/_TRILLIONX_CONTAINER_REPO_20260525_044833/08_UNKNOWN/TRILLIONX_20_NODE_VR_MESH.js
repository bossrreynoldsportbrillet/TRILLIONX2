const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("mesh_nodes",{recursive:true});

const BASE_PORT=3010;
const COUNT=20;
const MODE=process.argv[2]||"start";
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

function vrMirror(id, level=1){
  const mirrors=50000+(id*7500)+(level*25000);
  const t0=performance.now();
  let checksum=0;
  for(let i=0;i<mirrors;i++){
    checksum=((checksum^((i*2654435761)>>>0))+id+level)>>>0;
  }
  const ms=performance.now()-t0;
  return {
    node_id:id,
    mirrors,
    ms:r(ms),
    mirror_ops_s:r(mirrors/(ms/1000)),
    checksum
  };
}

function computeWork(id){
  const loops=100000+id*25000;
  const t0=performance.now();
  let x=0;
  for(let i=1;i<=loops;i++){
    x += Math.sqrt(i%99991)*Math.sin(i%8191);
    if((i&8191)===0)x%=1000000007;
  }
  const buf=crypto.randomBytes((1+(id%4))*1024*1024);
  const h=crypto.createHash("sha256").update(buf).digest("hex");
  const ms=performance.now()-t0;
  return {
    loops,
    ms:r(ms),
    loops_s:r(loops/(ms/1000)),
    hash:h.slice(0,20),
    checksum:r(x)
  };
}

function startNode(id){
  const port=BASE_PORT+id;
  const name=`TRILLIONX_VR_NODE_${String(id).padStart(2,"0")}`;
  const created=new Date().toISOString();

  const server=http.createServer((req,res)=>{
    if(req.url==="/" || req.url==="/status"){
      res.type="text/plain";
      res.end(`${name} ACTIVE PORT ${port}\n`);
      return;
    }

    if(req.url==="/vr" || req.url.startsWith("/api/vr")){
      const payload={
        node_id:id,
        node_name:name,
        port,
        status:"VR_MIRROR_ACTIVE",
        vr_mirror:vrMirror(id,2),
        memory:mem(),
        truth_policy:{
          real_only:true,
          vr_mirror_is_software_runtime:true,
          physical_openxr_not_claimed:true
        }
      };
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(payload,null,2));
      return;
    }

    if(req.url==="/health" || req.url==="/api/health"){
      const work=computeWork(id);
      const vr=vrMirror(id,1);
      const payload={
        node_id:id,
        node_name:name,
        role:id===0?"MASTER_CAPABLE":"WORKER_NODE",
        status:"ACTIVE",
        port,
        created,
        target:"TRILLIONX",
        host_role:"CODESPACES_SUPPORT_ONLY",
        work,
        vr_mirror:vr,
        memory:mem(),
        score:r(work.loops_s/1000 + vr.mirror_ops_s/100000),
        truth_policy:{
          real_only:true,
          node_is_local_codespaces_process:true,
          no_fake_physical_cluster:true,
          vr_mirror_is_logical_runtime:true
        }
      };
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(payload,null,2));
      return;
    }

    res.statusCode=404;
    res.end("not found");
  });

  server.listen(port,"127.0.0.1",()=>{
    const reg={node_id:id,node_name:name,port,status:"ACTIVE",created,target:"TRILLIONX",vr_mirror:"ACTIVE"};
    fs.writeFileSync(`mesh_nodes/vr_node_${id}.json`,JSON.stringify(reg,null,2));
    console.log(`${name} ACTIVE http://127.0.0.1:${port}`);
  });
}

function get(url,timeout=2500){
  return new Promise(resolve=>{
    const t0=performance.now();
    const req=http.get(url,{timeout},res=>{
      let s="";
      res.on("data",d=>s+=d);
      res.on("end",()=>{
        try{ resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),json:JSON.parse(s)}); }
        catch{ resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),text:s.slice(0,200)}); }
      });
    });
    req.on("timeout",()=>{req.destroy();resolve({ok:false,ms:r(performance.now()-t0),error:"timeout"})});
    req.on("error",e=>resolve({ok:false,ms:r(performance.now()-t0),error:e.code||e.message}));
  });
}

async function aggregate(){
  const health=[], vr=[];
  for(let i=0;i<COUNT;i++){
    health.push(await get(`http://127.0.0.1:${BASE_PORT+i}/health`));
    vr.push(await get(`http://127.0.0.1:${BASE_PORT+i}/vr`));
  }

  const nodes=health.filter(x=>x.json).map(x=>x.json);
  const vrNodes=vr.filter(x=>x.json).map(x=>x.json);
  const ok=nodes.length;
  const okVr=vrNodes.length;

  const totalLoops=nodes.reduce((a,n)=>a+(n.work?.loops_s||0),0);
  const totalMirrorOps=nodes.reduce((a,n)=>a+(n.vr_mirror?.mirror_ops_s||0),0);
  const totalMirrors=nodes.reduce((a,n)=>a+(n.vr_mirror?.mirrors||0),0);
  const totalRss=nodes.reduce((a,n)=>a+(n.memory?.rss_mb||0),0);
  const avgLatency=health.reduce((a,x)=>a+(x.ms||0),0)/Math.max(1,health.length);

  const healthScore=Math.max(0,Math.min(100,
    100
    -(COUNT-ok)*7
    -(COUNT-okVr)*5
    -(avgLatency>500?10:0)
    -(totalRss>3500?10:0)
  ));

  const report={
    engine:"TRILLIONX_20_NODE_VR_MESH",
    ts:new Date().toISOString(),
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    topology:{
      type:"LOCAL_PARALLEL_HTTP_MESH_WITH_VR_MIRRORS",
      nodes_requested:COUNT,
      nodes_active:ok,
      vr_nodes_active:okVr,
      ports:Array.from({length:COUNT},(_,i)=>BASE_PORT+i)
    },
    aggregate:{
      total_loops_s:r(totalLoops),
      total_mirror_ops_s:r(totalMirrorOps),
      total_mirrors:totalMirrors,
      avg_latency_ms:r(avgLatency),
      total_node_rss_mb:r(totalRss),
      health:r(healthScore),
      verdict:ok===COUNT&&okVr===COUNT?"MESH_20_NODES_VR_ACTIVE":"MESH_PARTIAL"
    },
    nodes,
    vr_nodes:vrNodes,
    raw:{health,vr},
    truth_policy:{
      real_only:true,
      twenty_nodes_are_local_runtime_processes:true,
      not_twenty_physical_machines:true,
      vr_mirror_is_software_runtime:true,
      physical_openxr_not_claimed:true,
      codespaces_is_support_only:true
    }
  };

  const file=`data/trillionx_20_node_vr_mesh_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_20_node_vr_mesh_latest.json",JSON.stringify(report,null,2));

  console.log("=== TRILLIONX 20 NODE VR MESH SUMMARY ===");
  console.log("NODES ACTIVE:",ok+"/"+COUNT);
  console.log("VR ACTIVE:",okVr+"/"+COUNT);
  console.log("TOTAL LOOPS/S:",report.aggregate.total_loops_s);
  console.log("TOTAL MIRROR OPS/S:",report.aggregate.total_mirror_ops_s);
  console.log("TOTAL MIRRORS:",report.aggregate.total_mirrors);
  console.log("AVG LATENCY MS:",report.aggregate.avg_latency_ms);
  console.log("TOTAL RSS MB:",report.aggregate.total_node_rss_mb);
  console.log("HEALTH:",report.aggregate.health);
  console.log("VERDICT:",report.aggregate.verdict);
  console.log("REPORT =",file);
}

if(MODE==="node"){
  startNode(Number(process.argv[3]||0));
}else if(MODE==="aggregate"){
  aggregate();
}else{
  console.log("Use: node TRILLIONX_20_NODE_VR_MESH.js node <id> OR aggregate");
}
