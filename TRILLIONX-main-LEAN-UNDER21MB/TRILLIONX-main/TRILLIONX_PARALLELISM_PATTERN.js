"use strict";

// =====================================================================
//   TRILLIONX_PARALLELISM_PATTERN
//   Pattern commun: multi-couches sync / async / parallel / dynamic
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY, NO_FAKE_METRICS
//   Auteur: René (brinkcoin486) — TRILLIONX ecosystem
//   Cohérence avec MANIFEST_ULTIMATE.guards: max_workers:4, ram_max_mb:4096
// =====================================================================

const os = require("os");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

// ---------------------------------------------------------------------
//   measureRealLoad() — mesure réelle, jamais extrapolée
// ---------------------------------------------------------------------
async function measureRealLoad(sampleMs = 200) {
  const monitor = monitorEventLoopDelay({ resolution: 10 });
  monitor.enable();
  const start = performance.now();
  await new Promise(r => setTimeout(r, sampleMs));
  monitor.disable();
  const elapsed = performance.now() - start;

  const mem = process.memoryUsage();
  const load = os.loadavg();
  const cpus = os.cpus().length;

  return {
    sample_ms: +elapsed.toFixed(2),
    event_loop_mean_ms: Number.isFinite(monitor.mean) ? +(monitor.mean / 1e6).toFixed(3) : "UNAVAILABLE",
    event_loop_max_ms: Number.isFinite(monitor.max) ? +(monitor.max / 1e6).toFixed(3) : "UNAVAILABLE",
    rss_mb: +(mem.rss / 1024 / 1024).toFixed(2),
    heap_used_mb: +(mem.heapUsed / 1024 / 1024).toFixed(2),
    freemem_mb: +(os.freemem() / 1024 / 1024).toFixed(2),
    totalmem_mb: +(os.totalmem() / 1024 / 1024).toFixed(2),
    loadavg_1m: load[0],
    cpus_logical: cpus,
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    note: "measured, not estimated"
  };
}

// ---------------------------------------------------------------------
//   COUCHE 1 — ASYNC : wrap d'une boucle sync en non-bloquante
// ---------------------------------------------------------------------
//   Pattern : appelle roundFn(i) pour i=0..N-1
//             cède l'event-loop tous les `yieldEvery` rounds
//   Retourne : { duration_s, rounds, mode:"async", event_loop }
//
async function runAsync(roundFn, N, yieldEvery = 1) {
  const monitor = monitorEventLoopDelay({ resolution: 10 });
  monitor.enable();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    roundFn(i);
    if (i % yieldEvery === 0) {
      await new Promise(r => setImmediate(r));
    }
  }
  monitor.disable();
  const dt = (performance.now() - t0) / 1000;
  return {
    mode: "async",
    rounds: N,
    yield_every: yieldEvery,
    duration_s: +dt.toFixed(6),
    rounds_per_s: +(N / Math.max(dt, 1e-9)).toFixed(2),
    event_loop_mean_ms: Number.isFinite(monitor.mean) ? +(monitor.mean / 1e6).toFixed(3) : "UNAVAILABLE",
    event_loop_max_ms: Number.isFinite(monitor.max) ? +(monitor.max / 1e6).toFixed(3) : "UNAVAILABLE",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

// ---------------------------------------------------------------------
//   COUCHE 2 — PARALLEL : pool worker_threads natifs
// ---------------------------------------------------------------------
//   Pattern : workerScript = chemin absolu d'un fichier qui fait
//             - reçoit workerData = { startIdx, endIdx, ...config }
//             - exécute sa boucle
//             - postMessage(agrégats stateless)
//
//   Sécurité : MAX_WORKERS plafonné à guards.max_workers (4)
//              limite cohérente avec MANIFEST_ULTIMATE
//
async function runParallel(workerScript, N, workers = 2, configExtra = {}) {
  const MAX_WORKERS = 4;  // guard cohérent avec MANIFEST_ULTIMATE
  const W = Math.max(1, Math.min(workers, MAX_WORKERS));
  const chunk = Math.ceil(N / W);
  const t0 = performance.now();

  const promises = [];
  for (let w = 0; w < W; w++) {
    const startIdx = w * chunk;
    const endIdx = Math.min(N, startIdx + chunk);
    if (startIdx >= endIdx) continue;
    promises.push(new Promise((resolve, reject) => {
      const worker = new Worker(workerScript, {
        workerData: { workerId: w, startIdx, endIdx, ...configExtra }
      });
      worker.on("message", msg => resolve(msg));
      worker.on("error", reject);
      worker.on("exit", code => {
        if (code !== 0) reject(new Error(`worker ${w} exit ${code}`));
      });
    }));
  }

  const results = await Promise.all(promises);
  const dt = (performance.now() - t0) / 1000;

  return {
    mode: "parallel",
    rounds: N,
    workers_used: results.length,
    workers_requested: workers,
    workers_max_guard: MAX_WORKERS,
    chunk_size: chunk,
    duration_s: +dt.toFixed(6),
    rounds_per_s: +(N / Math.max(dt, 1e-9)).toFixed(2),
    worker_results: results,
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

// ---------------------------------------------------------------------
//   COUCHE 3 — DYNAMIC : choisit le mode selon mesure réelle
// ---------------------------------------------------------------------
//   Règles (ordre de priorité, basé sur mesure live) :
//   1. event_loop_max_ms > 100  → ASYNC (event-loop sous pression)
//   2. freemem_mb < 500         → SYNC (RAM trop tendue pour workers)
//   3. loadavg_1m > cpus * 0.8  → ASYNC (CPU déjà chargé)
//   4. freemem_mb > 1500 && N>500 → PARALLEL (4 workers)
//   5. N <= 100                 → SYNC (overhead async > gain)
//   6. fallback                 → ASYNC (compromis sûr)
//
async function chooseDynamicMode(N) {
  const load = await measureRealLoad(150);
  const cpus = load.cpus_logical || 1;
  let mode, reason;

  if (load.event_loop_max_ms !== "UNAVAILABLE" && load.event_loop_max_ms > 100) {
    mode = "async";
    reason = `event_loop_max_ms=${load.event_loop_max_ms} > 100`;
  } else if (load.freemem_mb < 500) {
    mode = "sync";
    reason = `freemem_mb=${load.freemem_mb} < 500 (workers risky)`;
  } else if (load.loadavg_1m > cpus * 0.8) {
    mode = "async";
    reason = `loadavg_1m=${load.loadavg_1m} > cpus*0.8=${(cpus * 0.8).toFixed(2)}`;
  } else if (load.freemem_mb > 1500 && N > 500) {
    mode = "parallel";
    reason = `freemem_mb=${load.freemem_mb} > 1500 && N=${N} > 500`;
  } else if (N <= 100) {
    mode = "sync";
    reason = `N=${N} <= 100 (sync overhead minimal)`;
  } else {
    mode = "async";
    reason = `fallback safe choice`;
  }

  return { mode, reason, load_snapshot: load };
}

module.exports = {
  measureRealLoad,
  runAsync,
  runParallel,
  chooseDynamicMode,
  MAX_WORKERS_GUARD: 4,
  doctrine: "REAL_ONLY_OR_UNAVAILABLE",
  pattern_version: "TRILLIONX_PARALLELISM_PATTERN_v1.0",
  additive_only: true,
  no_fake_metrics: true
};
