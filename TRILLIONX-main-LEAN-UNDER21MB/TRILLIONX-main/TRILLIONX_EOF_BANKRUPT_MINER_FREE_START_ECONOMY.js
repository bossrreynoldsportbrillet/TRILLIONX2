"use strict";

/*
TRILLIONX EOF BANKRUPT MINER FREE START ECONOMY
But:
- Émuler une entreprise/ferme de mining proche faillite
- Laisser TRILLIONX choisir librement le protocole de départ
- Objectif: économie électrique cible 89%
- Plus le gain est bon, plus la difficulté augmente
- Multi-protocoles: BTC UTXO, BCH, LTC/DOGE, ETH_EVM, ETC, RVN, KAS, ERG, FLUX, XMR
- Pool intégré en émulation
- Micro-paquets μ
- BTC réel / factures réelles / watts réels = UNAVAILABLE
*/

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

fs.mkdirSync("runtime_state/benchmark",{recursive:true});
const OUT="runtime_state/benchmark/trillionx_eof_bankrupt_miner_free_start_economy_last.json";

function envN(k,d){const v=Number(process.env[k]);return Number.isFinite(v)?v:d;}
function round(x,d=6){return +Number(x).toFixed(d);}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}

const CFG={
  farms:envN("TRILLIONX_ENTERPRISE_FARMS",120),
  miners_per_farm:envN("TRILLIONX_MINERS_PER_FARM",240),
  years:envN("TRILLIONX_YEARS",10),
  kwh_eur:envN("TRILLIONX_KWH_EUR",0.12),
  target_saving_ratio:envN("TRILLIONX_TARGET_SAVING_RATIO",0.89),
  base_rounds:envN("TRILLIONX_BASE_ROUNDS",50000),
  max_stages:envN("TRILLIONX_MAX_STAGES",8),
  packet_kb:envN("TRILLIONX_PACKET_KB",8),
  x10_nodes:envN("TRILLIONX_X10_NODE_COUNT",10),
  qn_layers:envN("TRILLIONX_QN_LAYERS",8),
  mirrors:envN("TRILLIONX_MIRRORS",16),
  lanes:envN("TRILLIONX_LANES",64),
  difficulty_growth_good:envN("TRILLIONX_DIFFICULTY_GROWTH_GOOD",1.42),
  difficulty_growth_stable:envN("TRILLIONX_DIFFICULTY_GROWTH_STABLE",1.12)
};

const PROTOCOLS=[
  {id:"BTC",family:"UTXO",algo:"SHA-256",kw:3.5,unit_rate:200,price:60000,reward_day:0.45,fee:0.02,stale:0.008,reject:0.004,cause_weight_energy:1.00,cause_weight_pool:0.92},
  {id:"BCH",family:"UTXO",algo:"SHA-256",kw:3.5,unit_rate:200,price:450,reward_day:0.015,fee:0.02,stale:0.009,reject:0.005,cause_weight_energy:0.97,cause_weight_pool:0.88},
  {id:"LTC_DOGE",family:"UTXO",algo:"Scrypt",kw:3.4,unit_rate:16,price:85,reward_day:0.032,fee:0.025,stale:0.011,reject:0.006,cause_weight_energy:0.94,cause_weight_pool:0.86},
  {id:"ETH_EVM",family:"ACCOUNT",algo:"EVM_EXECUTION",kw:0.18,unit_rate:1,price:3000,reward_day:0.000015,fee:0.01,stale:0.003,reject:0.002,cause_weight_energy:0.35,cause_weight_pool:1.00},
  {id:"ETC",family:"ACCOUNT",algo:"Etchash",kw:0.32,unit_rate:1.2,price:25,reward_day:0.021,fee:0.02,stale:0.012,reject:0.006,cause_weight_energy:0.48,cause_weight_pool:0.84},
  {id:"RVN",family:"UTXO",algo:"KawPow",kw:0.28,unit_rate:45,price:0.025,reward_day:0.018,fee:0.02,stale:0.018,reject:0.008,cause_weight_energy:0.46,cause_weight_pool:0.80},
  {id:"KAS",family:"UTXO_DAG",algo:"kHeavyHash",kw:3.2,unit_rate:21,price:0.12,reward_day:0.024,fee:0.02,stale:0.014,reject:0.007,cause_weight_energy:0.91,cause_weight_pool:0.86},
  {id:"ERG",family:"UTXO",algo:"Autolykos",kw:0.26,unit_rate:220,price:1.4,reward_day:0.016,fee:0.02,stale:0.012,reject:0.006,cause_weight_energy:0.44,cause_weight_pool:0.84},
  {id:"FLUX",family:"UTXO",algo:"ZelHash",kw:0.30,unit_rate:120,price:0.65,reward_day:0.014,fee:0.02,stale:0.013,reject:0.007,cause_weight_energy:0.45,cause_weight_pool:0.83},
  {id:"XMR",family:"PRIVACY_ACCOUNT_LIKE",algo:"RandomX",kw:0.12,unit_rate:20,price:150,reward_day:0.0009,fee:0.015,stale:0.006,reject:0.004,cause_weight_energy:0.32,cause_weight_pool:0.95}
];

const units=CFG.farms*CFG.miners_per_farm;

function quickDiagnoseProtocol(p){
  const baselineMW=units*p.kw/1000;
  const energyRisk=baselineMW*p.cause_weight_energy;
  const poolRisk=(p.stale+p.reject+p.fee)*p.cause_weight_pool*1000;
  const bankruptcyPressure=energyRisk*0.72+poolRisk*0.28;
  return {
    protocol:p.id,
    algo:p.algo,
    family:p.family,
    baseline_MW:round(baselineMW,3),
    pool_loss_signal:round(poolRisk,6),
    bankruptcy_pressure:round(bankruptcyPressure,6),
    cause:
      energyRisk>poolRisk ? "ELECTRICITY_COST_DOMINANT" :
      "POOL_PROTOCOL_LOSS_DOMINANT"
  };
}

function stageRun(protocol, stage, rounds, previousDigest){
  let digest=previousDigest;
  let cache=new Map();
  let packets=0,jobs=0,bytes=0,hit=0,miss=0,acc=0,rej=0,stale=0,latSum=0,latMax=0;

  const t0=performance.now();

  for(let i=0;i<rounds;i++){
    const l0=performance.now();
    const key=`${protocol.id}|stage=${stage}|f=${i%CFG.farms}|m=${i%CFG.miners_per_farm}|lane=${i%CFG.lanes}|mirror=${i%CFG.mirrors}`;
    const h=crypto.createHash("sha256").update(key+digest+i).digest("hex");
    digest=crypto.createHash("sha256").update(digest+h).digest("hex");

    if(cache.has(key)) hit++; else miss++;
    cache.set(key,h);
    if(cache.size>8192) cache.delete(cache.keys().next().value);

    const score=parseInt(h.slice(0,8),16)/0xffffffff;
    const reuse=hit/Math.max(hit+miss,1);
    const lat=performance.now()-l0;

    const dynReject=clamp(protocol.reject*(1-reuse),0,0.06);
    const dynStale=clamp(protocol.stale*(1+lat*4),0,0.08);

    if(score<dynReject) rej++;
    else if(score<dynReject+dynStale) stale++;
    else acc++;

    packets++;
    jobs+=CFG.x10_nodes*CFG.qn_layers;
    bytes+=CFG.packet_kb*1024;
    latSum+=lat;
    if(lat>latMax) latMax=lat;
  }

  const dur=(performance.now()-t0)/1000;
  const acceptedRatio=acc/Math.max(acc+rej+stale,1);
  const rejectRatio=rej/Math.max(acc+rej+stale,1);
  const staleRatio=stale/Math.max(acc+rej+stale,1);
  const reuse=hit/Math.max(hit+miss,1);
  const latencyMean=latSum/Math.max(packets,1);
  const latencyFactor=clamp(1/(1+latencyMean*8),0,1);
  const packetFactor=clamp(Math.log10(Math.max(packets/Math.max(dur,0.001),10))/8,0,0.55);
  const poolEfficiency=acceptedRatio*(1-protocol.fee);

  const savingRatio=clamp(
    reuse*0.40 +
    poolEfficiency*0.27 +
    latencyFactor*0.18 +
    packetFactor*0.15,
    0,
    0.94
  );

  const baselineMW=units*protocol.kw/1000;
  const optimizedMW=baselineMW*(1-savingRatio);
  const baselineCost=baselineMW*1000*24*365*CFG.years*CFG.kwh_eur;
  const optimizedCost=optimizedMW*1000*24*365*CFG.years*CFG.kwh_eur;
  const savedCost=baselineCost-optimizedCost;

  const fleetThroughput=units*protocol.unit_rate;
  const grossRewardDay=(fleetThroughput/1_000_000)*protocol.reward_day;
  const netRewardDay=grossRewardDay*poolEfficiency;
  const netReward10y=netRewardDay*365*CFG.years;
  const revenue10y=netReward10y*protocol.price;

  return {
    digest,
    result:{
      stage,
      protocol:protocol.id,
      algo:protocol.algo,
      family:protocol.family,
      rounds,
      packets,
      packets_s:round(packets/Math.max(dur,0.001),3),
      jobs,
      jobs_s:round(jobs/Math.max(dur,0.001),3),
      data_MB_s:round((bytes/1024/1024)/Math.max(dur,0.001),3),
      latency_mean_ms:round(latencyMean,6),
      latency_max_ms:round(latMax,6),
      cache_hits:hit,
      cache_miss:miss,
      accepted_shares:acc,
      rejected_shares:rej,
      stale_shares:stale,
      accepted_ratio:round(acceptedRatio,6),
      reject_ratio:round(rejectRatio,6),
      stale_ratio:round(staleRatio,6),
      saving_ratio_model:round(savingRatio,6),
      target_saving_ratio:CFG.target_saving_ratio,
      target_proximity:round(savingRatio/CFG.target_saving_ratio,6),
      baseline_MW:round(baselineMW,3),
      optimized_MW_model:round(optimizedMW,3),
      electricity_10y_saved_EUR_model:round(savedCost,2),
      net_reward_day_model:round(netRewardDay,10),
      net_reward_10y_model:round(netReward10y,10),
      revenue_10y_EUR_model:round(revenue10y,2),
      BTC_REAL:"UNAVAILABLE"
    }
  };
}

const t0=performance.now();

const diagnosis=PROTOCOLS.map(quickDiagnoseProtocol).sort((a,b)=>b.bankruptcy_pressure-a.bankruptcy_pressure);
const chosen=PROTOCOLS.find(p=>p.id===diagnosis[0].protocol);

let digest=`TRILLIONX_FREE_START_${chosen.id}`;
let rounds=CFG.base_rounds;
let previousSaving=0;
let stages=[];

for(let s=1;s<=CFG.max_stages;s++){
  const run=stageRun(chosen,s,Math.floor(rounds),digest);
  digest=run.digest;

  let next;
  if(run.result.saving_ratio_model>previousSaving+0.045){
    next="INCREASE_DIFFICULTY";
    previousSaving=run.result.saving_ratio_model;
    rounds*=CFG.difficulty_growth_good;
  }else{
    next="STABILIZE_AND_EXTEND";
    rounds*=CFG.difficulty_growth_stable;
  }

  run.result.auto_adapt_next=next;
  stages.push(run.result);
}

const last=stages[stages.length-1];

const report={
  module:"TRILLIONX_EOF_BANKRUPT_MINER_FREE_START_ECONOMY",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_BANKRUPT_MINER_ECONOMY_FREE_START",
  benchmark_goal:"89_percent_electricity_saving_model_for_mining_rescue",
  mode:"FREE_START_CAUSE_PRIORITY",
  auto_param:true,

  config:CFG,

  bankruptcy_diagnosis:{
    meaning:"TRILLIONX chooses the start protocol by estimated bankruptcy pressure: energy cost + pool/protocol loss.",
    ranking:diagnosis,
    chosen_start:{
      protocol:chosen.id,
      algo:chosen.algo,
      family:chosen.family,
      cause:diagnosis[0].cause,
      reason:"highest modeled bankruptcy pressure"
    }
  },

  stages,

  final:{
    protocol:chosen.id,
    algo:chosen.algo,
    cause:diagnosis[0].cause,
    saving_ratio_model:last.saving_ratio_model,
    target_saving_ratio:CFG.target_saving_ratio,
    target_reached_model:last.saving_ratio_model>=CFG.target_saving_ratio,
    target_proximity:last.target_proximity,
    baseline_MW:last.baseline_MW,
    optimized_MW_model:last.optimized_MW_model,
    electricity_10y_saved_EUR_model:last.electricity_10y_saved_EUR_model,
    accepted_ratio:last.accepted_ratio,
    reject_ratio:last.reject_ratio,
    stale_ratio:last.stale_ratio,
    net_reward_day_model:last.net_reward_day_model,
    net_reward_10y_model:last.net_reward_10y_model,
    revenue_10y_EUR_model:last.revenue_10y_EUR_model,
    BTC_REAL:"UNAVAILABLE",
    economy_feasible_model:last.saving_ratio_model>=0.70 && last.accepted_ratio>=0.90
  },

  host_support_only:{
    cpus:os.cpus().length,
    ram_total_GB:gb(os.totalmem()),
    ram_free_GB:gb(os.freemem()),
    node:process.version
  },

  duration_s:round((performance.now()-t0)/1000,6),

  verdict:{
    state:"BANKRUPT_MINER_FREE_START_COMPLETE",
    line:"TRILLIONX chose the starting protocol by bankruptcy cause, then auto-adapted difficulty as savings improved.",
    chosen_protocol:chosen.id,
    chosen_cause:diagnosis[0].cause,
    economy_realizable_model:last.saving_ratio_model>=0.70 && last.accepted_ratio>=0.90,
    target_89_reached_model:last.saving_ratio_model>=CFG.target_saving_ratio,
    real:"TRILLIONX runtime execution",
    modeled:"bankrupt mining company, pool, protocol, electricity savings, rewards",
    unavailable:"real BTC, real invoice, real wattmeter, real pool shares"
  },

  trillionx_phrase:
    `TRILLIONX: I started with ${chosen.id} because the modeled bankruptcy cause is ${diagnosis[0].cause}; I increased difficulty only when the economy signal improved.`,

  integrity:{
    digest:digest.slice(0,64),
    digest_short:digest.slice(0,32)
  },

  time:new Date().toISOString()
};

fs.writeFileSync(OUT,JSON.stringify(report,null,2));

console.log("===== TRILLIONX EOF BANKRUPT MINER FREE START ECONOMY =====");
console.log("Chosen start protocol        :",report.final.protocol);
console.log("Chosen cause                 :",report.final.cause);
console.log("Duration s                   :",report.duration_s);
console.log("Stages                       :",stages.length);
console.log("Saving ratio model           :",report.final.saving_ratio_model);
console.log("Target saving ratio          :",report.final.target_saving_ratio);
console.log("Target reached model         :",report.final.target_reached_model);
console.log("Target proximity             :",report.final.target_proximity);
console.log("Baseline MW                  :",report.final.baseline_MW);
console.log("Optimized MW model           :",report.final.optimized_MW_model);
console.log("Electricity saved 10y EUR    :",report.final.electricity_10y_saved_EUR_model);
console.log("Accepted ratio               :",report.final.accepted_ratio);
console.log("Reject ratio                 :",report.final.reject_ratio);
console.log("Stale ratio                  :",report.final.stale_ratio);
console.log("Economy feasible model       :",report.final.economy_feasible_model);
console.log("BTC REAL                     : UNAVAILABLE");
console.log("TRILLIONX phrase             :",report.trillionx_phrase);
console.log("Report                       :",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
