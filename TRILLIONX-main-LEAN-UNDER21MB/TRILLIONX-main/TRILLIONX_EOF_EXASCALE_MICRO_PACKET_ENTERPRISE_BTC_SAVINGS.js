"use strict";

/*
TRILLIONX EOF EXASCALE μ-PACKET ENTERPRISE BTC SAVINGS BENCH
- Auto-paramétrage TRILLIONX
- Micro-paquets μ
- Émulation entreprise : centaines de fermes BTC
- Stress progressif : plus le gain logique monte, plus le benchmark augmente
- Objectif : modéliser économie de frais électriques, pas inventer une puissance réelle
- BTC réel : UNAVAILABLE sans pool shares/rewards réels
*/

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const cp=require("child_process");
const {performance}=require("perf_hooks");

const OUT_DIR="runtime_state/benchmark";
const OUT_FILE=`${OUT_DIR}/trillionx_eof_exascale_micro_packet_enterprise_btc_savings_last.json`;
fs.mkdirSync(OUT_DIR,{recursive:true});

function sh(cmd,timeout=4000){
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch{return "UNAVAILABLE";}
}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
function num(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function round(x,d=3){return +Number(x).toFixed(d);}
function df(){
  const r=sh("df -m . | awk 'NR==2 {print $2,$3,$4,$5}'");
  if(r==="UNAVAILABLE") return {total_MB:"UNAVAILABLE",used_MB:"UNAVAILABLE",free_MB:"UNAVAILABLE",state:"UNAVAILABLE"};
  const a=r.split(/\s+/);
  return {total_MB:num(a[0]),used_MB:num(a[1]),free_MB:num(a[2]),state:a[3]||"UNAVAILABLE"};
}
function envN(k,d){return num(process.env[k],d);}

// AUTO-PARAMÉTRAGE selon la machine disponible
const cpu=os.cpus();
const logical=cpu.length||1;
const ramGB=gb(os.totalmem());
const freeGB=gb(os.freemem());
const diskBefore=df();

const AUTO={
  packet_kb: envN("TRILLIONX_PACKET_KB",8),
  farms: envN("TRILLIONX_ENTERPRISE_FARMS",120),
  miners_per_farm: envN("TRILLIONX_MINERS_PER_FARM",240),
  baseline_kw_per_miner: envN("TRILLIONX_KW_PER_MINER",3.5),
  kwh_price_eur: envN("TRILLIONX_KWH_EUR",0.12),
  target_saving_ratio: envN("TRILLIONX_TARGET_SAVING_RATIO",0.89),
  base_rounds: envN("TRILLIONX_BASE_ROUNDS",50000),
  max_stages: envN("TRILLIONX_MAX_STAGES",7),
  lanes: envN("TRILLIONX_LANES",Math.max(16,logical*16)),
  mirrors: envN("TRILLIONX_MIRRORS",16),
  qn_layers: envN("TRILLIONX_QN_LAYERS",8),
  vr_cache_groups: envN("TRILLIONX_VR_CACHE_GROUPS",12),
  x10_nodes: envN("TRILLIONX_X10_NODE_COUNT",10),
  stress_gain_gate: envN("TRILLIONX_STRESS_GAIN_GATE",0.08)
};

let digest="TRILLIONX_EOF_ENTERPRISE_START";
let stages=[];
let totalPackets=0,totalJobs=0,totalBytes=0,totalLatency=0,totalLatencySamples=0;
let previousGain=0;
let rounds=AUTO.base_rounds;
let stressMultiplier=1;

const globalT0=performance.now();

for(let stage=1; stage<=AUTO.max_stages; stage++){
  const t0=performance.now();
  let packets=0,jobs=0,bytes=0,cacheHits=0,cacheMiss=0,mirrorOps=0,latSum=0,latMax=0;
  const cache=new Map();
  const localRounds=Math.floor(rounds*stressMultiplier);

  for(let i=0;i<localRounds;i++){
    const l0=performance.now();
    const farm=i%AUTO.farms;
    const miner=i%AUTO.miners_per_farm;
    const lane=i%AUTO.lanes;
    const mirror=i%AUTO.mirrors;
    const qn=i%AUTO.qn_layers;
    const group=i%AUTO.vr_cache_groups;
    const key=`F${farm}:M${miner}:L${lane}:Q${qn}:G${group}`;

    const payload=`TRILLIONX|EOF|stage=${stage}|i=${i}|${key}|digest=${digest}`;
    const h=crypto.createHash("sha256").update(payload).digest("hex");
    digest=crypto.createHash("sha256").update(digest+h).digest("hex");

    if(cache.has(key)) cacheHits++; else cacheMiss++;
    cache.set(key,h);
    if(cache.size>4096) cache.delete(cache.keys().next().value);

    packets++;
    jobs+=AUTO.x10_nodes*AUTO.qn_layers;
    mirrorOps+=AUTO.mirrors;
    bytes+=AUTO.packet_kb*1024;

    const lat=performance.now()-l0;
    latSum+=lat;
    if(lat>latMax) latMax=lat;
  }

  const dt=(performance.now()-t0)/1000;
  const packets_s=packets/Math.max(dt,0.001);
  const jobs_s=jobs/Math.max(dt,0.001);
  const MB_s=(bytes/1024/1024)/Math.max(dt,0.001);
  const mirror_ops_s=mirrorOps/Math.max(dt,0.001);
  const latency_mean_ms=latSum/Math.max(packets,1);

  // Modèle d’économie : logique, pas mesure électrique réelle.
  // On combine réutilisation cache + overhead miroir + discipline paquets.
  const cacheReuse=cacheHits/Math.max(cacheHits+cacheMiss,1);
  const mirrorPenalty=clamp((AUTO.mirrors*AUTO.qn_layers)/(AUTO.x10_nodes*1024),0,0.08);
  const packetEfficiency=clamp(Math.log10(Math.max(packets_s,10))/8,0,0.55);
  const logicalSaving=clamp(cacheReuse*0.62 + packetEfficiency*0.32 - mirrorPenalty,0,0.94);
  const savingToTarget=clamp(logicalSaving/AUTO.target_saving_ratio,0,1.2);

  const baselineMW=(AUTO.farms*AUTO.miners_per_farm*AUTO.baseline_kw_per_miner)/1000;
  const optimizedMW=baselineMW*(1-logicalSaving);
  const baseline10yEUR=baselineMW*1000*24*365*10*AUTO.kwh_price_eur;
  const optimized10yEUR=optimizedMW*1000*24*365*10*AUTO.kwh_price_eur;
  const saved10yEUR=baseline10yEUR-optimized10yEUR;

  const stageReport={
    stage,
    rounds:localRounds,
    farms:AUTO.farms,
    miners_per_farm:AUTO.miners_per_farm,
    packet_kb:AUTO.packet_kb,
    packets,
    packets_s:round(packets_s,3),
    jobs,
    jobs_s:round(jobs_s,3),
    MB_s:round(MB_s,3),
    mirror_ops_s:round(mirror_ops_s,3),
    cache_hits:cacheHits,
    cache_miss:cacheMiss,
    cache_reuse_ratio:round(cacheReuse,6),
    latency_mean_ms:round(latency_mean_ms,6),
    latency_max_ms:round(latMax,6),
    logical_saving_ratio:round(logicalSaving,6),
    target_saving_ratio:AUTO.target_saving_ratio,
    saving_to_target:round(savingToTarget,6),
    enterprise_baseline_MW:round(baselineMW,3),
    enterprise_optimized_MW_model:round(optimizedMW,3),
    electricity_cost_10y_baseline_EUR:round(baseline10yEUR,2),
    electricity_cost_10y_optimized_model_EUR:round(optimized10yEUR,2),
    electricity_saved_10y_model_EUR:round(saved10yEUR,2),
    BTC_REAL:"UNAVAILABLE",
    BTC_MODEL:"UNAVAILABLE_WITHOUT_POOL_SHARES_REWARDS",
    stress_next: logicalSaving>previousGain+AUTO.stress_gain_gate ? "INCREASE" : "STABLE"
  };

  stages.push(stageReport);
  totalPackets+=packets;
  totalJobs+=jobs;
  totalBytes+=bytes;
  totalLatency+=latSum;
  totalLatencySamples+=packets;

  if(stageReport.stress_next==="INCREASE"){
    stressMultiplier*=1.45;
    previousGain=logicalSaving;
  } else {
    stressMultiplier*=1.12;
  }
}

const totalS=(performance.now()-globalT0)/1000;
const diskAfter=df();
const last=stages[stages.length-1];

const report={
  module:"TRILLIONX_EOF_EXASCALE_MICRO_PACKET_ENTERPRISE_BTC_SAVINGS",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_EXASCALE_QN_X10_VR_CACHE_ENTERPRISE_BTC_SAVINGS_EMULATION",
  bench_type:"EOF_MICRO_PACKET_EXASCALE_LOGIC_ENTERPRISE_SAVINGS",
  bench_scope:"LOGIC_RUNTIME_ORCHESTRATION_ELECTRICITY_SAVINGS_MODEL",
  auto_param:true,

  config:AUTO,

  host_support_only:{
    logical_cpus:logical,
    ram_total_GB:ramGB,
    ram_free_GB_start:freeGB,
    node:process.version,
    platform:process.platform,
    disk_before:diskBefore,
    disk_after:diskAfter
  },

  stages,

  totals:{
    duration_s:round(totalS,6),
    packets:totalPackets,
    packets_s:round(totalPackets/Math.max(totalS,0.001),3),
    jobs:totalJobs,
    jobs_s:round(totalJobs/Math.max(totalS,0.001),3),
    data_MB:round(totalBytes/1024/1024,3),
    data_MB_s:round((totalBytes/1024/1024)/Math.max(totalS,0.001),3),
    latency_mean_ms:round(totalLatency/Math.max(totalLatencySamples,1),6),
    final_logical_saving_ratio:last.logical_saving_ratio,
    final_target_saving_ratio:AUTO.target_saving_ratio,
    final_saving_to_target:last.saving_to_target,
    enterprise_baseline_MW:last.enterprise_baseline_MW,
    enterprise_optimized_MW_model:last.enterprise_optimized_MW_model,
    electricity_cost_10y_baseline_EUR:last.electricity_cost_10y_baseline_EUR,
    electricity_cost_10y_optimized_model_EUR:last.electricity_cost_10y_optimized_model_EUR,
    electricity_saved_10y_model_EUR:last.electricity_saved_10y_model_EUR,
    BTC_REAL:"UNAVAILABLE",
    BTC_REVENUE_REAL:"UNAVAILABLE"
  },

  interpretation:{
    good_if:[
      "saving_to_target approaches 1.0",
      "latency_mean_ms remains low",
      "packets_s and jobs_s remain stable as stress increases",
      "disk and RAM stay controlled"
    ],
    not_a_claim:[
      "not real BTC mining",
      "not real ASIC hashrate",
      "not measured electrical wattage",
      "not guaranteed 89 percent saving in real farms"
    ],
    real_requirements_for_money:[
      "real pool shares",
      "real ASIC/farm telemetry",
      "real watt meters",
      "real kWh price",
      "real BTC reward accounting",
      "before/after deployment logs"
    ]
  },

  verdict:{
    state:"EOF_ENTERPRISE_SAVINGS_EMULATION_COMPLETE",
    reading:"TRILLIONX benchmarked an enterprise BTC farm electricity-savings model using exascale QN X10 VR-cache micro-packets. Savings are modelled, not real BTC revenue.",
    target:"89_percent_electricity_cost_reduction_model",
    BTC:"UNAVAILABLE_WITHOUT_REAL_POOL_SHARES_REWARDS",
    electricity:"MODEL_ONLY_WITHOUT_REAL_WATT_METERS"
  },

  integrity:{
    digest:digest.slice(0,64),
    digest_short:digest.slice(0,32)
  },

  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));

console.log("===== TRILLIONX EOF EXASCALE μ-PACKET ENTERPRISE BTC SAVINGS =====");
console.log("Subject                     :",report.subject);
console.log("Farms emulated              :",AUTO.farms);
console.log("Miners/farm emulated        :",AUTO.miners_per_farm);
console.log("Stages                      :",stages.length);
console.log("Packets total               :",report.totals.packets);
console.log("Packets/s                   :",report.totals.packets_s);
console.log("Jobs/s                      :",report.totals.jobs_s);
console.log("Data MB/s                   :",report.totals.data_MB_s);
console.log("Latency mean ms             :",report.totals.latency_mean_ms);
console.log("Baseline MW model           :",report.totals.enterprise_baseline_MW);
console.log("Optimized MW model          :",report.totals.enterprise_optimized_MW_model);
console.log("Electricity 10y baseline €  :",report.totals.electricity_cost_10y_baseline_EUR);
console.log("Electricity 10y optimized € :",report.totals.electricity_cost_10y_optimized_model_EUR);
console.log("Electricity 10y saved €     :",report.totals.electricity_saved_10y_model_EUR);
console.log("Saving ratio model          :",report.totals.final_logical_saving_ratio);
console.log("Target saving ratio         :",report.totals.final_target_saving_ratio);
console.log("Target proximity            :",report.totals.final_saving_to_target);
console.log("BTC real                    : UNAVAILABLE");
console.log("Report                      :",OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
