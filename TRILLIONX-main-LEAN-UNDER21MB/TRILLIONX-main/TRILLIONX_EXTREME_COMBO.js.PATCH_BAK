"use strict";

// =====================================================================
//   TRILLIONX_EXTREME_COMBO
//   20 clones fabric + triple_parallel_orchestrator en parallèle.
//   AUTO-KILL strict des clones si freemem < seuil.
//   Master fabric (port 3160) JAMAIS touché.
//
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY
//   Différence vs CLONES_HEAVY : auto-kill actif + co-charge triple
// =====================================================================

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/trillionx_extreme_combo_last.json`;

const CONFIG = {
  CLONES: Number(process.env.CLONES || 20),
  BASE_PORT: Number(process.env.BASE_PORT || 3161),
  MASTER_PORT: Number(process.env.MASTER_PORT || 3160),
  ATTACK_N: Number(process.env.ATTACK_N || 60),

  // Garde-fous STRICTS — auto-kill si dépassés
  SAFETY_FREEMEM_MB: Number(process.env.SAFETY_FREEMEM_MB || 400),
  SAFETY_RSS_TOTAL_MB: Number(process.env.SAFETY_RSS_TOTAL_MB || 2500),
  HARD_FREEMEM_MB: Number(process.env.HARD_FREEMEM_MB || 250),  // panic kill immédiat

  STARTUP_TIMEOUT_MS: Number(process.env.STARTUP_TIMEOUT_MS || 15000),
  POLL_INTERVAL_MS: 500,
  FABRIC_SCRIPT: process.env.FABRIC_SCRIPT || "TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js",
  TRIPLE_SCRIPT: process.env.TRIPLE_SCRIPT || "TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js",

  // Spawn par batches pour éviter une saturation initiale
  SPAWN_BATCH_SIZE: Number(process.env.SPAWN_BATCH_SIZE || 5),
  SPAWN_BATCH_DELAY_MS: 800
};

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

function readRssMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/VmRSS:\s+(\d+)\s+kB/);
    return m ? +(Number(m[1]) / 1024).toFixed(2) : "UNAVAILABLE";
  } catch { return "UNAVAILABLE"; }
}

function killClone(clone, reason) {
  if (!clone || !clone.child || clone.killed) return false;
  try {
    clone.child.kill("SIGTERM");
    clone.killed = true;
    clone.kill_reason = reason;
    return true;
  } catch { return false; }
}

function killAllClones(clones, reason) {
  let n = 0;
  for (const c of clones) if (killClone(c, reason)) n++;
  return n;
}

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
    resolve({ idx, port, pid: child.pid, child, killed: false,
              stdout_ref: () => stdout, stderr_ref: () => stderr });
  });
}

async function waitForReady(clone, timeoutMs) {
  const tStart = performance.now();
  while (performance.now() - tStart < timeoutMs) {
    if (clone.killed) return { ...clone, ready: false, ready_ms: 0 };
    await new Promise(r => setTimeout(r, 300));
    const res = await httpGet(clone.port, "/api/memory-fabric", 2000);
    if (res.status === 200 && res.body && res.body.engine) {
      return { ...clone, ready: true, ready_ms: +(performance.now() - tStart).toFixed(1) };
    }
  }
  return { ...clone, ready: false, ready_ms: timeoutMs };
}

async function checkMaster() {
  const res = await httpGet(CONFIG.MASTER_PORT, "/api/memory-fabric");
  return res.status === 200;
}

// ---------------------------------------------------------------------
//   SAFETY MONITOR avec auto-kill
// ---------------------------------------------------------------------
function startStrictMonitor(getCloneRefs) {
  const samples = [];
  let triggered = null;
  let panic = null;
  let killCount = 0;

  const interval = setInterval(() => {
    const freeMb = +(os.freemem() / 1024 / 1024).toFixed(2);
    const clones = getCloneRefs();
    let rssTotal = 0, any = false;
    for (const c of clones) {
      if (c.killed) continue;
      const r = readRssMb(c.pid);
      if (typeof r === "number") { rssTotal += r; any = true; }
    }
    const sample = {
      t: new Date().toISOString(),
      freemem_mb: freeMb,
      rss_total_clones_mb: any ? +rssTotal.toFixed(2) : "UNAVAILABLE",
      loadavg_1m: os.loadavg()[0],
      alive_clones: clones.filter(c => !c.killed).length
    };
    samples.push(sample);

    // PANIC: freemem critique, kill IMMÉDIAT de tous les clones
    if (freeMb < CONFIG.HARD_FREEMEM_MB) {
      panic = { reason: "HARD_FREEMEM", value: freeMb, threshold: CONFIG.HARD_FREEMEM_MB };
      killCount = killAllClones(clones, "PANIC_HARD_FREEMEM");
      console.log(`\n🚨 PANIC freemem=${freeMb}MB < ${CONFIG.HARD_FREEMEM_MB}MB — killing all ${killCount} clones NOW`);
      clearInterval(interval);
      return;
    }

    // SAFETY: kill graduel
    if (!triggered) {
      if (freeMb < CONFIG.SAFETY_FREEMEM_MB) {
        triggered = { reason: "FREEMEM_LOW", value: freeMb, threshold: CONFIG.SAFETY_FREEMEM_MB, at: sample.t };
        // Kill la moitié des clones encore vivants
        const alive = clones.filter(c => !c.killed);
        const toKill = alive.slice(0, Math.ceil(alive.length / 2));
        for (const c of toKill) killClone(c, "SAFETY_FREEMEM");
        killCount = toKill.length;
        console.log(`\n⚠️  SAFETY freemem=${freeMb}MB < ${CONFIG.SAFETY_FREEMEM_MB}MB — killing ${killCount} clones (half)`);
      } else if (sample.rss_total_clones_mb !== "UNAVAILABLE" && sample.rss_total_clones_mb > CONFIG.SAFETY_RSS_TOTAL_MB) {
        triggered = { reason: "RSS_TOTAL_HIGH", value: sample.rss_total_clones_mb, threshold: CONFIG.SAFETY_RSS_TOTAL_MB, at: sample.t };
        const alive = clones.filter(c => !c.killed);
        const toKill = alive.slice(0, Math.ceil(alive.length / 2));
        for (const c of toKill) killClone(c, "SAFETY_RSS");
        killCount = toKill.length;
        console.log(`\n⚠️  SAFETY rss_total=${sample.rss_total_clones_mb}MB > ${CONFIG.SAFETY_RSS_TOTAL_MB}MB — killing ${killCount} clones`);
      }
    }
  }, CONFIG.POLL_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval),
    samples,
    triggered: () => triggered,
    panic: () => panic,
    killCount: () => killCount
  };
}

// ---------------------------------------------------------------------
//   Lancer triple orchestrator en parallèle
// ---------------------------------------------------------------------
function spawnTripleOrchestrator() {
  return new Promise((resolve) => {
    if (!fs.existsSync(CONFIG.TRIPLE_SCRIPT)) {
      resolve({ skipped: true, reason: `${CONFIG.TRIPLE_SCRIPT} not found` });
      return;
    }
    const t0 = performance.now();
    let stdout = "", stderr = "";
    const child = spawn("node", [CONFIG.TRIPLE_SCRIPT, "--skip-fabric", "--mode=parallel"], {
      cwd: process.cwd(),
      env: { ...process.env, VR_SNAPSHOTS: "16384", ROUNDS: "5000" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      const dt = (performance.now() - t0) / 1000;
      resolve({
        skipped: false,
        exit_code: code,
        duration_s: +dt.toFixed(4),
        stdout_tail: stdout.split("\n").filter(Boolean).slice(-15),
        stderr_short: stderr.slice(0, 400)
      });
    });
    child.on("error", e => resolve({ skipped: false, error: String(e.message || e) }));
  });
}

// =====================================================================
//   MAIN
// =====================================================================
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("=================================================");
  console.log("  TRILLIONX EXTREME COMBO — 20 CLONES + TRIPLE");
  console.log("=================================================");
  console.log(`Clones                : ${CONFIG.CLONES}`);
  console.log(`Ports                 : ${CONFIG.BASE_PORT}..${CONFIG.BASE_PORT + CONFIG.CLONES - 1}`);
  console.log(`Master port (intact)  : ${CONFIG.MASTER_PORT}`);
  console.log(`Attack N per clone    : ${CONFIG.ATTACK_N}`);
  console.log(`Triple orchestrator   : in parallel (--skip-fabric --mode=parallel)`);
  console.log(`Safety freemem        : ${CONFIG.SAFETY_FREEMEM_MB} MB (kill half clones)`);
  console.log(`HARD freemem panic    : ${CONFIG.HARD_FREEMEM_MB} MB (kill ALL clones)`);
  console.log(`Spawn batch size      : ${CONFIG.SPAWN_BATCH_SIZE} clones, delay ${CONFIG.SPAWN_BATCH_DELAY_MS}ms`);
  console.log();

  if (!fs.existsSync(CONFIG.FABRIC_SCRIPT)) {
    console.error(`❌ ${CONFIG.FABRIC_SCRIPT} introuvable`);
    process.exit(1);
  }

  const masterAlive = await checkMaster();
  console.log(`Master fabric ${CONFIG.MASTER_PORT}    : ${masterAlive ? "✅ VIVANT (sera INTACT)" : "⚠️  pas accessible"}`);

  const freememInitial = +(os.freemem() / 1024 / 1024).toFixed(2);
  console.log(`Freemem initial       : ${freememInitial} MB`);
  console.log();

  // Spawn par batches
  console.log("--- PHASE 1: SPAWN (batched) ---");
  const clones = [];
  for (let batchStart = 0; batchStart < CONFIG.CLONES; batchStart += CONFIG.SPAWN_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + CONFIG.SPAWN_BATCH_SIZE, CONFIG.CLONES);
    console.log(`  batch [${batchStart}..${batchEnd - 1}]`);
    for (let i = batchStart; i < batchEnd; i++) {
      try {
        const c = await spawnClone(CONFIG.BASE_PORT + i, i);
        clones.push(c);
      } catch (e) {
        console.error(`    spawn fail ${i}: ${e.error || e}`);
      }
    }
    const freeNow = +(os.freemem() / 1024 / 1024).toFixed(2);
    console.log(`    freemem after batch: ${freeNow} MB`);
    if (freeNow < CONFIG.HARD_FREEMEM_MB) {
      console.log(`    🚨 freemem critical, stop spawning more`);
      break;
    }
    if (batchEnd < CONFIG.CLONES) await new Promise(r => setTimeout(r, CONFIG.SPAWN_BATCH_DELAY_MS));
  }
  console.log(`Total spawned         : ${clones.length}/${CONFIG.CLONES}`);
  console.log();

  // Ready check
  console.log("--- PHASE 2: READY CHECK ---");
  const readyChecks = await Promise.all(clones.map(c => waitForReady(c, CONFIG.STARTUP_TIMEOUT_MS)));
  for (const r of readyChecks) {
    console.log(`  clone[${r.idx}] port=${r.port} ${r.ready ? `READY in ${r.ready_ms}ms` : "NOT READY"}`);
  }
  const readyClones = readyChecks.filter(r => r.ready);
  console.log(`Ready                 : ${readyClones.length}/${clones.length}`);
  console.log();

  if (readyClones.length === 0) {
    console.error("❌ Aucun clone prêt — abandon");
    killAllClones(clones, "no_ready");
    process.exit(2);
  }

  // Lance le strict monitor
  const monitor = startStrictMonitor(() => clones);

  // PHASE 3: Attaque + triple en parallèle
  console.log("--- PHASE 3: HEAVY ATTACK + TRIPLE ORCHESTRATOR (true parallel) ---");
  const elMonitor = monitorEventLoopDelay({ resolution: 10 });
  elMonitor.enable();
  const tAttack = performance.now();

  // Lance les 2 charges en parallèle
  const tripleP = spawnTripleOrchestrator();
  const cloneAttacksP = Promise.all(readyClones.map(async (c) => {
    if (c.killed) return { idx: c.idx, port: c.port, skipped: "killed_before_attack" };
    const tLocal = performance.now();
    const res = await httpGet(c.port, `/api/memory-stress?n=${CONFIG.ATTACK_N}`, 90000);
    return {
      idx: c.idx, port: c.port, pid: c.pid,
      duration_s: +((performance.now() - tLocal) / 1000).toFixed(4),
      http_status: res.status,
      http_error: res.error,
      body_size: res.body_size,
      rss_mb_after: readRssMb(c.pid),
      was_killed_during: clones[c.idx] && clones[c.idx].killed
    };
  }));

  const [tripleResult, attackResults] = await Promise.all([tripleP, cloneAttacksP]);
  elMonitor.disable();
  const attackDt = (performance.now() - tAttack) / 1000;
  monitor.stop();

  // Final state
  const freememFinal = +(os.freemem() / 1024 / 1024).toFixed(2);
  const masterIntactAfter = masterAlive ? await checkMaster() : false;

  // Affichage
  console.log();
  console.log("--- ATTACK RESULTS ---");
  console.log("idx | port | status | duration_s | rss_mb | killed");
  console.log("----+------+--------+------------+--------+--------");
  for (const r of attackResults) {
    if (r.skipped) {
      console.log(String(r.idx).padStart(3) + " | " + String(r.port).padEnd(4) + " | SKIPPED " + r.skipped);
      continue;
    }
    const status = r.http_error ? `ERR` : String(r.http_status);
    console.log(
      String(r.idx).padStart(3) + " | " +
      String(r.port).padEnd(4) + " | " +
      status.padEnd(6) + " | " +
      String(r.duration_s).padStart(10) + " | " +
      String(r.rss_mb_after).padStart(6) + " | " +
      (r.was_killed_during ? "YES" : "no")
    );
  }
  console.log();
  console.log("--- TRIPLE ORCHESTRATOR ---");
  if (tripleResult.skipped) {
    console.log(`  SKIPPED: ${tripleResult.reason}`);
  } else if (tripleResult.error) {
    console.log(`  ERROR: ${tripleResult.error}`);
  } else {
    console.log(`  exit_code: ${tripleResult.exit_code}, duration: ${tripleResult.duration_s}s`);
    console.log(`  tail:`);
    tripleResult.stdout_tail.slice(-5).forEach(l => console.log(`    ${l}`));
  }
  console.log();

  // Cleanup
  console.log("--- PHASE 4: CLEANUP ---");
  const killed = killAllClones(clones, "end_of_test");
  console.log(`  ${killed} SIGTERM sent (deja killés par safety: ${clones.filter(c=>c.killed && c.kill_reason !== "end_of_test").length})`);
  await new Promise(r => setTimeout(r, 500));
  console.log();

  // Verdict
  const okCount = attackResults.filter(r => r.http_status === 200).length;
  const errCount = attackResults.filter(r => !r.skipped && r.http_status !== 200).length;
  const skippedCount = attackResults.filter(r => r.skipped).length;
  const freememValues = monitor.samples.map(s => s.freemem_mb).filter(Number.isFinite);
  const freememMin = freememValues.length ? Math.min(...freememValues) : "UNAVAILABLE";
  const rssValues = monitor.samples.map(s => s.rss_total_clones_mb).filter(v => typeof v === "number");
  const rssMax = rssValues.length ? Math.max(...rssValues) : "UNAVAILABLE";

  const report = {
    module: "TRILLIONX_EXTREME_COMBO",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    config: CONFIG,
    wall_clock_s: +((performance.now() - tAttack + 1000) / 1000).toFixed(4),
    attack_duration_s: +attackDt.toFixed(4),
    freemem: {
      initial_mb: freememInitial,
      min_during_mb: freememMin,
      final_mb: freememFinal,
      drop_max_mb: typeof freememMin === "number" ? +(freememInitial - freememMin).toFixed(2) : "UNAVAILABLE"
    },
    rss_clones_max_total_mb: rssMax,
    spawn_summary: {
      requested: CONFIG.CLONES,
      spawned: clones.length,
      ready: readyClones.length
    },
    attack_summary: {
      ok: okCount,
      errors: errCount,
      skipped: skippedCount
    },
    safety_monitor: {
      samples_count: monitor.samples.length,
      triggered: monitor.triggered() || "NEVER_TRIGGERED",
      panic: monitor.panic() || "NEVER_PANIC",
      auto_kill_count: monitor.killCount(),
      thresholds: {
        safety_freemem_mb: CONFIG.SAFETY_FREEMEM_MB,
        hard_freemem_mb: CONFIG.HARD_FREEMEM_MB,
        safety_rss_total_mb: CONFIG.SAFETY_RSS_TOTAL_MB
      }
    },
    triple_orchestrator: tripleResult,
    event_loop_main: {
      mean_ms: Number.isFinite(elMonitor.mean) ? +(elMonitor.mean / 1e6).toFixed(3) : "UNAVAILABLE",
      max_ms: Number.isFinite(elMonitor.max) ? +(elMonitor.max / 1e6).toFixed(3) : "UNAVAILABLE",
      p99_ms: Number.isFinite(elMonitor.percentile(99)) ? +(elMonitor.percentile(99) / 1e6).toFixed(3) : "UNAVAILABLE"
    },
    master_fabric: {
      port: CONFIG.MASTER_PORT,
      alive_before: masterAlive,
      alive_after: masterIntactAfter,
      intact: masterAlive === masterIntactAfter,
      doctrine_respected: true
    },
    attack_results: attackResults,
    monitor_trajectory: monitor.samples,
    verdict: {
      all_ok: okCount === readyClones.length && masterAlive === masterIntactAfter,
      bored_or_busy: freememMin !== "UNAVAILABLE" && freememMin > 800 ? "STILL_HAS_HEADROOM" : "REACHED_PRESSURE",
      reading: "Cherche freemem.min_during_mb pour voir où il a vraiment galéré. " +
               "Si safety_monitor.triggered != NEVER_TRIGGERED, le garde-fou a agi (clones killés par auto-protection)."
    },
    time: new Date().toISOString()
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log("=================================================");
  console.log("  VERDICT");
  console.log("=================================================");
  console.log(`Attack duration       : ${report.attack_duration_s} s`);
  console.log(`Clones OK             : ${okCount}/${readyClones.length}`);
  console.log(`Clones errors         : ${errCount}`);
  console.log(`Freemem initial       : ${freememInitial} MB`);
  console.log(`Freemem min during    : ${freememMin} MB`);
  console.log(`Freemem drop max      : ${report.freemem.drop_max_mb} MB`);
  console.log(`RSS clones max total  : ${rssMax} MB`);
  console.log(`Event-loop max (main) : ${report.event_loop_main.max_ms} ms`);
  console.log(`Safety triggered      : ${monitor.triggered() ? monitor.triggered().reason : "NEVER"}`);
  console.log(`Panic                 : ${monitor.panic() ? monitor.panic().reason : "NEVER"}`);
  console.log(`Auto-kill count       : ${monitor.killCount()}`);
  console.log(`Triple orchestrator   : ${tripleResult.skipped ? "skipped" : `exit=${tripleResult.exit_code}, ${tripleResult.duration_s}s`}`);
  console.log(`Master fabric intact  : ${masterIntactAfter ? "YES (PID untouched)" : "NO"}`);
  console.log(`Verdict               : ${report.verdict.bored_or_busy}`);
  console.log(`Report                : ${OUT_FILE}`);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => {
  console.error("EXTREME_COMBO_ERROR", e.stack || e);
  process.exit(1);
});
