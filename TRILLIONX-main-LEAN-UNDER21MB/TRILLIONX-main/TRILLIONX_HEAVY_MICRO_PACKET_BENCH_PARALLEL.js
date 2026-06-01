"use strict";

// =====================================================================
//   TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL
//   Wrapper additif autour de TRILLIONX_HEAVY_MICRO_PACKET_BENCH
//   Réplique la même unité de travail (sha256 + zlib + cache + json)
//   Modes: sync / async / parallel / dynamic
// =====================================================================
//
// Usage CLI:
//   node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js sync
//   node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js async
//   node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js parallel 4
//   node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js dynamic
//   node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js compare
//
// Env: PACKET_KB=8 ROUNDS=12000 CACHE_MAX=256
// =====================================================================

const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { isMainThread, parentPort, workerData, Worker } = require("worker_threads");

const PATTERN = require("./TRILLIONX_PARALLELISM_PATTERN.js");

const OUT_DIR = "runtime_state/bench";
const PACKET_KB = Number(process.env.PACKET_KB || 8);
const PACKET_BYTES = PACKET_KB * 1024;
const ROUNDS = Number(process.env.ROUNDS || 12000);
const CACHE_MAX = Number(process.env.CACHE_MAX || 256);

function makePacket(i) {
  const seed = Buffer.allocUnsafe(32);
  seed.writeBigUInt64LE(BigInt(i), 0);
  seed.writeBigUInt64LE(BigInt((Date.now() + i) & 0xffffffff), 8);
  const key = crypto.createHash("sha256").update(seed).digest();
  const b = Buffer.allocUnsafe(PACKET_BYTES);
  for (let j = 0; j < PACKET_BYTES; j++) b[j] = key[j & 31] ^ ((i + j) & 255);
  return b;
}

function doRound(i, state) {
  const packet = makePacket(i);
  state.rawBytes += packet.length;
  const sha = crypto.createHash("sha256").update(packet).digest("hex");
  state.checksum.update(sha);
  const compressed = zlib.deflateSync(packet, { level: 1 });
  const inflated = zlib.inflateSync(compressed);
  state.compressedBytes += compressed.length;
  if (inflated.length === packet.length) state.decodeOk++;
  const cacheKey = sha.slice(0, 16);
  if (state.cache.has(cacheKey)) state.cacheHits++;
  else {
    state.cacheMiss++;
    state.cache.set(cacheKey, compressed.length);
    if (state.cache.size > CACHE_MAX) state.cache.delete(state.cache.keys().next().value);
  }
  state.jsonBytes += Buffer.byteLength(JSON.stringify({
    i, kb: PACKET_KB, sha16: cacheKey,
    raw: packet.length, zip: compressed.length,
    ratio: +(compressed.length / packet.length).toFixed(4),
    ok: inflated.length === packet.length
  }));
}

function freshState() {
  return {
    rawBytes: 0, compressedBytes: 0, jsonBytes: 0,
    decodeOk: 0, cacheHits: 0, cacheMiss: 0,
    cache: new Map(), checksum: crypto.createHash("sha256")
  };
}

function finalize(state, mode, extra) {
  const ratio = state.rawBytes > 0 ? +(state.compressedBytes / state.rawBytes).toFixed(4) : "UNAVAILABLE";
  return {
    module: "TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    mode,
    config: { packet_kb: PACKET_KB, rounds: ROUNDS, cache_max: CACHE_MAX },
    ...extra,
    metrics: {
      raw_MB: +(state.rawBytes / 1024 / 1024).toFixed(3),
      compressed_MB: +(state.compressedBytes / 1024 / 1024).toFixed(3),
      compression_ratio: ratio,
      json_MB: +(state.jsonBytes / 1024 / 1024).toFixed(3),
      decode_ok: state.decodeOk,
      cache_entries: state.cache.size,
      cache_hits: state.cacheHits,
      cache_miss: state.cacheMiss,
      checksum_sha256: state.checksum.digest("hex").slice(0, 32)
    },
    interpretation: {
      heavy_app_model: "sha256 + zlib + cache + json (parallel variant)",
      physical_ram_claim: false, fake_power_claim: false
    },
    time: new Date().toISOString()
  };
}

// =====================================================================
//   WORKER ENTRY POINT
// =====================================================================
if (!isMainThread) {
  const state = freshState();
  const t0 = performance.now();
  for (let i = workerData.startIdx; i < workerData.endIdx; i++) doRound(i, state);
  const dt = (performance.now() - t0) / 1000;
  parentPort.postMessage({
    workerId: workerData.workerId,
    range: [workerData.startIdx, workerData.endIdx],
    rawBytes: state.rawBytes,
    compressedBytes: state.compressedBytes,
    jsonBytes: state.jsonBytes,
    decodeOk: state.decodeOk,
    cacheHits: state.cacheHits,
    cacheMiss: state.cacheMiss,
    checksum: state.checksum.digest("hex").slice(0, 32),
    duration_s: +dt.toFixed(6)
  });
  return;
}

// =====================================================================
//   MODES
// =====================================================================

function modeSync() {
  const state = freshState();
  const t0 = performance.now();
  for (let i = 0; i < ROUNDS; i++) doRound(i, state);
  const dt = (performance.now() - t0) / 1000;
  return finalize(state, "sync", {
    duration_s: +dt.toFixed(6),
    packets_s: +(ROUNDS / Math.max(dt, 1e-9)).toFixed(2),
    raw_MB_s: +((state.rawBytes / 1024 / 1024) / Math.max(dt, 1e-9)).toFixed(2)
  });
}

async function modeAsync() {
  const state = freshState();
  // yield every 100 rounds — heavy work, faut respirer
  const res = await PATTERN.runAsync((i) => doRound(i, state), ROUNDS, 100);
  return finalize(state, "async", {
    duration_s: res.duration_s,
    packets_s: +(ROUNDS / Math.max(res.duration_s, 1e-9)).toFixed(2),
    raw_MB_s: +((state.rawBytes / 1024 / 1024) / Math.max(res.duration_s, 1e-9)).toFixed(2),
    event_loop_mean_ms: res.event_loop_mean_ms,
    event_loop_max_ms: res.event_loop_max_ms
  });
}

async function modeParallel(workers = 4) {
  const res = await PATTERN.runParallel(__filename, ROUNDS, workers);
  const total = res.worker_results.reduce((a, w) => ({
    rawBytes: a.rawBytes + w.rawBytes,
    compressedBytes: a.compressedBytes + w.compressedBytes,
    jsonBytes: a.jsonBytes + w.jsonBytes,
    decodeOk: a.decodeOk + w.decodeOk,
    cacheHits: a.cacheHits + w.cacheHits,
    cacheMiss: a.cacheMiss + w.cacheMiss
  }), { rawBytes: 0, compressedBytes: 0, jsonBytes: 0, decodeOk: 0, cacheHits: 0, cacheMiss: 0 });

  const combinedChecksum = crypto.createHash("sha256")
    .update(res.worker_results.map(w => w.checksum).join("|"))
    .digest("hex").slice(0, 32);

  const stateLike = {
    ...total,
    cache: { size: "UNAVAILABLE_ACROSS_WORKERS" },
    checksum: { digest: () => combinedChecksum }
  };

  return finalize(stateLike, "parallel", {
    workers_used: res.workers_used,
    workers_requested: res.workers_requested,
    workers_max_guard: res.workers_max_guard,
    chunk_size: res.chunk_size,
    duration_s: res.duration_s,
    packets_s: +(ROUNDS / Math.max(res.duration_s, 1e-9)).toFixed(2),
    raw_MB_s: +((total.rawBytes / 1024 / 1024) / Math.max(res.duration_s, 1e-9)).toFixed(2),
    worker_breakdown: res.worker_results
  });
}

async function modeDynamic() {
  const decision = await PATTERN.chooseDynamicMode(ROUNDS);
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
        module: "TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL_COMPARE",
        doctrine: "REAL_ONLY_OR_UNAVAILABLE",
        runs: {
          sync:     modeSync(),
          async:    await modeAsync(),
          parallel: await modeParallel(4),
          dynamic:  await modeDynamic()
        },
        time: new Date().toISOString()
      };
      const file = `${OUT_DIR}/trillionx_heavy_packet_parallel_compare_last.json`;
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      console.log("===== TRILLIONX HEAVY PACKET PARALLEL COMPARE =====");
      console.log("SYNC     packets/s :", out.runs.sync.packets_s, "MB/s:", out.runs.sync.raw_MB_s);
      console.log("ASYNC    packets/s :", out.runs.async.packets_s, "MB/s:", out.runs.async.raw_MB_s);
      console.log("PARALLEL packets/s :", out.runs.parallel.packets_s, "MB/s:", out.runs.parallel.raw_MB_s, `(${out.runs.parallel.workers_used} workers)`);
      console.log("DYNAMIC  packets/s :", out.runs.dynamic.packets_s, "MB/s:", out.runs.dynamic.raw_MB_s, `(${out.runs.dynamic.mode})`);
      console.log("Compression ratio  :", out.runs.sync.metrics.compression_ratio);
      console.log("Report             :", file);
      console.log("REAL_ONLY_OR_UNAVAILABLE");
      return;
    }
    default:
      console.error("Unknown mode:", cmd);
      process.exit(2);
  }

  const file = `${OUT_DIR}/trillionx_heavy_packet_parallel_${cmd}_last.json`;
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`===== TRILLIONX HEAVY PACKET ${cmd.toUpperCase()} =====`);
  console.log("packets/s      :", result.packets_s);
  console.log("raw MB/s       :", result.raw_MB_s);
  console.log("compression    :", result.metrics.compression_ratio);
  console.log("decode_ok      :", result.metrics.decode_ok, "/", ROUNDS);
  console.log("Report         :", file);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => { console.error("BENCH_ERROR", e.stack || e); process.exit(1); });
