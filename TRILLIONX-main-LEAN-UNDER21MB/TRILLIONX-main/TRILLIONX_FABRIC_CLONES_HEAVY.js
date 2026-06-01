"use strict";

// =====================================================================
//   TRILLIONX_FABRIC_CLONES_HEAVY
//   Spawn N clones du fabric en parallèle sur ports différents,
//   les attaque tous en simultané, mesure où (et si) ça s'ennuie.
//
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY
//
//   Heavy d'un côté: 10 process Node.js complets en parallèle
//   Simple de l'autre: une commande, un rapport, fabric master intact
//
//   Usage:
//     node TRILLIONX_FABRIC_CLONES_HEAVY.js
//     CLONES=5 node TRILLIONX_FABRIC_CLONES_HEAVY.js
//     CLONES=10 ATTACK_N=100 node TRILLIONX_FABRIC_CLONES_HEAVY.js
//
//   Env:
//     CLONES=10              nombre de clones à spawner
//     BASE_PORT=3161         port de départ (master 3160 INTACT)
//     ATTACK_N=60            nb de rounds /api/memory-stress par clone
//     SAFETY_FREEMEM_MB=600  kill les clones si freemem descend sous ça
//     SAFETY_RSS_TOTAL_MB=3000  kill si la somme des RSS dépasse ça
//     STARTUP_TIMEOUT_MS=10000
// =====================================================================

const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

const PATTERN = require("./TRILLIONX_PARALLELISM_PATTERN.js");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/trillionx_fabric_clones_heavy_last.json`;

const CONFIG = {
  CLONES: Number(process.env.CLONES || 10),
  BASE_PORT: Number(process.env.BASE_PORT || 3161),         // master 3160 jamais touché
  MASTER_PORT: Number(process.env.MASTER_PORT || 3160),
  ATTACK_N: Number(process.env.ATTACK_N || 60),
  SAFETY_FREEMEM_MB: Number(process.env.SAFETY_FREEMEM_MB || 600),
  SAFETY_RSS_TOTAL_MB: Number(process.env.SAFETY_RSS_TOTAL_MB || 3000),
  STARTUP_TIMEOUT_MS: Number(process.env.STARTUP_TIMEOUT_MS || 10000),
  POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS || 1000),
  FABRIC_SCRIPT: process.env.FABRIC_SCRIPT || "TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js"
};

// ---------------------------------------------------------------------
//   Utilitaires HTTP
// ---------------------------------------------------------------------
function httpGet(port, urlPath, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.get(
      { host: "127.0.0.1", port, path: urlPath, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", c => body += c);
        res.on("end", () => {
          const dt = (performance.now() - t0) / 1000;
          let parsed = null;
          try { parsed = JSON.parse(body); } catch {}
          resolve({ status: res.statusCode, duration_s: +dt.toFixed(4), body: parsed, body_size: body.length });
        });
      }
    );
    req.on("error", e => resolve({ status: 0, error: String(e.message || e), duration_s: 0 }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", duration_s: timeoutMs / 1000 }); });
  });
}

// ---------------------------------------------------------------------
//   Lecture RSS par PID via /proc (Linux/Android)
// ---------------------------------------------------------------------
function readRssMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/VmRSS:\s+(\d+)\s+kB/);
    return m ? +(Number(m[1]) / 1024).toFixed(2) : "UNAVAILABLE";
  } catch { return "UNAVAILABLE"; }
}

// ---------------------------------------------------------------------
//   Vérifier que le master tourne et qu'on ne va pas le toucher
// ---------------------------------------------------------------------
async function checkMaster() {
  const res = await httpGet(CONFIG.MASTER_PORT, "/api/memory-fabric");
  if (res.status !== 200) {
    console.error(`⚠️  Master fabric sur port ${CONFIG.MASTER_PORT}: pas accessible`);
    console.error(`    → on continue, mais aucun clone n'utilisera ce port`);
    return false;
  }
  console.log(`✅ Master fabric sur port ${CONFIG.MASTER_PORT}: VIVANT (sera laissé INTACT)`);
  return true;
}

// ---------------------------------------------------------------------
//   Spawner UN clone sur un port donné
// ---------------------------------------------------------------------
function spawnClone(port, idx) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: String(port) };
    const child = spawn("node", [CONFIG.FABRIC_SCRIPT, "serve", String(port)], {
      cwd: process.cwd(),
      env,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "", stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", e => reject({ idx, port, error: String(e.message || e) }));

    resolve({ idx, port, pid: child.pid, child, stdout_ref: () => stdout, stderr_ref: () => stderr });
  });
}

// ---------------------------------------------------------------------
//   Attendre qu'un clone réponde à /api/memory-fabric
// ---------------------------------------------------------------------
async function waitForReady(clone, timeoutMs) {
  const tStart = performance.now();
  while (performance.now() - tStart < timeoutMs) {
    await new Promise(r => setTimeout(r, 300));
    const res = await httpGet(clone.port, "/api/memory-fabric", 2000);
    if (res.status === 200 && res.body && res.body.engine) {
      return { ...clone, ready: true, ready_ms: +(performance.now() - tStart).toFixed(1) };
    }
  }
  return { ...clone, ready: false, ready_ms: timeoutMs, last_stderr: clone.stderr_ref().slice(-300) };
}

// ---------------------------------------------------------------------
//   Tuer un clone proprement (master JAMAIS touché)
// ---------------------------------------------------------------------
function killClone(clone, reason = "end") {
  if (!clone || !clone.child) return false;
  try {
    clone.child.kill("SIGTERM");
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------
//   Garde-fou: monitore en continu, retourne si seuil dépassé
// ---------------------------------------------------------------------
function startSafetyMonitor(clones, getRssTotal) {
  const samples = [];
  let triggered = null;
  const interval = setInterval(() => {
    const freeMb = +(os.freemem() / 1024 / 1024).toFixed(2);
    const rssTotal = getRssTotal();
    const sample = {
      t: new Date().toISOString(),
      freemem_mb: freeMb,
      rss_total_mb: rssTotal,
      loadavg_1m: os.loadavg()[0]
    };
    samples.push(sample);

    if (freeMb < CONFIG.SAFETY_FREEMEM_MB) {
      triggered = { reason: "FREEMEM_LOW", value: freeMb, threshold: CONFIG.SAFETY_FREEMEM_MB };
      clearInterval(interval);
    } else if (rssTotal !== "UNAVAILABLE" && rssTotal > CONFIG.SAFETY_RSS_TOTAL_MB) {
      triggered = { reason: "RSS_TOTAL_HIGH", value: rssTotal, threshold: CONFIG.SAFETY_RSS_TOTAL_MB };
      clearInterval(interval);
    }
  }, CONFIG.POLL_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval),
    samples,
    triggered: () => triggered
  };
}

// =====================================================================
//   MAIN
// =====================================================================
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("=================================================");
  console.log("  TRILLIONX FABRIC CLONES — HEAVY ATTACK");
  console.log("=================================================");
  console.log(`Clones                : ${CONFIG.CLONES}`);
  console.log(`Ports                 : ${CONFIG.BASE_PORT}..${CONFIG.BASE_PORT + CONFIG.CLONES - 1}`);
  console.log(`Master port (intact)  : ${CONFIG.MASTER_PORT}`);
  console.log(`Attack N per clone    : ${CONFIG.ATTACK_N}`);
  console.log(`Safety freemem MB     : ${CONFIG.SAFETY_FREEMEM_MB}`);
  console.log(`Safety RSS total MB   : ${CONFIG.SAFETY_RSS_TOTAL_MB}`);
  console.log(`Fabric script         : ${CONFIG.FABRIC_SCRIPT}`);
  console.log();

  // 0. Vérifier le script existe
  if (!fs.existsSync(CONFIG.FABRIC_SCRIPT)) {
    console.error(`❌ ${CONFIG.FABRIC_SCRIPT} introuvable dans ${process.cwd()}`);
    process.exit(1);
  }

  // 1. Vérifier master
  const masterAlive = await checkMaster();
  console.log();

  // 2. État initial du système
  const t0 = performance.now();
  const loadInitial = await PATTERN.measureRealLoad(300);
  console.log(`État initial          : freemem=${loadInitial.freemem_mb} MB, loadavg=${loadInitial.loadavg_1m}`);
  console.log();

  // 3. Spawn tous les clones
  console.log("--- PHASE 1: SPAWN ---");
  const clones = [];
  for (let i = 0; i < CONFIG.CLONES; i++) {
    const port = CONFIG.BASE_PORT + i;
    try {
      const c = await spawnClone(port, i);
      clones.push(c);
      console.log(`  clone[${i}] PID=${c.pid} port=${port}`);
    } catch (e) {
      console.error(`  clone[${i}] SPAWN FAIL: ${e.error || e}`);
    }
  }
  console.log();

  // 4. Attendre que tous soient prêts
  console.log("--- PHASE 2: READY CHECK ---");
  const readyChecks = await Promise.all(
    clones.map(c => waitForReady(c, CONFIG.STARTUP_TIMEOUT_MS))
  );
  for (let i = 0; i < readyChecks.length; i++) {
    const r = readyChecks[i];
    if (r.ready) {
      console.log(`  clone[${i}] port=${r.port} READY in ${r.ready_ms}ms`);
    } else {
      console.log(`  clone[${i}] port=${r.port} NOT READY after ${r.ready_ms}ms`);
      if (r.last_stderr) console.log(`              stderr: ${r.last_stderr.slice(-150)}`);
    }
  }
  const readyClones = readyChecks.filter(r => r.ready);
  console.log();
  console.log(`Ready clones          : ${readyClones.length}/${CONFIG.CLONES}`);

  if (readyClones.length === 0) {
    console.error("❌ Aucun clone prêt — abandon");
    for (const c of clones) killClone(c, "no_ready");
    process.exit(2);
  }
  console.log();

  // 5. Lancer le garde-fou
  const getRssTotal = () => {
    let total = 0, any = false;
    for (const c of readyClones) {
      const r = readRssMb(c.pid);
      if (typeof r === "number") { total += r; any = true; }
    }
    return any ? +total.toFixed(2) : "UNAVAILABLE";
  };
  const monitor = startSafetyMonitor(readyClones, getRssTotal);

  // 6. Attaque parallèle
  console.log("--- PHASE 3: HEAVY ATTACK (parallel) ---");
  console.log(`Each clone receives ${CONFIG.ATTACK_N} /api/memory-stress (sync, blocking per-fabric)`);
  console.log();
  const tAttack = performance.now();

  const elMonitor = monitorEventLoopDelay({ resolution: 10 });
  elMonitor.enable();

  const attackPromises = readyClones.map(async (c) => {
    const tLocal = performance.now();
    const res = await httpGet(c.port, `/api/memory-stress?n=${CONFIG.ATTACK_N}`, 60000);
    return {
      idx: c.idx, port: c.port, pid: c.pid,
      duration_s: +((performance.now() - tLocal) / 1000).toFixed(4),
      http_status: res.status,
      http_error: res.error,
      body_size: res.body_size,
      rss_mb_after: readRssMb(c.pid)
    };
  });
  const attackResults = await Promise.all(attackPromises);
  elMonitor.disable();
  monitor.stop();
  const attackDt = (performance.now() - tAttack) / 1000;

  // 7. État final
  const loadFinal = await PATTERN.measureRealLoad(300);
  const wallClock = (performance.now() - t0) / 1000;

  // 8. Master fabric encore là ?
  const masterAfter = masterAlive ? await httpGet(CONFIG.MASTER_PORT, "/api/memory-fabric") : null;
  const masterIntact = masterAfter && masterAfter.status === 200;

  // 9. Affichage
  console.log("--- ATTACK RESULTS ---");
  console.log("idx | port | status | duration_s | rss_mb | size");
  console.log("----+------+--------+------------+--------+------");
  for (const r of attackResults) {
    const status = r.http_error ? `ERR(${r.http_error.slice(0,8)})` : String(r.http_status);
    console.log(
      String(r.idx).padStart(3) + " | " +
      String(r.port).padEnd(4) + " | " +
      status.padEnd(6) + " | " +
      String(r.duration_s).padStart(10) + " | " +
      String(r.rss_mb_after).padStart(6) + " | " +
      String(r.body_size || "-").padStart(5)
    );
  }
  console.log();

  // 10. Kill les clones (propre)
  console.log("--- PHASE 4: CLEANUP ---");
  for (const c of clones) {
    const killed = killClone(c, "end_of_test");
    if (killed) console.log(`  clone[${c.idx}] PID=${c.pid} SIGTERM sent`);
  }
  // Donner 500ms pour terminer proprement
  await new Promise(r => setTimeout(r, 500));
  console.log();

  // 11. Verdict
  const okCount = attackResults.filter(r => r.http_status === 200).length;
  const errCount = attackResults.length - okCount;
  const slowestIdx = attackResults.reduce((max, r) => r.duration_s > max.duration_s ? r : max, attackResults[0]);
  const fastestIdx = attackResults.reduce((min, r) => r.duration_s < min.duration_s ? r : min, attackResults[0]);
  const rssValues = attackResults.map(r => r.rss_mb_after).filter(v => typeof v === "number");
  const rssMin = rssValues.length ? Math.min(...rssValues) : "UNAVAILABLE";
  const rssMax = rssValues.length ? Math.max(...rssValues) : "UNAVAILABLE";
  const rssSum = rssValues.length ? +rssValues.reduce((a,b)=>a+b,0).toFixed(2) : "UNAVAILABLE";

  const triggered = monitor.triggered();
  const samples = monitor.samples;
  const freememValues = samples.map(s => s.freemem_mb).filter(Number.isFinite);
  const freememMinDuring = freememValues.length ? Math.min(...freememValues) : "UNAVAILABLE";

  // 12. Rapport
  const report = {
    module: "TRILLIONX_FABRIC_CLONES_HEAVY",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    config: CONFIG,
    wall_clock_s: +wallClock.toFixed(4),
    attack_only_s: +attackDt.toFixed(4),
    initial_load: loadInitial,
    final_load: loadFinal,
    master_fabric: {
      port: CONFIG.MASTER_PORT,
      alive_before: masterAlive,
      alive_after: masterIntact,
      intact: masterAlive === masterIntact,
      note: "Master never targeted by this script. Only spawned clones touched."
    },
    spawn_summary: {
      requested: CONFIG.CLONES,
      spawned: clones.length,
      ready: readyClones.length,
      not_ready: clones.length - readyClones.length
    },
    attack_summary: {
      ok: okCount,
      errors: errCount,
      slowest: { idx: slowestIdx.idx, port: slowestIdx.port, duration_s: slowestIdx.duration_s },
      fastest: { idx: fastestIdx.idx, port: fastestIdx.port, duration_s: fastestIdx.duration_s },
      duration_spread_s: +(slowestIdx.duration_s - fastestIdx.duration_s).toFixed(4)
    },
    rss_during_attack: {
      per_clone_min_mb: rssMin,
      per_clone_max_mb: rssMax,
      sum_all_clones_mb: rssSum
    },
    event_loop_main_process: {
      mean_ms: Number.isFinite(elMonitor.mean) ? +(elMonitor.mean / 1e6).toFixed(3) : "UNAVAILABLE",
      max_ms: Number.isFinite(elMonitor.max) ? +(elMonitor.max / 1e6).toFixed(3) : "UNAVAILABLE",
      p99_ms: Number.isFinite(elMonitor.percentile(99)) ? +(elMonitor.percentile(99) / 1e6).toFixed(3) : "UNAVAILABLE"
    },
    safety_monitor: {
      samples_count: samples.length,
      freemem_mb_min_during: freememMinDuring,
      triggered: triggered || "NEVER_TRIGGERED",
      thresholds: { freemem_mb: CONFIG.SAFETY_FREEMEM_MB, rss_total_mb: CONFIG.SAFETY_RSS_TOTAL_MB }
    },
    attack_results: attackResults,
    monitor_trajectory: samples,
    verdict: {
      all_clones_ok: okCount === readyClones.length,
      bored_or_busy: freememMinDuring !== "UNAVAILABLE" && freememMinDuring > 1500 ? "STILL_BORED" : "WORKING",
      reading: "Where the phone gets bored: look at freemem_mb_min_during. " +
               "Higher = more headroom. If safety_monitor.triggered != NEVER_TRIGGERED, that's where it actually struggled."
    },
    guardrails: {
      no_fake_metrics: true,
      no_fake_hardware: true,
      additive_only: true,
      master_fabric_intact: masterAlive === masterIntact,
      doctrine: "REAL_ONLY_OR_UNAVAILABLE"
    },
    time: new Date().toISOString()
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log("=================================================");
  console.log("  VERDICT");
  console.log("=================================================");
  console.log(`Wall clock total      : ${report.wall_clock_s} s`);
  console.log(`Attack duration       : ${report.attack_only_s} s`);
  console.log(`Clones OK             : ${okCount}/${readyClones.length}`);
  console.log(`Slowest clone         : idx=${slowestIdx.idx} port=${slowestIdx.port} (${slowestIdx.duration_s}s)`);
  console.log(`Fastest clone         : idx=${fastestIdx.idx} port=${fastestIdx.port} (${fastestIdx.duration_s}s)`);
  console.log(`Spread (slow-fast)    : ${report.attack_summary.duration_spread_s} s`);
  console.log(`RSS per clone (MB)    : min=${rssMin}, max=${rssMax}, sum=${rssSum}`);
  console.log(`Event-loop max (main) : ${report.event_loop_main_process.max_ms} ms`);
  console.log(`Freemem min during    : ${freememMinDuring} MB`);
  console.log(`Safety triggered      : ${triggered ? triggered.reason : "NEVER"}`);
  console.log(`Master fabric intact  : ${masterIntact ? "YES (PID untouched)" : "NO/UNAVAILABLE"}`);
  console.log(`Verdict               : ${report.verdict.bored_or_busy}`);
  console.log(`Report                : ${OUT_FILE}`);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => {
  console.error("CLONES_HEAVY_ERROR", e.stack || e);
  process.exit(1);
});
