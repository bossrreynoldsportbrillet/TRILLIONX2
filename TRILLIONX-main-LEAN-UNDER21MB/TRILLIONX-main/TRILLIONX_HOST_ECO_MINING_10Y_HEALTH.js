"use strict";

const fs = require("fs");
const os = require("os");
const cp = require("child_process");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/trillionx_host_eco_mining_10y_health.json`;

function readJson(p){
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return null; }
}

function sh(cmd){
  try {
    return cp.execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000
    }).trim();
  } catch {
    return "UNAVAILABLE";
  }
}

function gb(x){ return +(x / 1024 / 1024 / 1024).toFixed(3); }
function n(x, fallback=0){ return Number.isFinite(Number(x)) ? Number(x) : fallback; }

fs.mkdirSync(OUT_DIR, { recursive: true });

const eco = readJson("runtime_state/bench/eco_mining_micro_packet_last.json");
const standard = readJson("runtime_state/bench/micro_packet_last.json");
const defense = readJson("runtime_state/bench/planetary_defense_micro_packet_last.json");
const heavy = readJson("runtime_state/bench/heavy_micro_packet_last.json");
const blockchain = readJson("runtime_state/bench/blockchain_micro_packet_last.json");

const host = {
  role: "TRILLIONX_HOST_SUPPORT_ONLY",
  note: "The host is the current execution support. The measured subject is TRILLIONX logic.",
  hostname: os.hostname(),
  platform: os.platform(),
  arch: os.arch(),
  node: process.version,
  support_host_cpu: os.cpus()[0]?.model || "UNAVAILABLE",
  logical_cpus: os.cpus().length,
  ram_total_GB: gb(os.totalmem()),
  ram_free_GB: gb(os.freemem()),
  ram_used_GB: gb(os.totalmem() - os.freemem()),
  disk_workspaces: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
  repo_size: sh("du -sh . 2>/dev/null | awk '{print $1}'"),
  port_3000: sh("ss -lntp | grep ':3000' || true")
};

const baselineHashesS = eco ? n(eco.real_baseline?.hashes_s) : 0;
const trillionxLogicalJobsS = eco ? n(eco.trillionx_eco_mining?.logical_jobs_s) : 0;
const trillionxRealHashesS = eco ? n(eco.trillionx_eco_mining?.real_hashes_s) : 0;
const avoidedPercent = eco ? n(eco.trillionx_eco_mining?.avoided_percent) : 0;
const avoidedJobsLast = eco ? n(eco.trillionx_eco_mining?.avoided_hash_jobs) : 0;

const seconds10y = 10 * 365.25 * 24 * 3600;

const projection10y = eco ? {
  period: "10_years_continuous_estimate",
  basis: "last local TRILLIONX μ-packet eco-mining report",
  host_direct_execution_jobs_10y_est: Math.round(baselineHashesS * seconds10y),
  trillionx_logic_jobs_10y_est: Math.round(trillionxLogicalJobsS * seconds10y),
  trillionx_real_hashes_10y_est: Math.round(trillionxRealHashesS * seconds10y),
  trillionx_avoided_jobs_10y_est: Math.max(0, Math.round((trillionxLogicalJobsS - trillionxRealHashesS) * seconds10y)),
  observed_avoided_percent: avoidedPercent,
  logical_jobs_ratio_vs_host_direct: +(trillionxLogicalJobsS / Math.max(baselineHashesS, 1)).toFixed(4),
  real_hashes_ratio_vs_host_direct: +(trillionxRealHashesS / Math.max(baselineHashesS, 1)).toFixed(4),
  reading: "Estimated logical orchestration over 10 years; not profit, not network mining, not physical hardware claim."
} : {
  status: "UNAVAILABLE",
  reason: "runtime_state/bench/eco_mining_micro_packet_last.json not found",
  command_to_generate_basis: "node TRILLIONX_ECO_MINING_MICRO_PACKET_BENCH.js"
};

function health(){
  let score = 100;
  const notes = [];

  if (!eco) { score -= 30; notes.push("eco_mining_report_missing"); }
  if (!host.port_3000 || host.port_3000 === "UNAVAILABLE") { score -= 20; notes.push("port_3000_unavailable"); }

  const diskPct = String(host.disk_workspaces).match(/(\d+)%/);
  const pct = diskPct ? Number(diskPct[1]) : null;
  if (pct !== null && pct >= 90) { score -= 25; notes.push("disk_high_90_plus"); }
  else if (pct !== null && pct >= 80) { score -= 10; notes.push("disk_high_80_plus"); }

  if (host.ram_free_GB < 0.5) { score -= 20; notes.push("ram_free_under_0_5GB"); }
  else if (host.ram_free_GB < 1.0) { score -= 10; notes.push("ram_free_under_1GB"); }

  if (eco && trillionxLogicalJobsS > baselineHashesS) notes.push("logical_output_above_host_direct");
  if (eco && avoidedPercent > 0) notes.push("job_avoidance_observed");

  return {
    score: Math.max(0, score),
    notes,
    status:
      score >= 85 ? "GOOD" :
      score >= 65 ? "WATCH" :
      "RISK"
  };
}

const report = {
  module: "TRILLIONX_HOST_ECO_MINING_10Y_HEALTH",
  doctrine: "REAL_ONLY_OR_UNAVAILABLE",
  subject_measured: "TRILLIONX_LOGIC_LAYER",
  not_measured_as_subject: "support_host_cpu",
  vocabulary_policy: {
    avoid_word: "puissance",
    preferred_terms: [
      "logique",
      "sortie logique utile",
      "jobs évités",
      "orchestration",
      "rendement utile",
      "stabilité RAM/disque",
      "micro-paquets μ"
    ]
  },
  safety: {
    real_mining_network: false,
    wallet: false,
    pool: false,
    transaction: false,
    profit_claim: false,
    physical_hardware_claim: false,
    local_logic_benchmark_only: true
  },
  host_support: host,
  inputs_found: {
    eco_mining: !!eco,
    standard_micro_packet: !!standard,
    planetary_defense_micro_packet: !!defense,
    heavy_micro_packet: !!heavy,
    blockchain_micro_packet: !!blockchain
  },
  latest_logic_metrics: {
    eco_mining: eco ? {
      host_direct_execution_hashes_s: baselineHashesS,
      trillionx_logic_jobs_s: trillionxLogicalJobsS,
      trillionx_real_hashes_s: trillionxRealHashesS,
      avoided_jobs_last_run: avoidedJobsLast,
      avoided_percent: avoidedPercent,
      interpretation: "If logic_jobs_s > host_direct_hashes_s and avoided_percent > 0, TRILLIONX produces more useful logical output per executed work unit."
    } : "UNAVAILABLE",
    standard_micro_packet: standard ? {
      packets_s: standard.packets_s || standard.metrics?.micro_packets_per_s,
      throughput_MB_s: standard.throughput_MB_s || standard.metrics?.packet_MB_per_s,
      rss_GB: standard.rss_end_GB || standard.memory_process?.rss_GB_end
    } : "UNAVAILABLE",
    planetary_defense: defense ? {
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
    heavy_micro_packet: heavy ? {
      packets_s: heavy.metrics?.packets_s,
      raw_MB_s: heavy.metrics?.raw_MB_s,
      rss_GB: heavy.memory_process?.rss_GB_end
    } : "UNAVAILABLE"
  },
  projection_10y: projection10y,
  health: health(),
  verdict: eco ? {
    logic_output:
      trillionxLogicalJobsS > baselineHashesS
      ? "TRILLIONX_LOGIC_OUTPUT_ABOVE_HOST_DIRECT"
      : "TRILLIONX_LOGIC_OUTPUT_NOT_ABOVE_HOST_DIRECT_ON_LAST_REPORT",
    job_avoidance:
      avoidedPercent > 0
      ? "JOB_AVOIDANCE_ACTIVE"
      : "JOB_AVOIDANCE_NOT_OBSERVED",
    final_reading:
      "TRILLIONX is evaluated as a logic/orchestration layer running on the host support, not as the host CPU itself."
  } : {
    status: "NEED_ECO_MINING_BENCH_FIRST",
    command: "PACKET_KB=8 ROUNDS=80000 CACHE_MAX=512 CHECKPOINT_EVERY=10000 MAX_WRITE_MB=4 DIFFICULTY_PREFIX=000 node TRILLIONX_ECO_MINING_MICRO_PACKET_BENCH.js"
  }
};

fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

console.log("===== TRILLIONX HOST ECO-MINING 10Y HEALTH =====");
console.log("Subject measured        : TRILLIONX_LOGIC_LAYER");
console.log("Host role               : support only");
console.log("Health                  :", report.health.status, report.health.score);
console.log("Inputs eco-mining        :", report.inputs_found.eco_mining);
if (eco) {
  console.log("Host direct hashes/s     :", baselineHashesS);
  console.log("TRILLIONX logic jobs/s   :", trillionxLogicalJobsS);
  console.log("TRILLIONX real hashes/s  :", trillionxRealHashesS);
  console.log("Avoided percent          :", avoidedPercent);
  console.log("10Y avoided jobs est     :", projection10y.trillionx_avoided_jobs_10y_est);
  console.log("Logic verdict            :", report.verdict.logic_output);
}
console.log("Port 3000               :", host.port_3000 ? "ACTIVE_OR_LISTED" : "UNAVAILABLE");
console.log("Disk                    :", host.disk_workspaces);
console.log("RAM free GB             :", host.ram_free_GB);
console.log("Report                  :", OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
