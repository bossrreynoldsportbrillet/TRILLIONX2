"use strict";

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/micro_packet_last.json`;

const PACKET_KB = Number(process.env.PACKET_KB || 8);
const PACKET_BYTES = PACKET_KB * 1024;
const ROUNDS = Number(process.env.ROUNDS || 25000);
const WRITE_EVERY = Number(process.env.WRITE_EVERY || 5000);
const MAX_WRITE_MB = Number(process.env.MAX_WRITE_MB || 4);

fs.mkdirSync(OUT_DIR, { recursive: true });

function gb(x){ return +(x / 1024 / 1024 / 1024).toFixed(3); }
function mb(x){ return +(x / 1024 / 1024).toFixed(3); }
function now(){ return performance.now(); }

function diskFreeWorkspaces(){
  try {
    const out = require("child_process")
      .execSync("df -BM /workspaces | awk 'NR==2 {gsub(\"M\", \"\", $2); gsub(\"M\", \"\", $3); gsub(\"M\", \"\", $4); print $2,$3,$4,$5}'", { encoding:"utf8" })
      .trim()
      .split(/\s+/);
    return { total_MB:+out[0], used_MB:+out[1], free_MB:+out[2], use_percent:out[3] };
  } catch {
    return "UNAVAILABLE";
  }
}

async function main(){
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();

  const startMem = process.memoryUsage();
  const start = now();

  let checksum = crypto.createHash("sha256");
  let xor = 0;
  let jsonBytes = 0;
  let ioBytes = 0;
  let cpuOps = 0;

  const scratch = `${OUT_DIR}/micro_packet_scratch.tmp`;
  try { fs.rmSync(scratch, { force:true }); } catch {}

  for (let i = 0; i < ROUNDS; i++) {
    const seed = Buffer.allocUnsafe(32);
    seed.writeBigUInt64LE(BigInt(i), 0);
    seed.writeBigUInt64LE(BigInt(Date.now() & 0xffffffff), 8);

    const packet = crypto.createHash("sha256").update(seed).digest();
    const block = Buffer.allocUnsafe(PACKET_BYTES);

    for (let j = 0; j < PACKET_BYTES; j++) {
      const v = packet[j & 31] ^ ((i + j) & 255);
      block[j] = v;
      xor ^= v;
    }

    checksum.update(block);
    cpuOps += PACKET_BYTES;

    const obj = {
      i,
      packet_kb: PACKET_KB,
      xor,
      sha16: crypto.createHash("sha256").update(block.subarray(0, Math.min(1024, block.length))).digest("hex").slice(0,16),
      real_only: true
    };
    const s = JSON.stringify(obj);
    jsonBytes += Buffer.byteLength(s);

    if (i % WRITE_EVERY === 0 && ioBytes < MAX_WRITE_MB * 1024 * 1024) {
      fs.appendFileSync(scratch, s + "\n");
      ioBytes += Buffer.byteLength(s) + 1;
    }
  }

  const end = now();
  h.disable();

  let scratchSize = 0;
  try { scratchSize = fs.statSync(scratch).size; fs.rmSync(scratch, { force:true }); } catch {}

  const duration_s = (end - start) / 1000;
  const result = {
    module: "TRILLIONX_MICRO_PACKET_BENCH",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    time: new Date().toISOString(),
    config: {
      packet_kb: PACKET_KB,
      rounds: ROUNDS,
      write_every: WRITE_EVERY,
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
      duration_s: +duration_s.toFixed(4),
      micro_packets_per_s: +(ROUNDS / duration_s).toFixed(2),
      packet_MB_processed: mb(ROUNDS * PACKET_BYTES),
      packet_MB_per_s: +((ROUNDS * PACKET_BYTES / 1024 / 1024) / duration_s).toFixed(2),
      cpu_byte_ops: cpuOps,
      json_MB_encoded: mb(jsonBytes),
      json_MB_per_s: +((jsonBytes / 1024 / 1024) / duration_s).toFixed(2),
      scratch_io_MB_written: mb(ioBytes),
      scratch_file_peak_MB: mb(scratchSize),
      event_loop_delay_ms_mean: +(h.mean / 1e6).toFixed(4),
      event_loop_delay_ms_max: +(h.max / 1e6).toFixed(4),
      checksum_sha256: checksum.digest("hex"),
      xor_final: xor >>> 0
    },
    memory_process: {
      rss_GB_start: gb(startMem.rss),
      rss_GB_end: gb(process.memoryUsage().rss),
      heap_used_GB_end: gb(process.memoryUsage().heapUsed)
    },
    disk_workspaces: diskFreeWorkspaces(),
    interpretation: {
      physical_ram_claim: false,
      fake_power_claim: false,
      gpu_claim: "UNAVAILABLE_UNLESS_DETECTED",
      meaning: "micro-packet real host benchmark; useful for TRILLIONX packet-cache/orchestration tuning"
    }
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

  console.log("===== TRILLIONX MICRO PACKET μ BENCH =====");
  console.log(`Packet        : ${PACKET_KB} KB`);
  console.log(`Rounds        : ${ROUNDS}`);
  console.log(`Duration      : ${result.metrics.duration_s} s`);
  console.log(`Packets/s     : ${result.metrics.micro_packets_per_s}`);
  console.log(`Throughput    : ${result.metrics.packet_MB_per_s} MB/s`);
  console.log(`JSON encode   : ${result.metrics.json_MB_per_s} MB/s`);
  console.log(`EventLoop mean: ${result.metrics.event_loop_delay_ms_mean} ms`);
  console.log(`EventLoop max : ${result.metrics.event_loop_delay_ms_max} ms`);
  console.log(`RSS end       : ${result.memory_process.rss_GB_end} GB`);
  console.log(`Disk          : ${JSON.stringify(result.disk_workspaces)}`);
  console.log(`Report        : ${OUT_FILE}`);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => {
  console.error("BENCH_ERROR", e && e.stack ? e.stack : e);
  process.exit(1);
});
