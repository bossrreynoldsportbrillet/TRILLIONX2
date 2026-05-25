"use strict";

const fs = require("fs");
const os = require("os");
const zlib = require("zlib");
const crypto = require("crypto");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/heavy_micro_packet_last.json`;

const PACKET_KB = Number(process.env.PACKET_KB || 8);
const PACKET_BYTES = PACKET_KB * 1024;
const ROUNDS = Number(process.env.ROUNDS || 12000);
const CACHE_MAX = Number(process.env.CACHE_MAX || 256);
const CHECKPOINT_EVERY = Number(process.env.CHECKPOINT_EVERY || 3000);
const MAX_WRITE_MB = Number(process.env.MAX_WRITE_MB || 4);

fs.mkdirSync(OUT_DIR, { recursive: true });

function gb(x){ return +(x / 1024 / 1024 / 1024).toFixed(3); }
function mb(x){ return +(x / 1024 / 1024).toFixed(3); }
function now(){ return performance.now(); }

function run(cmd){
  try { return require("child_process").execSync(cmd,{encoding:"utf8"}).trim(); }
  catch { return ""; }
}

function disk(){
  const line = run(`df -BM /workspaces | awk 'NR==2 {gsub("M","",$2);gsub("M","",$3);gsub("M","",$4);print $2,$3,$4,$5}'`);
  if(!line) return "UNAVAILABLE";
  const [total, used, free, pct] = line.split(/\s+/);
  return { total_MB:+total, used_MB:+used, free_MB:+free, use_percent:pct };
}

function makePacket(i){
  const seed = Buffer.allocUnsafe(32);
  seed.writeBigUInt64LE(BigInt(i), 0);
  seed.writeBigUInt64LE(BigInt((Date.now()+i) & 0xffffffff), 8);
  const key = crypto.createHash("sha256").update(seed).digest();
  const b = Buffer.allocUnsafe(PACKET_BYTES);
  for(let j=0;j<PACKET_BYTES;j++) b[j] = key[j & 31] ^ ((i+j) & 255);
  return b;
}

async function main(){
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();

  const start = now();
  const mem0 = process.memoryUsage();
  const cache = new Map();
  const scratch = `${OUT_DIR}/heavy_micro_packet_scratch.tmp`;

  try { fs.rmSync(scratch,{force:true}); } catch {}

  let rawBytes=0, compressedBytes=0, jsonBytes=0, ioBytes=0;
  let checksum = crypto.createHash("sha256");
  let cacheHits=0, cacheMiss=0;
  let decodeOk=0;

  for(let i=0;i<ROUNDS;i++){
    const packet = makePacket(i);
    rawBytes += packet.length;

    const sha = crypto.createHash("sha256").update(packet).digest("hex");
    checksum.update(sha);

    const compressed = zlib.deflateSync(packet, { level: 1 });
    const inflated = zlib.inflateSync(compressed);

    compressedBytes += compressed.length;
    if(inflated.length === packet.length) decodeOk++;

    const cacheKey = sha.slice(0,16);
    if(cache.has(cacheKey)){
      cacheHits++;
    } else {
      cacheMiss++;
      cache.set(cacheKey, compressed.length);
      if(cache.size > CACHE_MAX){
        const first = cache.keys().next().value;
        cache.delete(first);
      }
    }

    const meta = {
      i,
      kb: PACKET_KB,
      sha16: cacheKey,
      raw: packet.length,
      zip: compressed.length,
      ratio: +(compressed.length / packet.length).toFixed(4),
      ok: inflated.length === packet.length
    };

    const s = JSON.stringify(meta);
    jsonBytes += Buffer.byteLength(s);

    if(i % CHECKPOINT_EVERY === 0 && ioBytes < MAX_WRITE_MB * 1024 * 1024){
      fs.appendFileSync(scratch, s + "\n");
      ioBytes += Buffer.byteLength(s) + 1;
    }
  }

  let scratchPeak = 0;
  try { scratchPeak = fs.statSync(scratch).size; fs.rmSync(scratch,{force:true}); } catch {}

  delay.disable();
  const duration = (now() - start) / 1000;
  const mem1 = process.memoryUsage();

  const result = {
    module: "TRILLIONX_HEAVY_MICRO_PACKET_BENCH",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    time: new Date().toISOString(),
    config: {
      packet_kb: PACKET_KB,
      rounds: ROUNDS,
      cache_max: CACHE_MAX,
      checkpoint_every: CHECKPOINT_EVERY,
      max_write_MB: MAX_WRITE_MB
    },
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      node: process.version,
      cpu_model: os.cpus()[0]?.model || "UNAVAILABLE",
      logical_cpus: os.cpus().length,
      ram_total_GB: gb(os.totalmem()),
      ram_free_GB: gb(os.freemem())
    },
    metrics: {
      duration_s: +duration.toFixed(4),
      packets_s: +(ROUNDS/duration).toFixed(2),
      raw_MB: mb(rawBytes),
      raw_MB_s: +((rawBytes/1024/1024)/duration).toFixed(2),
      compressed_MB: mb(compressedBytes),
      compression_ratio: +(compressedBytes/rawBytes).toFixed(4),
      json_MB: mb(jsonBytes),
      json_MB_s: +((jsonBytes/1024/1024)/duration).toFixed(2),
      decode_ok: decodeOk,
      cache_entries: cache.size,
      cache_hits: cacheHits,
      cache_miss: cacheMiss,
      scratch_io_MB: mb(ioBytes),
      scratch_peak_MB: mb(scratchPeak),
      event_loop_mean_ms: Number.isFinite(delay.mean) ? +(delay.mean/1e6).toFixed(4) : "UNAVAILABLE",
      event_loop_max_ms: Number.isFinite(delay.max) ? +(delay.max/1e6).toFixed(4) : "UNAVAILABLE",
      checksum_sha256: checksum.digest("hex")
    },
    memory_process: {
      rss_GB_start: gb(mem0.rss),
      rss_GB_end: gb(mem1.rss),
      heap_used_GB_end: gb(mem1.heapUsed)
    },
    disk_workspaces: disk(),
    interpretation: {
      heavy_app_model: "micro-packet compression/hash/json/cache/checkpoint",
      physical_ram_claim: false,
      fake_power_claim: false,
      result_scope: "current Codespaces host only"
    }
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result,null,2));

  console.log("===== TRILLIONX HEAVY MICRO PACKET μ BENCH =====");
  console.log(`Packet          : ${PACKET_KB} KB`);
  console.log(`Rounds          : ${ROUNDS}`);
  console.log(`Duration        : ${result.metrics.duration_s} s`);
  console.log(`Packets/s       : ${result.metrics.packets_s}`);
  console.log(`Raw throughput  : ${result.metrics.raw_MB_s} MB/s`);
  console.log(`Compression     : ratio ${result.metrics.compression_ratio}`);
  console.log(`Decode OK       : ${decodeOk}/${ROUNDS}`);
  console.log(`Cache entries   : ${cache.size}`);
  console.log(`RSS end         : ${result.memory_process.rss_GB_end} GB`);
  console.log(`Disk            : ${JSON.stringify(result.disk_workspaces)}`);
  console.log(`Report          : ${OUT_FILE}`);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => {
  console.error("BENCH_ERROR", e && e.stack ? e.stack : e);
  process.exit(1);
});
