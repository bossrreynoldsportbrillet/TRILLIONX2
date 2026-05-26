"use strict";

const fs = require("fs");
const os = require("os");
const cp = require("child_process");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/eco_mining_health_10y.json`;

function readJson(p){
  try { return JSON.parse(fs.readFileSync(p,"utf8")); }
  catch { return null; }
}

function sh(cmd){
  try { return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:4000}).trim(); }
  catch { return "UNAVAILABLE"; }
}

function gb(x){ return +(x/1024/1024/1024).toFixed(3); }
function num(x, fallback=0){ return Number.isFinite(Number(x)) ? Number(x) : fallback; }

fs.mkdirSync(OUT_DIR,{recursive:true});

const eco = readJson("runtime_state/bench/eco_mining_micro_packet_last.json");
const standard = readJson("runtime_state/bench/micro_packet_last.json");
const defense = readJson("runtime_state/bench/planetary_defense_micro_packet_last.json");
const blockchain = readJson("runtime_state/bench/blockchain_micro_packet_last.json");
const heavy = readJson("runtime_state/bench/heavy_micro_packet_last.json");

const realState = {
  time: new Date().toISOString(),
  host: os.hostname(),
  cpu_model: os.cpus()[0]?.model || "UNAVAILABLE",
  logical_cpus: os.cpus().length,
  ram_total_GB: gb(os.totalmem()),
  ram_free_GB: gb(os.freemem()),
  disk_workspaces: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
  port_3000: sh("ss -lntp | grep ':3000' || true")
};

function healthScore(){
  let score = 100;
  const reasons = [];

  const diskLine = String(realState.disk_workspaces);
  const diskPctMatch = diskLine.match(/(\d+)%/);
  const diskPct = diskPctMatch ? Number(diskPctMatch[1]) : null;

  if(diskPct !== null && diskPct > 90){ score -= 30; reasons.push("disk_above_90_percent"); }
  else if(diskPct !== null && diskPct > 80){ score -= 15; reasons.push("disk_above_80_percent"); }

  if(realState.ram_free_GB < 0.5){ score -= 25; reasons.push("ram_free_below_0_5GB"); }
  else if(realState.ram_free_GB < 1.0){ score -= 12; reasons.push("ram_free_below_1GB"); }

  if(!realState.port_3000 || realState.port_3000 === "UNAVAILABLE"){ score -= 20; reasons.push("port_3000_unavailable"); }

  if(!eco){ score -= 20; reasons.push("eco_mining_bench_missing"); }
  if(!standard){ score -= 5; reasons.push("standard_micro_packet_missing"); }

  return { score: Math.max(0, score), reasons };
}

const baselineHashesS = eco ? num(eco.real_baseline?.hashes_s) : 0;
const ecoLogicalJobsS = eco ? num(eco.trillionx_eco_mining?.logical_jobs_s) : 0;
const ecoRealHashesS = eco ? num(eco.trillionx_eco_mining?.real_hashes_s) : 0;
const avoidedPercent = eco ? num(eco.trillionx_eco_mining?.avoided_percent) : 0;

const seconds10y = 10 * 365.25 * 24 * 3600;

const projected = eco ? {
  baseline_jobs_10y: Math.round(baselineHashesS * seconds10y),
  trillionx_logical_jobs_10y: Math.round(ecoLogicalJobsS * seconds10y),
  trillionx_real_hashes_10y: Math.round(ecoRealHashesS * seconds10y),
  avoided_jobs_10y_estimated: Math.round((ecoLogicalJobsS - ecoRealHashesS) * seconds10y),
  avoided_percent_observed: avoidedPercent,
  logical_jobs_ratio_vs_baseline: +(ecoLogicalJobsS / Math.max(baselineHashesS,1)).toFixed(4),
  real_hashes_ratio_vs_baseline: +(ecoRealHashesS / Math.max(baselineHashesS,1)).toFixed(4),
  interpretation: "10-year projection from local benchmark rate; not a profit claim, not a network mining claim"
} : {
  status: "UNAVAILABLE_NO_ECO_MINING_REPORT"
};

const report = {
  module: "TRILLIONX_ECO_MINING_HEALTH_10Y",
  doctrine: "REAL_ONLY_OR_UNAVAILABLE",
  no_profit_claim: true,
  no_physical_power_claim: true,
  no_network_pool_claim: true,
  meaning: "compare logical mining orchestration efficiency over 10 years from local μ-packet reports",
  real_state: realState,
  inputs_found: {
    eco_mining: !!eco,
    standard_micro_packet: !!standard,
    defense_micro_packet: !!defense,
    blockchain_micro_packet: !!blockchain,
    heavy_micro_packet: !!heavy
  },
  latest_metrics: {
    standard: standard ? {
      packets_s: standard.packets_s || standard.metrics?.micro_packets_per_s,
      throughput_MB_s: standard.throughput_MB_s || standard.metrics?.packet_MB_per_s,
      rss_GB: standard.rss_end_GB || standard.memory_process?.rss_GB_end
    } : "UNAVAILABLE",
    defense: defense ? {
      packets_s: defense.packets_s,
      throughput_MB_s: defense.throughput_MB_s,
      integrity_percent: defense.integrity_percent,
      rss_GB: defense.rss_end_GB
    } : "UNAVAILABLE",
    blockchain: blockchain ? {
      tx_s: blockchain.metrics?.tx_s,
      blocks_s: blockchain.metrics?.blocks_s,
      rss_GB: blockchain.memory_process?.rss_GB_end
    } : "UNAVAILABLE",
    heavy: heavy ? {
      packets_s: heavy.metrics?.packets_s,
      raw_MB_s: heavy.metrics?.raw_MB_s,
      rss_GB: heavy.memory_process?.rss_GB_end
    } : "UNAVAILABLE",
    eco_mining: eco ? {
      baseline_hashes_s: baselineHashesS,
      eco_logical_jobs_s: ecoLogicalJobsS,
      eco_real_hashes_s: ecoRealHashesS,
      avoided_percent: avoidedPercent,
      logical_gain_ratio: eco.comparison?.logical_jobs_s_gain_vs_baseline,
      interpretation: eco.comparison?.interpretation
    } : "UNAVAILABLE"
  },
  projection_10y: projected,
  health: healthScore(),
  verdict: eco ? {
    local_status: "ECO_MINING_REPORT_AVAILABLE",
    logic: ecoLogicalJobsS > baselineHashesS ? "TRILLIONX_LOGICAL_OUTPUT_ABOVE_BASELINE" : "NO_LOGICAL_OUTPUT_GAIN_ON_LAST_REPORT",
    avoidance: avoidedPercent > 0 ? "JOB_AVOIDANCE_ACTIVE" : "JOB_AVOIDANCE_NOT_OBSERVED",
    reading: "TRILLIONX gain is logical orchestration, not brute-force hardware gain"
  } : {
    local_status: "RUN_ECO_MINING_BENCH_FIRST",
    command: "node TRILLIONX_ECO_MINING_MICRO_PACKET_BENCH.js"
  }
};

fs.writeFileSync(OUT_FILE, JSON.stringify(report,null,2));

console.log("===== TRILLIONX ECO-MINING HEALTH 10Y =====");
console.log("Health score       :", report.health.score);
console.log("Health reasons     :", report.health.reasons.join(", ") || "none");
console.log("Eco report found   :", report.inputs_found.eco_mining);
if(eco){
  console.log("Baseline hashes/s  :", baselineHashesS);
  console.log("Eco logical jobs/s :", ecoLogicalJobsS);
  console.log("Eco real hashes/s  :", ecoRealHashesS);
  console.log("Avoided percent    :", avoidedPercent);
  console.log("10Y avoided jobs   :", projected.avoided_jobs_10y_estimated);
  console.log("Logic verdict      :", report.verdict.logic);
}
console.log("Port 3000          :", realState.port_3000 ? "ACTIVE_OR_LISTED" : "UNAVAILABLE");
console.log("Disk               :", realState.disk_workspaces);
console.log("RAM free GB        :", realState.ram_free_GB);
console.log("Report             :", OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
