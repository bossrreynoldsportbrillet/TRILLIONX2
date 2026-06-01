"use strict";
const os=require("os"),fs=require("fs"),{performance}=require("perf_hooks"),crypto=require("crypto");

const r=x=>Number.isFinite(x)?+x.toFixed(3):null;

// ---- Lecture noyau Linux (vérité terrain) ----
function readKernelCpuTopology(){
  const result={
    cores_total:0,
    clusters:[],
    max_freq_mhz:null,
    min_freq_mhz:null,
    governor:null,
    arch:os.arch(),
    source:"REAL_KERNEL_OR_UNAVAILABLE"
  };
  try{
    // Count cores from /proc/cpuinfo
    const cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8");
    result.cores_total=cpuinfo.split("\n").filter(l=>l.startsWith("processor")).length;
  }catch(e){result.cores_total=os.cpus().length||1;}

  // Per-CPU frequencies via /sys
  const clusterMap=new Map();
  for(let i=0;i<result.cores_total;i++){
    try{
      const base=`/sys/devices/system/cpu/cpu${i}/cpufreq`;
      const min=parseInt(fs.readFileSync(`${base}/cpuinfo_min_freq`,"utf8"))/1000;
      const max=parseInt(fs.readFileSync(`${base}/cpuinfo_max_freq`,"utf8"))/1000;
      const cur=parseInt(fs.readFileSync(`${base}/scaling_cur_freq`,"utf8"))/1000;
      if(!result.governor){
        try{result.governor=fs.readFileSync(`${base}/scaling_governor`,"utf8").trim();}catch(_){}
      }
      const key=`${min}-${max}`;
      if(!clusterMap.has(key))clusterMap.set(key,{min_mhz:min,max_mhz:max,cores:[],cur_mhz_avg:0});
      const c=clusterMap.get(key);
      c.cores.push(i);
      c.cur_mhz_avg+=cur;
    }catch(_){}
  }
  result.clusters=[...clusterMap.values()].map(c=>({
    min_mhz:r(c.min_mhz),
    max_mhz:r(c.max_mhz),
    core_count:c.cores.length,
    core_ids:c.cores,
    avg_cur_mhz:r(c.cur_mhz_avg/c.cores.length),
    role:null
  })).sort((a,b)=>a.max_mhz-b.max_mhz);
  if(result.clusters.length>=2){
    result.clusters[0].role="efficiency";
    result.clusters[result.clusters.length-1].role="performance";
    if(result.clusters.length===3)result.clusters[1].role="prime";
  }else if(result.clusters.length===1){
    result.clusters[0].role="uniform";
  }
  if(result.clusters.length){
    result.max_freq_mhz=Math.max(...result.clusters.map(c=>c.max_mhz));
    result.min_freq_mhz=Math.min(...result.clusters.map(c=>c.min_mhz));
  }
  return result;
}

// ---- Mesure brute (bench Node) ----
function quickMeasure(fn,durationMs=100){
  const t0=performance.now(),limit=t0+durationMs;
  let n=0;
  while(performance.now()<limit){fn();n++}
  return n;
}

async function detectPower(){
  const topo=readKernelCpuTopology();
  const freemem=os.freemem(),totalmem=os.totalmem();

  // Benches
  const loopIter=quickMeasure(()=>{},50);
  const buf=Buffer.alloc(1024*1024);
  const cryptoIter=quickMeasure(()=>{crypto.createHash("sha256").update(buf).digest()},50);
  const bigintIter=quickMeasure(()=>{BigInt(Math.random()*2**53)*BigInt(Math.random()*2**53)},50);
  const allocIter=quickMeasure(()=>{Buffer.alloc(1024*100)},50);

  const cores=topo.cores_total||1;
  const perfCluster=topo.clusters.find(c=>c.role==="performance")||topo.clusters[0]||{core_count:cores,max_mhz:null};
  const ecoCluster=topo.clusters.find(c=>c.role==="efficiency")||null;

  const basePower=r((loopIter+cryptoIter*0.5+bigintIter*0.1)/cores);
  const cpuScore=r(loopIter*0.4+cryptoIter*0.4+bigintIter*0.2);
  const memScore=r(allocIter);

  // HONEST peak_mhz: clamp to kernel-reported max, never invent
  const peakMhzReal=topo.max_freq_mhz;
  const peakMhzNote=peakMhzReal
    ?`kernel-reported cluster max: ${peakMhzReal} MHz`
    :"unavailable (no /sys/cpufreq access)";

  // Worker recommendation: prefer perf-cluster count on big.LITTLE
  const recommendedWorkers=Math.max(1,perfCluster.core_count||Math.ceil(Math.sqrt(cores)));

  const adaptiveTimeout=Math.max(500,Math.ceil(2000/Math.max(1,cpuScore/1000)));

  const power={
    timestamp:new Date().toISOString(),
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    hardware:{
      cores_total:cores,
      arch:topo.arch,
      governor:topo.governor||"unknown",
      max_freq_mhz_real:peakMhzReal,
      min_freq_mhz_real:topo.min_freq_mhz,
      freemem_gb:r(freemem/(2**30)),
      totalmem_gb:r(totalmem/(2**30)),
      clusters:topo.clusters,
      topology_source:topo.source
    },
    measurements:{
      loop_iter_50ms:loopIter,
      crypto_sha256_1mb_50ms:cryptoIter,
      bigint_mul_50ms:bigintIter,
      alloc_100kb_50ms:allocIter
    },
    scores:{
      cpu_score:cpuScore,
      mem_score:memScore,
      base_power_ops_per_ms_per_core:basePower
    },
    recommendations:{
      worker_threads:recommendedWorkers,
      worker_threads_basis:perfCluster.role==="performance"
        ?"performance_cluster_core_count"
        :"sqrt_total_cores_fallback",
      adaptive_timeout_ms:adaptiveTimeout,
      peak_mhz_real:peakMhzReal,
      peak_mhz_note:peakMhzNote,
      estimated_peak_mhz_legacy_disabled:"NOT_PROVIDED (was cpuScore*100, removed as unreliable)",
      network_concurrency:Math.max(6,Math.min(12,recommendedWorkers*2))
    },
    big_little:{
      detected:topo.clusters.length>=2,
      cluster_count:topo.clusters.length,
      perf_cluster:perfCluster.role==="performance"?{
        cores:perfCluster.core_count,
        max_mhz:perfCluster.max_mhz,
        avg_cur_mhz:perfCluster.avg_cur_mhz
      }:null,
      eco_cluster:ecoCluster?{
        cores:ecoCluster.core_count,
        max_mhz:ecoCluster.max_mhz,
        avg_cur_mhz:ecoCluster.avg_cur_mhz
      }:null,
      note:topo.clusters.length>=2
        ?"big.LITTLE asymmetric CPU detected; Node.js worker scheduling on Android is OS-controlled, not pinnable from userspace"
        :"uniform topology or unreadable"
    }
  };
  return power;
}

module.exports={detectPower,quickMeasure,readKernelCpuTopology};

if(require.main===module){
  detectPower().then(p=>{
    console.log("[power-detect v2]",JSON.stringify(p,null,2));
  }).catch(e=>{console.error(e);process.exit(1)});
}
