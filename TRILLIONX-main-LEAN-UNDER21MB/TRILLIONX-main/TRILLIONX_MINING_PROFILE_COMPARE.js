"use strict";
const fs=require("fs");

const src="runtime_state/bench/trillionx_only_mining_10y_micro_packet_last.json";
const out="runtime_state/bench/trillionx_mining_profile_compare_last.json";

function read(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
const r=read(src);

if(!r){
  console.log("TRILLIONX mining report missing:",src);
  process.exit(1);
}

const tx=r.trillionx_mining_metrics||{};
const p10=r.trillionx_10y_projection||{};

const trillionx={
  name:"TRILLIONX_ONLY_FULL_COMPUTER",
  type:"software_computer_μ_packet_logic",
  measured:true,
  packets_s:tx.packets_s,
  raw_MB_s:tx.raw_MB_s,
  integrity_percent:tx.integrity_percent,
  hash_jobs_s:p10.trillionx_logic_hash_jobs_s,
  hash_jobs_10y:p10.trillionx_logic_hash_jobs_10y,
  ram_rss_GB:r.trillionx_ram_pool?.after?.trillionx_process_rss_GB,
  btc_10y:"UNAVAILABLE",
  electricity_coverage:"UNAVAILABLE",
  reading:"Measured local TRILLIONX logic benchmark. No pool, no wallet, no reward."
};

const profiles=[
  {
    name:"CPU_SOLO_DIRECT",
    type:"direct_local_hashing",
    comparison:"TRILLIONX likely better for orchestration/stability; CPU direct is only raw local work.",
    btc_claim:false
  },
  {
    name:"GPU_MINING_PROFILE",
    type:"parallel_gpu_hashing",
    comparison:"GPU wins raw throughput on compatible algorithms; TRILLIONX compares as routing/cache/control logic.",
    btc_claim:false
  },
  {
    name:"ASIC_BTC_SHA256_PROFILE",
    type:"real_sha256_specialized_mining",
    comparison:"ASIC wins BTC raw hashrate. TRILLIONX is not claiming ASIC replacement without shares/rewards.",
    btc_claim:false
  },
  {
    name:"FARM_DATACENTER_PROFILE",
    type:"industrial_scale_mining",
    comparison:"Farm wins scale. TRILLIONX targets useful logic, avoided jobs, monitoring, and waste reduction.",
    btc_claim:false
  },
  {
    name:"TRILLIONX_ONLY_PROFILE",
    type:"full_software_computer",
    comparison:"Measured: integrity 100 if report shows 100; RAM low; health controlled.",
    btc_claim:false
  }
];

const report={
  module:"TRILLIONX_MINING_PROFILE_COMPARE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_ONLY",
  no_codespaces_identity:true,
  no_power_word:true,
  no_profit_claim:true,
  no_fake_btc:true,
  trillionx_measured:trillionx,
  mining_profiles:profiles,
  verdict:{
    raw_btc_hashrate:"ASIC/GPU/Farm win if real hashrate is the criterion.",
    trillionx_strength:"TRILLIONX wins only on measured logic layer: μ-packets, integrity, RAM discipline, RAID60+/cache architecture, orchestration, jobs avoided.",
    btc_result:"UNAVAILABLE until real pool shares/rewards exist.",
    final:"Compare TRILLIONX as an ordinateur logiciel, not as fake ASIC."
  }
};

fs.writeFileSync(out,JSON.stringify(report,null,2));

console.log("===== TRILLIONX MINING PROFILE COMPARE =====");
console.log("TRILLIONX packets/s      :",trillionx.packets_s);
console.log("TRILLIONX raw MB/s       :",trillionx.raw_MB_s);
console.log("TRILLIONX integrity      :",trillionx.integrity_percent,"%");
console.log("TRILLIONX hash-jobs/s    :",trillionx.hash_jobs_s);
console.log("TRILLIONX hash-jobs 10y  :",trillionx.hash_jobs_10y);
console.log("CPU profile              : compare orchestration vs direct local work");
console.log("GPU profile              : GPU wins raw compatible algos");
console.log("ASIC BTC profile         : ASIC wins raw BTC SHA-256");
console.log("Farm profile             : farm wins scale; TRILLIONX aims useful logic");
console.log("BTC result               : UNAVAILABLE without real pool shares/rewards");
console.log("Report                   :",out);
console.log("REAL_ONLY_OR_UNAVAILABLE");
