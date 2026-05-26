"use strict";

/*
TRILLIONX BIG BIG μ✓ BENCH EOF
- Micro-paquets pour ne pas saturer Codespaces
- Difficulté progressive
- Déblocage DiCT x200 par palier réussi
- Mesures réelles seulement
- Pas de fausse puissance, pas de ZH/s inventé
- Sortie JSON + résumé honnête
*/

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const { performance } = require("perf_hooks");

const OUT_DIR = "runtime_state/bigbig_mu_bench";
fs.mkdirSync(OUT_DIR, { recursive: true });

const NOW = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_JSON = `${OUT_DIR}/trillionx_bigbig_mu_bench_${NOW}.json`;
const OUT_LAST = `${OUT_DIR}/trillionx_bigbig_mu_bench_last.json`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const gb = x => +(x / 1024 / 1024 / 1024).toFixed(3);
const mb = x => +(x / 1024 / 1024).toFixed(3);
const pct = x => Number.isFinite(x) ? +x.toFixed(3) : null;
const n3 = x => Number.isFinite(x) ? +x.toFixed(3) : null;

function hrms(t0) { return performance.now() - t0; }

function sys() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
    cpus: os.cpus().map(c => c.model),
    cpu_threads: os.cpus().length,
    loadavg: os.loadavg(),
    total_ram_gb: gb(os.totalmem()),
    free_ram_gb: gb(os.freemem()),
    uptime_s: Math.round(os.uptime())
  };
}

function scoreNorm(value, target, cap = 100) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(cap, (value / target) * cap);
}

async function microLatency(rounds, chunk) {
  const lat = [];
  for (let r = 0; r < rounds; r++) {
    const t = performance.now();
    for (let i = 0; i < chunk; i++) {}
    lat.push(hrms(t));
    await sleep(0);
  }
  lat.sort((a,b)=>a-b);
  const avg = lat.reduce((a,b)=>a+b,0) / lat.length;
  return {
    name: "μ_latency_event_loop",
    rounds, chunk,
    avg_ms: n3(avg),
    p50_ms: n3(lat[Math.floor(lat.length*0.50)]),
    p95_ms: n3(lat[Math.floor(lat.length*0.95)]),
    p99_ms: n3(lat[Math.floor(lat.length*0.99)]),
    unit: "ms lower is better"
  };
}

async function cpuInteger(rounds, ops) {
  let x = 0x12345678;
  const t = performance.now();
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < ops; i++) {
      x = ((x ^ (x << 13)) ^ (x >>> 17) ^ (x << 5)) >>> 0;
    }
    await sleep(0);
  }
  const ms = hrms(t);
  const total = rounds * ops;
  return {
    name: "cpu_integer_xorshift",
    total_ops: total,
    ms: n3(ms),
    ops_per_s: Math.round(total / (ms/1000)),
    checksum: x >>> 0,
    unit: "integer ops/s"
  };
}

async function cryptoHash(rounds, blocks, blockSize) {
  const buf = crypto.randomBytes(blockSize);
  let digest = "";
  const t = performance.now();
  for (let r = 0; r < rounds; r++) {
    for (let b = 0; b < blocks; b++) {
      digest = crypto.createHash("sha256").update(buf).digest("hex");
    }
    await sleep(0);
  }
  const ms = hrms(t);
  const bytes = rounds * blocks * blockSize;
  return {
    name: "crypto_sha256_stream",
    bytes_mb: mb(bytes),
    ms: n3(ms),
    throughput_mb_s: n3(mb(bytes) / (ms/1000)),
    hashes_per_s: Math.round((rounds*blocks)/(ms/1000)),
    digest_tail: digest.slice(-16),
    honesty: "SHA256 logiciel Node.js, pas hashrate ASIC/mining",
    unit: "MB/s and hashes/s"
  };
}

async function memoryBandwidth(rounds, sizeMB) {
  const size = sizeMB * 1024 * 1024;
  const a = Buffer.allocUnsafe(size);
  const b = Buffer.allocUnsafe(size);
  a.fill(7);
  const t = performance.now();
  let c = 0;
  for (let r = 0; r < rounds; r++) {
    a.copy(b);
    c ^= b[r % b.length];
    await sleep(0);
  }
  const ms = hrms(t);
  const bytes = rounds * size;
  return {
    name: "memory_copy_bandwidth",
    size_mb: sizeMB,
    rounds,
    ms: n3(ms),
    bandwidth_gb_s: n3(gb(bytes) / (ms/1000)),
    checksum: c,
    unit: "GB/s"
  };
}

async function compressionBench(rounds, sizeMB) {
  const src = Buffer.alloc(sizeMB * 1024 * 1024);
  for (let i = 0; i < src.length; i++) src[i] = i % 251;
  let compressed = null;
  const t1 = performance.now();
  for (let r = 0; r < rounds; r++) {
    compressed = zlib.deflateSync(src, { level: 1 });
    await sleep(0);
  }
  const cMs = hrms(t1);
  const t2 = performance.now();
  let out = null;
  for (let r = 0; r < rounds; r++) {
    out = zlib.inflateSync(compressed);
    await sleep(0);
  }
  const dMs = hrms(t2);
  return {
    name: "compression_decompression_zlib",
    source_mb: sizeMB,
    rounds,
    compressed_mb: mb(compressed.length),
    ratio: n3(src.length / compressed.length),
    compress_mb_s: n3((sizeMB*rounds)/(cMs/1000)),
    decompress_mb_s: n3((sizeMB*rounds)/(dMs/1000)),
    checksum: out[123] + out[out.length-1],
    unit: "MB/s and ratio"
  };
}

async function ioBench(rounds, sizeMB) {
  const file = `${OUT_DIR}/io_tmp_${process.pid}.bin`;
  const buf = crypto.randomBytes(sizeMB * 1024 * 1024);
  const tW = performance.now();
  for (let r=0; r<rounds; r++) {
    fs.writeFileSync(file, buf);
    await sleep(0);
  }
  const wMs = hrms(tW);
  const tR = performance.now();
  let last = 0;
  for (let r=0; r<rounds; r++) {
    const b = fs.readFileSync(file);
    last ^= b[0];
    await sleep(0);
  }
  const rMs = hrms(tR);
  try { fs.unlinkSync(file); } catch {}
  return {
    name: "filesystem_io_write_read",
    size_mb: sizeMB,
    rounds,
    write_mb_s: n3((sizeMB*rounds)/(wMs/1000)),
    read_mb_s: n3((sizeMB*rounds)/(rMs/1000)),
    checksum: last,
    unit: "MB/s"
  };
}

async function dictBench(level, baseEntries) {
  const entries = baseEntries * Math.pow(200, level-1);
  const safeEntries = Math.min(entries, 200000);
  const map = new Map();
  const t = performance.now();
  for (let i=0; i<safeEntries; i++) {
    map.set("DICT_"+level+"_"+i, (i*2654435761)>>>0);
    if (i % 5000 === 0) await sleep(0);
  }
  let hit = 0;
  for (let i=0; i<safeEntries; i+=7) {
    if (map.has("DICT_"+level+"_"+i)) hit++;
  }
  const ms = hrms(t);
  return {
    name: "dict_unlock_x200_progressive",
    level,
    requested_entries_theoretical: entries,
    measured_entries_capped: safeEntries,
    cap_reason: entries > safeEntries ? "Codespaces safety cap, x200 kept as symbolic difficulty target" : "fully measured",
    ms: n3(ms),
    inserts_per_s: Math.round(safeEntries/(ms/1000)),
    lookup_hits: hit,
    unit: "entries/s"
  };
}

async function schedulerBench(level, jobs) {
  let done = 0;
  const t = performance.now();
  await new Promise(resolve => {
    for (let i=0; i<jobs; i++) {
      setImmediate(() => {
        let x = i;
        for (let k=0;k<20*level;k++) x = (x * 1664525 + 1013904223) >>> 0;
        done++;
        if (done === jobs) resolve();
      });
    }
  });
  const ms = hrms(t);
  return {
    name: "scheduler_micro_jobs",
    level,
    jobs,
    ms: n3(ms),
    jobs_per_s: Math.round(jobs/(ms/1000)),
    unit: "jobs/s"
  };
}

async function missionBench(level, mode) {
  const miners = 1;
  const packets = 50 * level;
  let useful = 0;
  const t = performance.now();
  for (let p=0; p<packets; p++) {
    const risk = crypto.createHash("sha256").update("miner:"+level+":"+p).digest()[0];
    if (mode === "SAVE_MINER") useful += risk < 220 ? 1 : 0;
    else useful += risk > 35 ? 1 : 0;
    await sleep(0);
  }
  const ms = hrms(t);
  return {
    name: "mission_useful_work",
    mode,
    level,
    miners_targeted: miners,
    packets,
    useful_decisions: useful,
    useful_rate_percent: pct(100*useful/packets),
    ms: n3(ms),
    honesty: "mission logic benchmark, not real rescue/payment/mining",
    unit: "decisions and %"
  };
}

async function run() {
  const mission = process.argv.includes("--rich") ? "EOF_ENRICH_MAX" : "SAVE_MINER";
  const levels = Number(process.env.TX_LEVELS || 4);
  const results = [];
  const startSys = sys();
  const tAll = performance.now();

  console.log("TRILLIONX BIGBIG μ✓ BENCH EOF START");
  console.log("Mission:", mission);
  console.log("Levels:", levels);
  console.log("Honesty: REAL measurements only; impossible hardware claims = UNAVAILABLE.");

  for (let level=1; level<=levels; level++) {
    console.log("\\n--- μ✓ LEVEL", level, "---");
    const difficulty = {
      level,
      dict_multiplier: Math.pow(200, level-1),
      cpu_ops: 400000 * level,
      sha_blocks: 800 * level,
      memory_mb: Math.min(16*level, 96),
      io_mb: Math.min(4*level, 32),
      scheduler_jobs: 1000 * level
    };

    const pack = { level, difficulty, before: sys(), tests: [] };

    const tests = [
      () => microLatency(20*level, 5000*level),
      () => cpuInteger(5*level, difficulty.cpu_ops),
      () => cryptoHash(2*level, difficulty.sha_blocks, 4096),
      () => memoryBandwidth(2*level, difficulty.memory_mb),
      () => compressionBench(1, Math.min(4*level, 16)),
      () => ioBench(1, difficulty.io_mb),
      () => dictBench(level, 1000),
      () => schedulerBench(level, difficulty.scheduler_jobs),
      () => missionBench(level, mission)
    ];

    for (const fn of tests) {
      try {
        const r = await fn();
        pack.tests.push(r);
        console.log("OK", r.name);
      } catch (e) {
        pack.tests.push({ error: String(e && e.message || e), name: "FAILED_TEST" });
        console.log("FAIL", e.message);
      }
    }

    pack.after = sys();
    results.push(pack);

    const last = {
      generated_at: new Date().toISOString(),
      system: startSys,
      mission,
      partial_results: results
    };
    fs.writeFileSync(OUT_LAST, JSON.stringify(last, null, 2));
    await sleep(25);
  }

  const flat = results.flatMap(p => p.tests);
  const cpu = flat.find(x=>x.name==="cpu_integer_xorshift");
  const sha = flat.find(x=>x.name==="crypto_sha256_stream");
  const mem = flat.find(x=>x.name==="memory_copy_bandwidth");
  const sched = flat.find(x=>x.name==="scheduler_micro_jobs");
  const io = flat.find(x=>x.name==="filesystem_io_write_read");
  const comp = flat.find(x=>x.name==="compression_decompression_zlib");

  const score = {
    cpu_score: n3(scoreNorm(cpu?.ops_per_s, 100000000)),
    sha_score: n3(scoreNorm(sha?.throughput_mb_s, 500)),
    memory_score: n3(scoreNorm(mem?.bandwidth_gb_s, 10)),
    scheduler_score: n3(scoreNorm(sched?.jobs_per_s, 100000)),
    io_score: n3(scoreNorm(io?.write_mb_s, 300)),
    compression_score: n3(scoreNorm(comp?.compress_mb_s, 300)),
  };
  score.global_score_100 = n3(Object.values(score).reduce((a,b)=>a+(b||0),0) / Object.values(score).length);

  const verdict =
    score.global_score_100 >= 80 ? "TRILLIONX_ORCHESTRATOR_STRONG_ON_THIS_CODESPACE" :
    score.global_score_100 >= 50 ? "TRILLIONX_ORCHESTRATOR_GOOD_BUT_LIMITED_BY_CODESPACE" :
    score.global_score_100 >= 25 ? "TRILLIONX_ORCHESTRATOR_FUNCTIONAL_LIGHT_NODE" :
    "TRILLIONX_ORCHESTRATOR_WEAK_OR_THROTTLED_ENVIRONMENT";

  const final = {
    benchmark: "TRILLIONX_BIGBIG_MU_BENCH_EOF",
    generated_at: new Date().toISOString(),
    duration_ms: n3(hrms(tAll)),
    honesty_lock: {
      real_measurement: true,
      fake_power: false,
      fake_asic: false,
      fake_supercomputer_equivalence: false,
      codespaces_cpu_is_host_runtime_only: true,
      trillionx_is_evaluated_as_software_orchestrator: true
    },
    mission,
    system_start: startSys,
    system_end: sys(),
    score,
    verdict,
    interpretation: {
      hpc_cluster_node: "UNAVAILABLE unless real cluster/network/GPU backend exists",
      asic_hashrate: "UNAVAILABLE; SHA256 here is Node.js software only",
      consciousness: "DISPLAY/METAPHOR only, not a machine consciousness claim",
      dict_x200: "difficulty target; measured entries capped for Codespaces safety",
      best_use: "orchestration, scheduling, telemetry, cache/batch, benchmark ledger, provider routing"
    },
    results
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(final, null, 2));
  fs.writeFileSync(OUT_LAST, JSON.stringify(final, null, 2));

  console.log("\\n================ EOF RESULT ================");
  console.log("VERDICT:", verdict);
  console.log("GLOBAL_SCORE_100:", score.global_score_100);
  console.log("MISSION:", mission);
  console.log("JSON:", OUT_JSON);
  console.log("LAST:", OUT_LAST);
  console.log("HONESTY: aucune équivalence Frontier/ASIC/datacenter n'est affirmée sans mesure réelle.");
  console.log("============================================");
}

run().catch(e => {
  console.error("BENCH_FATAL", e);
  process.exit(1);
});
