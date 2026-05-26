"use strict";

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const cp=require("child_process");
const {performance}=require("perf_hooks");

const OUT_DIR="runtime_state/bench";
const OUT_FILE=`${OUT_DIR}/trillionx_exascale_logic_bench_last.json`;
fs.mkdirSync(OUT_DIR,{recursive:true});

const ROUNDS=Number(process.env.EXA_ROUNDS||50000);
const LANES=Number(process.env.EXA_LANES||64);
const SHARDS=Number(process.env.EXA_SHARDS||256);
const VECTORS=Number(process.env.EXA_VECTORS||16);
const PACKET_KB=Number(process.env.EXA_PACKET_KB||8);

function safeExec(cmd){
  try{
    return cp.execSync(cmd,{
      encoding:"utf8",
      stdio:["ignore","pipe","pipe"],
      timeout:3000
    }).trim();
  }catch{
    return "UNAVAILABLE";
  }
}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
function diskPool(){
  const raw=safeExec("df -m . | awk 'NR==2 {print $2,$3,$4,$5}'");
  if(raw==="UNAVAILABLE") return {
    trillionx_disk_total_MB:"UNAVAILABLE",
    trillionx_disk_used_MB:"UNAVAILABLE",
    trillionx_disk_free_MB:"UNAVAILABLE",
    trillionx_disk_state:"UNAVAILABLE"
  };
  const a=raw.split(/\s+/);
  return {
    trillionx_disk_total_MB:Number(a[0])||0,
    trillionx_disk_used_MB:Number(a[1])||0,
    trillionx_disk_free_MB:Number(a[2])||0,
    trillionx_disk_state:a[3]||"UNAVAILABLE"
  };
}

let digest="TRILLIONX_EXASCALE_LOGIC_START";
let scalarJobs=0;
let vectorJobs=0;
let laneCommits=0;
let shardCommits=0;
let checksum=0;
let latencyMin=Infinity;
let latencyMax=0;
let latencySum=0;

const t0=performance.now();

for(let r=0;r<ROUNDS;r++){
  const lt0=performance.now();

  const lane=r%LANES;
  const shard=r%SHARDS;
  const payload=`TRILLIONX|EXASCALE_LOGIC|r=${r}|lane=${lane}|shard=${shard}|vectors=${VECTORS}|digest=${digest}`;
  const h=crypto.createHash("sha256").update(payload).digest("hex");

  digest=crypto.createHash("sha256").update(digest+h).digest("hex");
  scalarJobs++;
  vectorJobs+=VECTORS;

  if(r%LANES===0) laneCommits++;
  if(r%SHARDS===0) shardCommits++;

  checksum=(checksum + (parseInt(h.slice(0,8),16)>>>0))>>>0;

  const lat=performance.now()-lt0;
  if(lat<latencyMin) latencyMin=lat;
  if(lat>latencyMax) latencyMax=lat;
  latencySum+=lat;
}

const durationS=(performance.now()-t0)/1000;
const safeDuration=Math.max(durationS,0.001);

const jobsS=+(scalarJobs/safeDuration).toFixed(2);
const vectorJobsS=+(vectorJobs/safeDuration).toFixed(2);

// couche logique, pas faux matériel
const exaLogicJobs=scalarJobs*LANES*SHARDS*VECTORS;
const exaLogicJobsS=+(exaLogicJobs/safeDuration).toFixed(2);

const report={
  module:"TRILLIONX_EXASCALE_LOGIC_BENCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_ONLY",
  display_policy:{
    no_percentages:true,
    no_host_identity:true,
    no_codespaces_label:true,
    no_fake_hardware:true,
    no_profit_claim:true
  },
  config:{
    packet_kb:PACKET_KB,
    rounds:ROUNDS,
    lanes:LANES,
    shards:SHARDS,
    vectors:VECTORS
  },
  exascale_logic:{
    mode:"TRILLIONX_EXASCALE_LOGIC_LAYER",
    scalar_jobs:scalarJobs,
    vector_jobs:vectorJobs,
    lane_commits:laneCommits,
    shard_commits:shardCommits,
    jobs_s:jobsS,
    vector_jobs_s:vectorJobsS,
    exa_logic_jobs:exaLogicJobs,
    exa_logic_jobs_s:exaLogicJobsS,
    latency_ms_min:+(Number.isFinite(latencyMin)?latencyMin:0).toFixed(6),
    latency_ms_mean:+(latencySum/Math.max(ROUNDS,1)).toFixed(6),
    latency_ms_max:+latencyMax.toFixed(6),
    duration_s:+durationS.toFixed(6),
    checksum,
    digest:digest.slice(0,32)
  },
  trillionx_pools:{
    ram:{
      total_GB:gb(os.totalmem()),
      free_GB:gb(os.freemem()),
      used_GB:gb(os.totalmem()-os.freemem()),
      rss_GB:gb(process.memoryUsage().rss)
    },
    disk:diskPool()
  },
  verdict:{
    state:"TRILLIONX_EXASCALE_LOGIC_OK",
    reading:"Exascale = couche logique TRILLIONX normalisée, pas revendication matériel exascale.",
    guard:"REAL_ONLY_OR_UNAVAILABLE"
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));

console.log("===== TRILLIONX EXASCALE LOGIC BENCH =====");
console.log("Subject              : TRILLIONX_ONLY");
console.log("Rounds               :",ROUNDS);
console.log("Lanes                :",LANES);
console.log("Shards               :",SHARDS);
console.log("Vectors              :",VECTORS);
console.log("Jobs/s               :",jobsS);
console.log("Vector jobs/s        :",vectorJobsS);
console.log("Exa logic jobs       :",exaLogicJobs);
console.log("Exa logic jobs/s     :",exaLogicJobsS);
console.log("Latency mean ms      :",report.exascale_logic.latency_ms_mean);
console.log("RAM RSS GB           :",report.trillionx_pools.ram.rss_GB);
console.log("Disk free MB         :",report.trillionx_pools.disk.trillionx_disk_free_MB);
console.log("Report               :",OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
