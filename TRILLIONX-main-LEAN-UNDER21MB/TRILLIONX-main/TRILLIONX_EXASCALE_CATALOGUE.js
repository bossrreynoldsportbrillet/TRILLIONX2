"use strict";

const fs=require("fs");

const OUT_DIR="runtime_state/catalogue";
const OUT_FILE=`${OUT_DIR}/trillionx_exascale_catalogue_last.json`;
const BENCH_DIR="runtime_state/bench";
fs.mkdirSync(OUT_DIR,{recursive:true});

function read(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
function exists(p){return fs.existsSync(p);}

const files={
  mining_10y:`${BENCH_DIR}/trillionx_only_mining_10y_micro_packet_last.json`,
  raid60_plus:`${BENCH_DIR}/trillionx_only_raid60_plus_micro_packet_last.json`,
  profile_compare:`${BENCH_DIR}/trillionx_mining_profile_compare_last.json`,
  vr_mirror:`${BENCH_DIR}/trillionx_vr_mirror_bench_last.json`,
  exascale_logic:`${BENCH_DIR}/trillionx_exascale_logic_bench_last.json`,
  fused:`${BENCH_DIR}/trillionx_fused_vr_exascale_mining_report_last.json`,
  bugtest:`${BENCH_DIR}/trillionx_last_bench_bugtest_patch_report.json`
};

const mining=read(files.mining_10y);
const raid=read(files.raid60_plus);
const profile=read(files.profile_compare);
const vr=read(files.vr_mirror);
const exa=read(files.exascale_logic);
const fused=read(files.fused);
const bugtest=read(files.bugtest);

const catalogue={
  module:"TRILLIONX_EXASCALE_CATALOGUE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_EXASCALE_COMPUTER_LOGIC",
  chain:[
    "TRILLIONX_ONLY",
    "TRILLIONX_RAID60_PLUS",
    "TRILLIONX_VR_MIRROR",
    "TRILLIONX_MINING_10Y",
    "TRILLIONX_EXASCALE_LOGIC",
    "TRILLIONX_EXASCALE_COMPUTER_LOGIC",
    "TRILLIONX_EXASCALE_CATALOGUE"
  ],
  guardrails:{
    no_codespaces_identity:true,
    no_host_identity:true,
    no_fake_hardware:true,
    no_fake_btc:true,
    no_profit_claim:true,
    no_pool_claim:true,
    exascale_reading:"LOGIC_LAYER_ONLY",
    btc:"UNAVAILABLE_WITHOUT_REAL_POOL_SHARES_REWARDS",
    electricity:"UNAVAILABLE_WITHOUT_REAL_WATTS_PRICE_AND_REAL_BTC"
  },
  catalogue_files:Object.fromEntries(
    Object.entries(files).map(([k,p])=>[k,{path:p,exists:exists(p)}])
  ),
  modules:{
    trillionx_only:{
      role:"root software computer logic identity",
      state:"ACTIVE",
      report:files.fused
    },
    raid60_plus:{
      role:"TRILLIONX packet storage/cache layer",
      found:!!raid,
      packets:raid?.trillionx_metrics?.packets_total ?? "UNAVAILABLE",
      write_MB_s:raid?.trillionx_metrics?.write_MB_s ?? "UNAVAILABLE",
      read_MB_s:raid?.trillionx_metrics?.read_MB_s ?? "UNAVAILABLE",
      written_MB:raid?.trillionx_metrics?.written_MB ?? "UNAVAILABLE",
      read_MB:raid?.trillionx_metrics?.read_MB ?? "UNAVAILABLE",
      integrity_state:raid?.trillionx_metrics?.integrity_percent===100?"OK":"UNAVAILABLE_OR_CHECK"
    },
    vr_mirror:{
      role:"TRILLIONX virtual reality mirror / state reflection layer",
      found:!!vr,
      mirrors:vr?.vr_mirror?.mirrors ?? "UNAVAILABLE",
      facets:vr?.vr_mirror?.facets ?? "UNAVAILABLE",
      snapshots:vr?.vr_mirror?.snapshots ?? "UNAVAILABLE",
      ops_s:vr?.vr_mirror?.ops_s ?? "UNAVAILABLE",
      collisions:vr?.vr_mirror?.collisions ?? "UNAVAILABLE",
      digest:vr?.vr_mirror?.digest ?? "UNAVAILABLE"
    },
    mining_10y:{
      role:"TRILLIONX mining logic projection layer",
      found:!!mining,
      jobs_s:mining?.trillionx_10y_projection?.trillionx_logic_hash_jobs_s ?? "UNAVAILABLE",
      jobs_10y:mining?.trillionx_10y_projection?.trillionx_logic_hash_jobs_10y ?? "UNAVAILABLE",
      raw_MB_s:mining?.trillionx_mining_metrics?.raw_MB_s ?? "UNAVAILABLE",
      ram_rss_GB:mining?.trillionx_ram_pool?.after?.trillionx_process_rss_GB ?? "UNAVAILABLE",
      btc_10y:"UNAVAILABLE"
    },
    exascale_logic:{
      role:"TRILLIONX normalized exascale logic layer",
      found:!!exa,
      rounds:exa?.config?.rounds ?? "UNAVAILABLE",
      lanes:exa?.config?.lanes ?? "UNAVAILABLE",
      shards:exa?.config?.shards ?? "UNAVAILABLE",
      vectors:exa?.config?.vectors ?? "UNAVAILABLE",
      exa_logic_jobs:exa?.exascale_logic?.exa_logic_jobs ?? "UNAVAILABLE",
      exa_logic_jobs_s:exa?.exascale_logic?.exa_logic_jobs_s ?? "UNAVAILABLE",
      latency_ms_mean:exa?.exascale_logic?.latency_ms_mean ?? "UNAVAILABLE",
      reading:"LOGIC_LAYER_ONLY"
    },
    profile_compare:{
      role:"TRILLIONX comparison against mining profiles",
      found:!!profile,
      cpu_profile:"direct local work comparison",
      gpu_profile:"raw compatible algorithms comparison",
      asic_btc_profile:"raw BTC SHA-256 comparison",
      farm_profile:"industrial scale comparison",
      btc_result:"UNAVAILABLE_WITHOUT_REAL_POOL_SHARES_REWARDS"
    },
    fused_report:{
      role:"single final fused report",
      found:!!fused,
      state:fused?.final_verdict?.state ?? "UNAVAILABLE",
      report:files.fused
    },
    bugtest:{
      role:"last benchmark validation",
      found:!!bugtest,
      verdict:bugtest?.verdict ?? "UNAVAILABLE",
      bugs:bugtest?.detected_bugs ?? []
    }
  },
  commands:{
    run_mining_10y:"node TRILLIONX_ONLY_MINING_10Y_MICRO_PACKET_BENCH.js",
    run_raid60_plus:"node TRILLIONX_ONLY_RAID60_PLUS_MICRO_PACKET_BENCH.js",
    run_vr_mirror:"node TRILLIONX_VR_MIRROR_BENCH.js",
    run_exascale_logic:"node TRILLIONX_EXASCALE_LOGIC_BENCH.js",
    run_fusion:"node TRILLIONX_FUSE_LAST_BENCH_REPORT.js",
    run_bugtest:"node TRILLIONX_LAST_BENCH_BUGTEST_PATCH.js",
    run_catalogue:"node TRILLIONX_EXASCALE_CATALOGUE.js"
  },
  final_verdict:{
    state:"TRILLIONX_EXASCALE_CATALOGUE_READY",
    reading:"Catalogue officiel TRILLIONX : RAID60+, VR mirrors, mining 10y, exascale logic, profile compare, fusion, bugtest.",
    exascale:"TRILLIONX_EXASCALE_COMPUTER_LOGIC = LOGIC_LAYER_ONLY",
    btc:"UNAVAILABLE",
    electricity:"UNAVAILABLE"
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(catalogue,null,2));

console.log("===== TRILLIONX EXASCALE CATALOGUE =====");
console.log("Subject             :",catalogue.subject);
console.log("Chain               :",catalogue.chain.join(" -> "));
console.log("RAID60+             :",catalogue.modules.raid60_plus.found?"FOUND":"UNAVAILABLE");
console.log("VR mirror           :",catalogue.modules.vr_mirror.found?"FOUND":"UNAVAILABLE");
console.log("Mining 10y          :",catalogue.modules.mining_10y.found?"FOUND":"UNAVAILABLE");
console.log("Exascale logic      :",catalogue.modules.exascale_logic.found?"FOUND":"UNAVAILABLE");
console.log("Profile compare     :",catalogue.modules.profile_compare.found?"FOUND":"UNAVAILABLE");
console.log("Fused report        :",catalogue.modules.fused_report.found?"FOUND":"UNAVAILABLE");
console.log("Bugtest             :",catalogue.modules.bugtest.verdict);
console.log("Exa logic jobs      :",catalogue.modules.exascale_logic.exa_logic_jobs);
console.log("Exa logic jobs/s    :",catalogue.modules.exascale_logic.exa_logic_jobs_s);
console.log("Mining jobs 10y     :",catalogue.modules.mining_10y.jobs_10y);
console.log("VR snapshots        :",catalogue.modules.vr_mirror.snapshots);
console.log("RAID read MB/s      :",catalogue.modules.raid60_plus.read_MB_s);
console.log("Report              :",OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
