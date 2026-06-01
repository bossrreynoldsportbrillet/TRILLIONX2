"use strict";

// =====================================================================
//   TRILLIONX_VR_MIRROR_BENCH_PARALLEL
//   Wrapper additif autour de TRILLIONX_VR_MIRROR_BENCH (l'original)
//   N'écrase RIEN — écrit dans des fichiers séparés
//   Modes: sync / async / parallel / dynamic
// =====================================================================
//
// Usage CLI:
//   node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js sync
//   node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js async
//   node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js parallel 4
//   node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js dynamic
//   node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js compare      # tous les modes
//
// Env vars (mêmes que l'original):
//   VR_MIRRORS, VR_FACETS, VR_SNAPSHOTS, VR_CACHE_MAX
//
// Le worker_threads est dans ce même fichier (path.argv[1])
// =====================================================================

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { performance } = require("perf_hooks");
const { isMainThread, parentPort, workerData, Worker } = require("worker_threads");

const PATTERN = require("./TRILLIONX_PARALLELISM_PATTERN.js");

const OUT_DIR = "runtime_state/bench";
const MIRRORS = Number(process.env.VR_MIRRORS || 16);
const FACETS = Number(process.env.VR_FACETS || 64);
const SNAPSHOTS = Number(process.env.VR_SNAPSHOTS || 8192);
const CACHE_MAX = Number(process.env.VR_CACHE_MAX || 2048);

// ---------------------------------------------------------------------
//   doRound(i, state) — la même unité de travail que l'original
// ---------------------------------------------------------------------
function doRound(i, state) {
  const mirror = i % MIRRORS;
  const facet = i % FACETS;
  const payload = `TRILLIONX|VR_MIRROR|snapshot=${i}|mirror=${mirror}|facet=${facet}|seed=${state.digest}|`;
  const h = crypto.createHash("sha256").update(payload).digest("hex");
  state.digest = crypto.createHash("sha256").update(state.digest + h).digest("hex");
  const key = `${mirror}:${facet}:${h.slice(0, 12)}`;
  if (state.cache.has(key)) state.collisions++;
  state.cache.set(key, { mirror, facet, h });
  if (state.cache.size > CACHE_MAX) state.cache.delete(state.cache.keys().next().value);
  state.writes++;
  state.reads++;
  state.bytes += Buffer.byteLength(payload);
}

function freshState(seed = "TRILLIONX_VR_MIRROR_PARALLEL_START") {
  return { digest: seed, cache: new Map(), collisions: 0, writes: 0, reads: 0, bytes: 0 };
}

function finalize(state, mode, extra) {
  return {
    module: "TRILLIONX_VR_MIRROR_BENCH_PARALLEL",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    subject: "TRILLIONX_ONLY",
    mode,
    display_policy: { no_percentages: true, no_host_identity: true, no_profit_claim: true },
    vr_mirror: {
      mirrors: MIRRORS, facets: FACETS, snapshots: SNAPSHOTS, cache_max: CACHE_MAX,
      writes: state.writes, reads: state.reads,
      mirror_bytes: state.bytes, mirror_MB: +(state.bytes / 1024 / 1024).toFixed(3),
      cache_entries: state.cache.size, collisions: state.collisions,
      digest: state.digest.slice(0, 32)
    },
    ...extra,
    verdict: { state: "TRILLIONX_VR_MIRROR_LAYER_PARALLEL_OK" },
    time: new Date().toISOString()
  };
}

// =====================================================================
//   WORKER ENTRY POINT — exécuté dans worker_threads
// =====================================================================
if (!isMainThread) {
  const state = freshState(`TRILLIONX_VR_MIRROR_W${workerData.workerId}`);
  const t0 = performance.now();
  for (let i = workerData.startIdx; i < workerData.endIdx; i++) {
    doRound(i, state);
  }
  const dt = (performance.now() - t0) / 1000;
  parentPort.postMessage({
    workerId: workerData.workerId,
    range: [workerData.startIdx, workerData.endIdx],
    writes: state.writes, reads: state.reads,
    bytes: state.bytes, collisions: state.collisions,
    digest: state.digest.slice(0, 32),
    duration_s: +dt.toFixed(6)
  });
  return;
}

// =====================================================================
//   MAIN MODES
// =====================================================================

function modeSync() {
  const state = freshState();
  const t0 = performance.now();
  for (let i = 0; i < SNAPSHOTS; i++) doRound(i, state);
  const dt = (performance.now() - t0) / 1000;
  return finalize(state, "sync", {
    duration_s: +dt.toFixed(6),
    ops_s: +((state.writes + state.reads) / Math.max(dt, 1e-9)).toFixed(2)
  });
}

async function modeAsync() {
  const state = freshState();
  const res = await PATTERN.runAsync((i) => doRound(i, state), SNAPSHOTS, 256);
  return finalize(state, "async", {
    duration_s: res.duration_s,
    ops_s: +((state.writes + state.reads) / Math.max(res.duration_s, 1e-9)).toFixed(2),
    event_loop_mean_ms: res.event_loop_mean_ms,
    event_loop_max_ms: res.event_loop_max_ms
  });
}

async function modeParallel(workers = 4) {
  const res = await PATTERN.runParallel(__filename, SNAPSHOTS, workers);
  const total = res.worker_results.reduce((a, w) => ({
    writes: a.writes + w.writes,
    reads: a.reads + w.reads,
    bytes: a.bytes + w.bytes,
    collisions: a.collisions + w.collisions
  }), { writes: 0, reads: 0, bytes: 0, collisions: 0 });
  const combinedDigest = crypto.createHash("sha256")
    .update(res.worker_results.map(w => w.digest).join("|"))
    .digest("hex").slice(0, 32);

  return finalize(
    { ...total, digest: combinedDigest, cache: { size: "UNAVAILABLE_ACROSS_WORKERS" } },
    "parallel",
    {
      workers_used: res.workers_used,
      workers_requested: res.workers_requested,
      workers_max_guard: res.workers_max_guard,
      chunk_size: res.chunk_size,
      duration_s: res.duration_s,
      ops_s: +((total.writes + total.reads) / Math.max(res.duration_s, 1e-9)).toFixed(2),
      worker_breakdown: res.worker_results
    }
  );
}

async function modeDynamic() {
  const decision = await PATTERN.chooseDynamicMode(SNAPSHOTS);
  let result;
  if (decision.mode === "sync") result = modeSync();
  else if (decision.mode === "async") result = await modeAsync();
  else result = await modeParallel(4);
  result.dynamic_decision = decision;
  result.mode = `dynamic→${decision.mode}`;
  return result;
}

// =====================================================================
//   ENTRY
// =====================================================================
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cmd = (process.argv[2] || "compare").toLowerCase();
  let result;

  switch (cmd) {
    case "sync":     result = modeSync(); break;
    case "async":    result = await modeAsync(); break;
    case "parallel": result = await modeParallel(Number(process.argv[3] || 4)); break;
    case "dynamic":  result = await modeDynamic(); break;
    case "compare": {
      const out = {
        module: "TRILLIONX_VR_MIRROR_BENCH_PARALLEL_COMPARE",
        doctrine: "REAL_ONLY_OR_UNAVAILABLE",
        runs: {
          sync:     modeSync(),
          async:    await modeAsync(),
          parallel: await modeParallel(4),
          dynamic:  await modeDynamic()
        },
        time: new Date().toISOString()
      };
      const file = `${OUT_DIR}/trillionx_vr_mirror_parallel_compare_last.json`;
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      console.log("===== TRILLIONX VR MIRROR PARALLEL COMPARE =====");
      console.log("SYNC     ops/s :", out.runs.sync.ops_s);
      console.log("ASYNC    ops/s :", out.runs.async.ops_s);
      console.log("PARALLEL ops/s :", out.runs.parallel.ops_s, `(${out.runs.parallel.workers_used} workers)`);
      console.log("DYNAMIC  ops/s :", out.runs.dynamic.ops_s, `(${out.runs.dynamic.mode})`);
      console.log("Report         :", file);
      console.log("REAL_ONLY_OR_UNAVAILABLE");
      return;
    }
    default:
      console.error("Unknown mode:", cmd);
      console.error("Usage: node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js [sync|async|parallel N|dynamic|compare]");
      process.exit(2);
  }

  const file = `${OUT_DIR}/trillionx_vr_mirror_parallel_${cmd}_last.json`;
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`===== TRILLIONX VR MIRROR ${cmd.toUpperCase()} =====`);
  console.log("ops/s          :", result.ops_s);
  console.log("duration_s     :", result.duration_s);
  console.log("collisions     :", result.vr_mirror.collisions);
  console.log("digest         :", result.vr_mirror.digest);
  console.log("Report         :", file);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => { console.error("BENCH_ERROR", e.stack || e); process.exit(1); });
