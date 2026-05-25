"use strict";

/*
TRILLIONX EOF MULTI PROTOCOL POOL SAVINGS
BTC UTXO, ETH/EVM, RVN, ETC, LTC, DOGE, KAS, ERG, FLUX, XMR
- Pool émulé par protocole
- Shares accept/reject/stale
- Économie électrique modèle
- Comparaison protocolaire
- BTC/ETH/RVN réels = UNAVAILABLE sans vrais pools
*/

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

fs.mkdirSync("runtime_state/benchmark",{recursive:true});
const OUT="runtime_state/benchmark/trillionx_eof_multi_protocol_pool_savings_last.json";

function envN(k,d){const v=Number(process.env[k]);return Number.isFinite(v)?v:d;}
function round(x,d=6){return +Number(x).toFixed(d);}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}

const CFG={
  farms:envN("TRILLIONX_ENTERPRISE_FARMS",120),
  miners_per_farm:envN("TRILLIONX_MINERS_PER_FARM",240),
  years:envN("TRILLIONX_YEARS",10),
  kwh_eur:envN("TRILLIONX_KWH_EUR",0.12),
  base_rounds:envN("TRILLIONX_BASE_ROUNDS",45000),
  stages:envN("TRILLIONX_MAX_STAGES",6),
  packet_kb:envN("TRILLIONX_PACKET_KB",8),
  x10_nodes:envN("TRILLIONX_X10_NODE_COUNT",10),
  qn_layers:envN("TRILLIONX_QN_LAYERS",8),
  mirrors:envN("TRILLIONX_MIRRORS",16),
  lanes:envN("TRILLIONX_LANES",64),
  target_saving_ratio:envN("TRILLIONX_TARGET_SAVING_RATIO",0.89)
};

const PROTOCOLS=[
  {
    id:"BTC",
    family:"UTXO",
    consensus:"PoW",
    algo:"SHA-256",
    pool_unit:"share",
    kw_per_unit:3.5,
    throughput_unit:"TH/s",
    throughput_per_unit:200,
    revenue_unit_day:0.45,
    revenue_unit_name:"BTC_per_EH_day",
    price_eur:60000,
    pool_fee:0.02,
    stale_base:0.008,
    reject_base:0.004,
    cache_gain:0.42,
    scheduling_gain:0.26,
    routing_gain:0.18,
    packet_gain:0.14
  },
  {
    id:"BCH",
    family:"UTXO",
    consensus:"PoW",
    algo:"SHA-256",
    pool_unit:"share",
    kw_per_unit:3.5,
    throughput_unit:"TH/s",
    throughput_per_unit:200,
    revenue_unit_day:0.015,
    revenue_unit_name:"BCH_per_EH_day_model",
    price_eur:450,
    pool_fee:0.02,
    stale_base:0.009,
    reject_base:0.005,
    cache_gain:0.40,
    scheduling_gain:0.25,
    routing_gain:0.19,
    packet_gain:0.13
  },
  {
    id:"LTC_DOGE",
    family:"UTXO",
    consensus:"PoW",
    algo:"Scrypt",
    pool_unit:"share",
    kw_per_unit:3.4,
    throughput_unit:"GH/s",
    throughput_per_unit:16,
    revenue_unit_day:0.032,
    revenue_unit_name:"LTC_equiv_per_PH_day_model",
    price_eur:85,
    pool_fee:0.025,
    stale_base:0.011,
    reject_base:0.006,
    cache_gain:0.38,
    scheduling_gain:0.28,
    routing_gain:0.17,
    packet_gain:0.14
  },
  {
    id:"ETH_EVM",
    family:"ACCOUNT",
    consensus:"PoS",
    algo:"EVM_EXECUTION",
    pool_unit:"validator/job",
    kw_per_unit:0.18,
    throughput_unit:"validator",
    throughput_per_unit:1,
    revenue_unit_day:0.000015,
    revenue_unit_name:"ETH_per_validator_day_model",
    price_eur:3000,
    pool_fee:0.01,
    stale_base:0.003,
    reject_base:0.002,
    cache_gain:0.48,
    scheduling_gain:0.22,
    routing_gain:0.18,
    packet_gain:0.12
  },
  {
    id:"ETC",
    family:"ACCOUNT",
    consensus:"PoW",
    algo:"Etchash",
    pool_unit:"share",
    kw_per_unit:0.32,
    throughput_unit:"GH/s",
    throughput_per_unit:1.2,
    revenue_unit_day:0.021,
    revenue_unit_name:"ETC_per_TH_day_model",
    price_eur:25,
    pool_fee:0.02,
    stale_base:0.012,
    reject_base:0.006,
    cache_gain:0.36,
    scheduling_gain:0.29,
    routing_gain:0.18,
    packet_gain:0.13
  },
  {
    id:"RVN",
    family:"UTXO",
    consensus:"PoW",
    algo:"KawPow",
    pool_unit:"share",
    kw_per_unit:0.28,
    throughput_unit:"MH/s",
    throughput_per_unit:45,
    revenue_unit_day:0.018,
    revenue_unit_name:"RVN_equiv_per_GH_day_model",
    price_eur:0.025,
    pool_fee:0.02,
    stale_base:0.018,
    reject_base:0.008,
    cache_gain:0.34,
    scheduling_gain:0.31,
    routing_gain:0.20,
    packet_gain:0.13
  },
  {
    id:"KAS",
    family:"UTXO_DAG",
    consensus:"PoW",
    algo:"kHeavyHash",
    pool_unit:"share",
    kw_per_unit:3.2,
    throughput_unit:"TH/s",
    throughput_per_unit:21,
    revenue_unit_day:0.024,
    revenue_unit_name:"KAS_equiv_per_PH_day_model",
    price_eur:0.12,
    pool_fee:0.02,
    stale_base:0.014,
    reject_base:0.007,
    cache_gain:0.39,
    scheduling_gain:0.27,
    routing_gain:0.20,
    packet_gain:0.12
  },
  {
    id:"ERG",
    family:"UTXO",
    consensus:"PoW",
    algo:"Autolykos",
    pool_unit:"share",
    kw_per_unit:0.26,
    throughput_unit:"MH/s",
    throughput_per_unit:220,
    revenue_unit_day:0.016,
    revenue_unit_name:"ERG_equiv_per_GH_day_model",
    price_eur:1.4,
    pool_fee:0.02,
    stale_base:0.012,
    reject_base:0.006,
    cache_gain:0.37,
    scheduling_gain:0.30,
    routing_gain:0.18,
    packet_gain:0.13
  },
  {
    id:"FLUX",
    family:"UTXO",
    consensus:"PoW",
    algo:"ZelHash",
    pool_unit:"share",
    kw_per_unit:0.30,
    throughput_unit:"Sol/s",
    throughput_per_unit:120,
    revenue_unit_day:0.014,
    revenue_unit_name:"FLUX_equiv_per_KSol_day_model",
    price_eur:0.65,
    pool_fee:0.02,
    stale_base:0.013,
    reject_base:0.007,
    cache_gain:0.35,
    scheduling_gain:0.30,
    routing_gain:0.19,
    packet_gain:0.13
  },
  {
    id:"XMR",
    family:"PRIVACY_ACCOUNT_LIKE",
    consensus:"PoW",
    algo:"RandomX",
    pool_unit:"share",
    kw_per_unit:0.12,
    throughput_unit:"kH/s",
    throughput_per_unit:20,
    revenue_unit_day:0.0009,
    revenue_unit_name:"XMR_equiv_per_MH_day_model",
    price_eur:150,
    pool_fee:0.015,
    stale_base:0.006,
    reject_base:0.004,
    cache_gain:0.43,
    scheduling_gain:0.25,
    routing_gain:0.18,
    packet_gain:0.14
  }
];

function runProtocol(p){
  let digest=`TRILLIONX_${p.id}_START`;
  let stages=[];
  let totalPackets=0,totalJobs=0,totalBytes=0,totalLat=0,totalLatN=0;
  let stress=1, prevSaving=0;

  const units=CFG.farms*CFG.miners_per_farm;
  const baselineMW=units*p.kw_per_unit/1000;

  for(let stage=1; stage<=CFG.stages; stage++){
    const rounds=Math.floor(CFG.base_rounds*stress);
    const cache=new Map();
    let packets=0,jobs=0,bytes=0,latSum=0,latMax=0;
    let hit=0,miss=0,acc=0,rej=0,stale=0;

    const t0=performance.now();
    for(let i=0;i<rounds;i++){
      const l0=performance.now();
      const key=`${p.id}|${i%CFG.farms}|${i%CFG.miners_per_farm}|${i%CFG.lanes}|${i%CFG.mirrors}`;
      const h=crypto.createHash("sha256").update(key+digest+i).digest("hex");
      digest=crypto.createHash("sha256").update(digest+h).digest("hex");

      if(cache.has(key)) hit++; else miss++;
      cache.set(key,h);
      if(cache.size>8192) cache.delete(cache.keys().next().value);

      const score=parseInt(h.slice(0,8),16)/0xffffffff;
      const lat=performance.now()-l0;
      const reuse=hit/Math.max(hit+miss,1);
      const dynReject=clamp(p.reject_base*(1-reuse),0,0.06);
      const dynStale=clamp(p.stale_base*(1+lat*4),0,0.08);

      if(score<dynReject) rej++;
      else if(score<dynReject+dynStale) stale++;
      else acc++;

      packets++;
      jobs+=CFG.x10_nodes*CFG.qn_layers;
      bytes+=CFG.packet_kb*1024;
      latSum+=lat;
      if(lat>latMax)latMax=lat;
    }

    const dur=(performance.now()-t0)/1000;
    const packetsS=packets/Math.max(dur,0.001);
    const jobsS=jobs/Math.max(dur,0.001);
    const dataMBS=(bytes/1024/1024)/Math.max(dur,0.001);
    const latencyMean=latSum/Math.max(packets,1);
    const reuse=hit/Math.max(hit+miss,1);
    const accepted=acc/Math.max(acc+rej+stale,1);
    const reject=rej/Math.max(acc+rej+stale,1);
    const staleR=stale/Math.max(acc+rej+stale,1);
    const latencyFactor=clamp(1/(1+latencyMean*8),0,1);
    const packetFactor=clamp(Math.log10(Math.max(packetsS,10))/8,0,0.55);
    const poolEfficiency=accepted*(1-p.pool_fee);

    const saving=clamp(
      reuse*p.cache_gain +
      poolEfficiency*p.scheduling_gain +
      latencyFactor*p.routing_gain +
      packetFactor*p.packet_gain,
      0,
      0.94
    );

    const optimizedMW=baselineMW*(1-saving);
    const baselineCost=baselineMW*1000*24*365*CFG.years*CFG.kwh_eur;
    const optimizedCost=optimizedMW*1000*24*365*CFG.years*CFG.kwh_eur;
    const savedCost=baselineCost-optimizedCost;

    const throughputFleet=units*p.throughput_per_unit;
    const grossRewardDay=(throughputFleet/1_000_000)*p.revenue_unit_day;
    const netRewardDay=grossRewardDay*poolEfficiency;
    const netReward10y=netRewardDay*365*CFG.years;
    const revenue10y=netReward10y*p.price_eur;

    const st={
      stage, rounds,
      packets_s:round(packetsS,3),
      jobs_s:round(jobsS,3),
      data_MB_s:round(dataMBS,3),
      latency_mean_ms:round(latencyMean,6),
      cache_reuse:round(reuse,6),
      accepted_ratio:round(accepted,6),
      reject_ratio:round(reject,6),
      stale_ratio:round(staleR,6),
      saving_ratio_model:round(saving,6),
      target_proximity:round(saving/CFG.target_saving_ratio,6),
      baseline_MW:round(baselineMW,3),
      optimized_MW_model:round(optimizedMW,3),
      electricity_saved_10y_EUR_model:round(savedCost,2),
      net_reward_day_model:round(netRewardDay,10),
      net_reward_10y_model:round(netReward10y,10),
      revenue_10y_EUR_model:round(revenue10y,2),
      auto_next:saving>prevSaving+0.04?"INCREASE_STRESS":"STABILIZE"
    };

    stages.push(st);
    totalPackets+=packets;
    totalJobs+=jobs;
    totalBytes+=bytes;
    totalLat+=latSum;
    totalLatN+=packets;

    if(st.auto_next==="INCREASE_STRESS"){prevSaving=saving;stress*=1.35;}
    else stress*=1.10;
  }

  const last=stages[stages.length-1];
  return {
    protocol:p.id,
    family:p.family,
    consensus:p.consensus,
    algo:p.algo,
    throughput_unit:p.throughput_unit,
    pool_unit:p.pool_unit,
    stages,
    final:{
      saving_ratio_model:last.saving_ratio_model,
      target_proximity:last.target_proximity,
      accepted_ratio:last.accepted_ratio,
      reject_ratio:last.reject_ratio,
      stale_ratio:last.stale_ratio,
      baseline_MW:last.baseline_MW,
      optimized_MW_model:last.optimized_MW_model,
      electricity_saved_10y_EUR_model:last.electricity_saved_10y_EUR_model,
      net_reward_day_model:last.net_reward_day_model,
      net_reward_10y_model:last.net_reward_10y_model,
      revenue_10y_EUR_model:last.revenue_10y_EUR_model,
      BTC_ETH_RVN_REAL:"UNAVAILABLE"
    },
    totals:{
      packets:totalPackets,
      packets_s:round(totalPackets/Math.max(stages.reduce((a,s)=>a+s.rounds,0)/CFG.base_rounds,1),3),
      jobs:totalJobs,
      latency_mean_ms:round(totalLat/Math.max(totalLatN,1),6),
      data_MB:round(totalBytes/1024/1024,3)
    },
    digest:digest.slice(0,32)
  };
}

const t0=performance.now();
const protocols=PROTOCOLS.map(runProtocol);

const ranked_by_saving=[...protocols].sort((a,b)=>b.final.saving_ratio_model-a.final.saving_ratio_model);
const ranked_by_eur_saved=[...protocols].sort((a,b)=>b.final.electricity_saved_10y_EUR_model-a.final.electricity_saved_10y_EUR_model);
const ranked_by_pool_quality=[...protocols].sort((a,b)=>b.final.accepted_ratio-a.final.accepted_ratio);

const final={
  module:"TRILLIONX_EOF_MULTI_PROTOCOL_POOL_SAVINGS",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_MULTI_PROTOCOL_ENTERPRISE_POOL_SAVINGS_MODEL",
  config:CFG,
  protocols,
  rankings:{
    by_saving_ratio:ranked_by_saving.map(x=>({protocol:x.protocol,algo:x.algo,saving_ratio_model:x.final.saving_ratio_model,target_proximity:x.final.target_proximity})),
    by_electricity_saved_EUR:ranked_by_eur_saved.map(x=>({protocol:x.protocol,algo:x.algo,saved_10y_EUR:x.final.electricity_saved_10y_EUR_model})),
    by_pool_quality:ranked_by_pool_quality.map(x=>({protocol:x.protocol,algo:x.algo,accepted_ratio:x.final.accepted_ratio,stale_ratio:x.final.stale_ratio,reject_ratio:x.final.reject_ratio}))
  },
  host_support_only:{
    cpus:os.cpus().length,
    ram_total_GB:gb(os.totalmem()),
    ram_free_GB:gb(os.freemem()),
    node:process.version
  },
  duration_s:round((performance.now()-t0)/1000,6),
  verdict:{
    state:"MULTI_PROTOCOL_POOL_SAVINGS_COMPLETE",
    best_saving_protocol:ranked_by_saving[0].protocol,
    best_electricity_saved_protocol:ranked_by_eur_saved[0].protocol,
    best_pool_quality_protocol:ranked_by_pool_quality[0].protocol,
    real:"TRILLIONX runtime execution and report generation",
    modeled:"protocol pools, shares, rewards, electricity saving",
    unavailable:"real pool shares, real rewards, real invoices, real watts"
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT,JSON.stringify(final,null,2));

console.log("===== TRILLIONX EOF MULTI PROTOCOL POOL SAVINGS =====");
console.log("Protocols compared          :",protocols.length);
console.log("Best saving protocol        :",final.verdict.best_saving_protocol);
console.log("Best EUR saved protocol     :",final.verdict.best_electricity_saved_protocol);
console.log("Best pool quality protocol  :",final.verdict.best_pool_quality_protocol);
console.log("Duration s                  :",final.duration_s);
console.log("Report                      :",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
console.log("");
for(const p of protocols){
  console.log(`${p.protocol.padEnd(10)} ${p.algo.padEnd(14)} saving=${p.final.saving_ratio_model} accepted=${p.final.accepted_ratio} saved10yEUR=${p.final.electricity_saved_10y_EUR_model}`);
}
