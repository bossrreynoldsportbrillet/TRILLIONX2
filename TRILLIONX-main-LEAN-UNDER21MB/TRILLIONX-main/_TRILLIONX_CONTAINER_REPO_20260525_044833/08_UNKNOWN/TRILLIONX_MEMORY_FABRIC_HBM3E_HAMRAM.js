"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto"),zlib=require("zlib"),path=require("path");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("memory_fabric",{recursive:true});
fs.mkdirSync("memory_fabric/spill",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const MODE=process.argv[2]||"server";
const PORT=Number(process.argv[3]||3160);
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();

const POLICY={
  target:"TRILLIONX",
  host_role:"CODESPACES_SUPPORT_ONLY",
  real_only:true,
  hbm3e_is_profile_not_physical_in_codespaces:true,
  ham_ram_is_logical_memory_fabric:true,
  no_fake_physical_ram:true,
  spill_to_disk_enabled:true,
  compression_enabled:true,
  raid60_plus_link:true,
  vr_cache_link:true
};

function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_mb:r(m.heapUsed/1048576),
    external_mb:r(m.external/1048576),
    arraybuf_mb:r((m.arrayBuffers||0)/1048576),
    free_gb:r(os.freemem()/1073741824),
    total_gb:r(os.totalmem()/1073741824),
    load1:r(os.loadavg()[0])
  };
}

const LEVELS=[
  {name:"L1_HOT_REGISTER",max_items:256,compress:false,ttl_ms:60_000},
  {name:"L2_HOT_VECTOR",max_items:512,compress:false,ttl_ms:120_000},
  {name:"L3_WARM_HASH",max_items:1024,compress:true,ttl_ms:300_000},
  {name:"L4_WARM_GRAPH",max_items:2048,compress:true,ttl_ms:600_000},
  {name:"L5_COLD_JSON",max_items:4096,compress:true,ttl_ms:1_800_000},
  {name:"L6_SPILL_DISK",max_items:8192,compress:true,ttl_ms:3_600_000},
  {name:"L7_RAID60_PLUS_POINTER",max_items:16384,compress:true,ttl_ms:7_200_000},
  {name:"L8_VR_MIRROR_SHARED",max_items:32768,compress:true,ttl_ms:14_400_000}
];

class MemoryFabric{
  constructor(){
    this.created=now();
    this.levels=Object.fromEntries(LEVELS.map(l=>[l.name,new Map()]));
    this.stats={puts:0,gets:0,hits:0,miss:0,evictions:0,spill_writes:0,spill_reads:0,compressed_bytes:0,raw_bytes:0};
    this.sequence=0;
  }

  encode(value,compress){
    const raw=Buffer.from(JSON.stringify(value));
    this.stats.raw_bytes+=raw.length;
    if(!compress)return {compressed:false,bytes:raw.length,data:raw.toString("base64")};
    const z=zlib.deflateSync(raw,{level:1});
    this.stats.compressed_bytes+=z.length;
    return {compressed:true,bytes:z.length,data:z.toString("base64")};
  }

  decode(obj){
    const b=Buffer.from(obj.data,"base64");
    const raw=obj.compressed?zlib.inflateSync(b):b;
    return JSON.parse(raw.toString());
  }

  chooseLevel(kind="generic"){
    if(/register|control|joker/i.test(kind))return "L1_HOT_REGISTER";
    if(/vector|wasm|compute/i.test(kind))return "L2_HOT_VECTOR";
    if(/hash|crypto|btc|utxo/i.test(kind))return "L3_WARM_HASH";
    if(/graph|mesh|node/i.test(kind))return "L4_WARM_GRAPH";
    if(/json|report|registry/i.test(kind))return "L5_COLD_JSON";
    if(/spill|large|bulk/i.test(kind))return "L6_SPILL_DISK";
    if(/raid/i.test(kind))return "L7_RAID60_PLUS_POINTER";
    if(/vr|mirror|cache/i.test(kind))return "L8_VR_MIRROR_SHARED";
    return "L3_WARM_HASH";
  }

  put(key,value,kind="generic"){
    this.stats.puts++;
    const level=this.chooseLevel(kind);
    const cfg=LEVELS.find(x=>x.name===level);
    const encoded=this.encode(value,cfg.compress);
    const rec={
      key,kind,level,ts:Date.now(),seq:this.sequence++,
      hash:sha(value),bytes:encoded.bytes,encoded
    };

    if(level==="L6_SPILL_DISK" || encoded.bytes>256*1024){
      const file=`memory_fabric/spill/${sha(key)}_${Date.now()}.json`;
      fs.writeFileSync(file,JSON.stringify(rec,null,2));
      rec.spill_file=file;
      rec.encoded=null;
      this.stats.spill_writes++;
    }

    const map=this.levels[level];
    map.set(key,rec);
    this.evict(level);
    return {ok:true,key,level,hash:rec.hash,bytes:rec.bytes,spill_file:rec.spill_file||null};
  }

  get(key){
    this.stats.gets++;
    for(const [level,map] of Object.entries(this.levels)){
      if(map.has(key)){
        const rec=map.get(key);
        rec.last_access=Date.now();
        this.stats.hits++;
        let value=null;
        if(rec.spill_file){
          try{
            const sp=JSON.parse(fs.readFileSync(rec.spill_file,"utf8"));
            value=this.decode(sp.encoded);
            this.stats.spill_reads++;
          }catch(e){value={error:e.message}}
        }else{
          value=this.decode(rec.encoded);
        }
        return {ok:true,key,level,hash:rec.hash,bytes:rec.bytes,value};
      }
    }
    this.stats.miss++;
    return {ok:false,key};
  }

  evict(level){
    const cfg=LEVELS.find(x=>x.name===level);
    const map=this.levels[level];
    if(map.size<=cfg.max_items)return;
    const rows=[...map.values()].sort((a,b)=>(a.last_access||a.ts)-(b.last_access||b.ts));
    while(map.size>cfg.max_items){
      const victim=rows.shift();
      if(!victim)break;
      map.delete(victim.key);
      this.stats.evictions++;
    }
  }

  hydrateFromExisting(){
    const sources=[
      ["data/trillionx_1x10_node_master_latest.json","graph_mesh"],
      ["data/trillionx_exascale_adjacent_full_runtime_latest.json","vector_compute"],
      ["data/trillionx_runtime_constant_activator_latest.json","control_register"],
      ["data/trillionx_shared_vr_cache_bus_latest.json","vr_mirror_cache"],
      ["raid60_plus/latest_manifest.json","raid_pointer"],
      ["data/trillionx_network_microsecond_latency_latest.json","network_report"],
      ["data/trillionx_firmware_stage0_latest.json","control_register"]
    ];
    let loaded=0;
    for(const [file,kind] of sources){
      if(fs.existsSync(file)){
        try{
          const j=JSON.parse(fs.readFileSync(file,"utf8"));
          this.put(file,j,kind);
          loaded++;
        }catch{}
      }
    }
    return loaded;
  }

  snapshot(){
    const levels={};
    for(const [name,map] of Object.entries(this.levels)){
      const bytes=[...map.values()].reduce((a,b)=>a+(b.bytes||0),0);
      levels[name]={items:map.size,bytes,mb:r(bytes/1048576)};
    }
    const raw=this.stats.raw_bytes;
    const comp=this.stats.compressed_bytes;
    const compression_ratio=comp?r(raw/comp):null;
    const hit_ratio=r(this.stats.hits/Math.max(1,this.stats.hits+this.stats.miss));

    const report={
      engine:"TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM",
      ts:now(),
      created:this.created,
      profile:{
        hbm3e_profile:"MAX_PROFILE_LOGICAL_HIGH_BANDWIDTH",
        ham_ram:"HYPER_ADJACENT_MEMORY_RAM",
        levels:LEVELS.map(x=>x.name),
        memory_model:"hot/warm/cold/spill/raid/vr-cache fabric"
      },
      policy:POLICY,
      host_memory:mem(),
      stats:{...this.stats,hit_ratio,compression_ratio},
      levels,
      health:this.health(levels),
      verdict:null
    };
    report.verdict=report.health>=85?"HBM3E_HAMRAM_FABRIC_ACTIVE":report.health>=65?"HBM3E_HAMRAM_FABRIC_PARTIAL":"HBM3E_HAMRAM_REVIEW";
    fs.writeFileSync("memory_fabric/global_memory_state.json",JSON.stringify(report,null,2));
    fs.writeFileSync("data/trillionx_memory_fabric_hbm3e_hamram_latest.json",JSON.stringify(report,null,2));
    return report;
  }

  health(levels){
    let h=100;
    const m=mem();
    if(m.free_gb<0.4)h-=20;
    if(m.rss_mb>1800)h-=15;
    if(this.stats.miss>this.stats.hits && this.stats.gets>20)h-=10;
    if(this.stats.evictions>100)h-=5;
    return r(Math.max(0,Math.min(100,h)));
  }

  stress(rounds=12){
    const t0=performance.now();
    for(let i=0;i<rounds;i++){
      const payload={
        id:i,
        ts:now(),
        vector:Array.from({length:1024},(_,k)=>Math.sin(k+i)),
        digest:sha("TRILLIONX_HAM_RAM_"+i),
        mirror:{node:i%10,ops:100000+i*2000}
      };
      this.put("stress_vector_"+i,payload,"vector_compute");
      this.put("stress_vr_"+i,payload,"vr_mirror_cache");
      this.put("stress_hash_"+i,payload,"btc_crypto_hash");
      this.get("stress_vector_"+i);
      this.get("stress_vr_"+i);
    }
    const ms=performance.now()-t0;
    const snap=this.snapshot();
    return {rounds,ms:r(ms),us:Math.round(ms*1000),snapshot:snap};
  }
}

const FABRIC=new MemoryFabric();

function startServer(){
  FABRIC.hydrateFromExisting();
  FABRIC.snapshot();

  const server=http.createServer((req,res)=>{
    if(req.url==="/"||req.url==="/health"||req.url==="/api/memory-fabric"){
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(FABRIC.snapshot(),null,2));
      return;
    }

    if(req.url.startsWith("/api/memory-put")){
      let body="";
      req.on("data",d=>body+=d);
      req.on("end",()=>{
        let j={kind:"generic",key:"manual_"+Date.now(),value:{body}};
        try{if(body)j=JSON.parse(body)}catch{}
        const out=FABRIC.put(j.key||("manual_"+Date.now()),j.value||j,j.kind||"generic");
        res.setHeader("content-type","application/json");
        res.end(JSON.stringify(out,null,2));
      });
      return;
    }

    if(req.url.startsWith("/api/memory-get")){
      const u=new URL(req.url,"http://127.0.0.1");
      const key=u.searchParams.get("key")||"";
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(FABRIC.get(key),null,2));
      return;
    }

    if(req.url.startsWith("/api/memory-stress")){
      const out=FABRIC.stress(12);
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(out.snapshot,null,2));
      return;
    }

    res.statusCode=404;
    res.end("not found");
  });

  server.listen(PORT,"127.0.0.1",()=>console.log("TRILLIONX MEMORY FABRIC HBM3e/HAM-RAM ACTIVE http://127.0.0.1:"+PORT));
}

if(MODE==="once"){
  const loaded=FABRIC.hydrateFromExisting();
  const stress=FABRIC.stress(10);
  console.log("=== TRILLIONX MEMORY FABRIC HBM3e/HAM-RAM ===");
  console.log("LOADED:",loaded);
  console.log("STRESS US:",stress.us);
  console.log("HEALTH:",stress.snapshot.health);
  console.log("VERDICT:",stress.snapshot.verdict);
  console.log("REPORT=data/trillionx_memory_fabric_hbm3e_hamram_latest.json");
}else{
  startServer();
}
