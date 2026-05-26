const fs=require("fs"), os=require("os"), http=require("http"), crypto=require("crypto");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("mesh_nodes",{recursive:true});

const BASE_PORT=3010;
const COUNT=10;
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

function nodeWork(id){
  const loops=120000+id*35000;
  const t0=performance.now();
  let x=0;
  for(let i=1;i<=loops;i++){
    x += Math.sqrt(i%99991)*Math.sin(i%8191);
    if((i&8191)===0)x%=1000000007;
  }
  const buf=crypto.randomBytes((1+id%3)*1024*1024);
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
  const name=`TRILLIONX_NODE_${String(id).padStart(2,"0")}`;
  const created=new Date().toISOString();
  const server=http.createServer((req,res)=>{
    if(req.url==="/health" || req.url==="/api/health"){
      const work=nodeWork(id);
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
        memory:mem(),
        truth_policy:{
          real_only:true,
          node_is_local_codespaces_process:true,
          no_fake_cluster:true,
          mesh_simulates_multi_node_runtime_locally:true
        }
      };
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(payload,null,2));
      return;
    }
    if(req.url==="/"){
      res.end(`${name} ACTIVE PORT ${port}\n`);
      return;
    }
    res.statusCode=404;
    res.end("not found");
  });
  server.listen(port,"127.0.0.1",()=>{
    const reg={node_id:id,node_name:name,port,status:"ACTIVE",created,target:"TRILLIONX"};
    fs.writeFileSync(`mesh_nodes/node_${id}.json`,JSON.stringify(reg,null,2));
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
        try{
          resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),json:JSON.parse(s)});
        }catch{
          resolve({ok:true,status:res.statusCode,ms:r(performance.now()-t0),text:s.slice(0,200)});
        }
      });
    });
    req.on("timeout",()=>{req.destroy();resolve({ok:false,ms:r(performance.now()-t0),error:"timeout"})});
    req.on("error",e=>resolve({ok:false,ms:r(performance.now()-t0),error:e.code||e.message}));
  });
}

async function aggregate(){
  const results=[];
  for(let i=0;i<COUNT;i++){
    results.push(await get(`http://127.0.0.1:${BASE_PORT+i}/health`));
  }
  const ok=results.filter(x=>x.ok && x.json).length;
  const nodes=results.filter(x=>x.json).map(x=>x.json);
  const totalLoops=nodes.reduce((a,n)=>a+(n.work?.loops_s||0),0);
  const avgMs=results.reduce((a,x)=>a+(x.ms||0),0)/Math.max(1,results.length);
  const totalRss=nodes.reduce((a,n)=>a+(n.memory?.rss_mb||0),0);
  const health=Math.max(0,Math.min(100,100-(COUNT-ok)*10-(avgMs>500?10:0)-(totalRss>2500?10:0)));
  const report={
    engine:"TRILLIONX_10_NODE_MESH",
    ts:new Date().toISOString(),
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    topology:{
      type:"LOCAL_MULTI_PROCESS_MESH",
      nodes_requested:COUNT,
      nodes_active:ok,
      ports:Array.from({length:COUNT},(_,i)=>BASE_PORT+i)
    },
    aggregate:{
      total_loops_s:r(totalLoops),
      avg_latency_ms:r(avgMs),
      total_node_rss_mb:r(totalRss),
      health:r(health),
      verdict:ok===COUNT?"MESH_10_NODES_ACTIVE":"MESH_PARTIAL"
    },
    nodes,
    raw_results:results,
    truth_policy:{
      real_only:true,
      ten_nodes_are_local_runtime_nodes:true,
      not_ten_physical_machines:true,
      codespaces_is_support_only:true,
      no_fake_cluster_power:true
    }
  };
  const file=`data/trillionx_10_node_mesh_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_10_node_mesh_latest.json",JSON.stringify(report,null,2));
  console.log("=== TRILLIONX 10 NODE MESH SUMMARY ===");
  console.log("ACTIVE:",ok+"/"+COUNT);
  console.log("TOTAL LOOPS/S:",report.aggregate.total_loops_s);
  console.log("AVG LATENCY MS:",report.aggregate.avg_latency_ms);
  console.log("TOTAL RSS MB:",report.aggregate.total_node_rss_mb);
  console.log("HEALTH:",report.aggregate.health);
  console.log("VERDICT:",report.aggregate.verdict);
  console.log("REPORT =",file);
}

if(MODE==="node"){
  const id=Number(process.argv[3]||0);
  startNode(id);
}else if(MODE==="aggregate"){
  aggregate();
}else{
  console.log("Use: node TRILLIONX_10_NODE_MESH.js node <id> OR aggregate");
}
