"use strict";

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { performance, monitorEventLoopDelay } = require("perf_hooks");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/blockchain_micro_packet_last.json`;

const TX_PER_BLOCK = Number(process.env.TX_PER_BLOCK || 96);
const BLOCKS = Number(process.env.BLOCKS || 900);
const PAYLOAD_BYTES = Number(process.env.PAYLOAD_BYTES || 256);
const CHECKPOINT_EVERY = Number(process.env.CHECKPOINT_EVERY || 150);
const MAX_WRITE_MB = Number(process.env.MAX_WRITE_MB || 4);
const DIFFICULTY_PREFIX = process.env.DIFFICULTY_PREFIX || "00";

fs.mkdirSync(OUT_DIR, { recursive: true });

function mb(x){ return +(x / 1024 / 1024).toFixed(3); }
function gb(x){ return +(x / 1024 / 1024 / 1024).toFixed(3); }

function shas(x){
  return crypto.createHash("sha256").update(x).digest("hex");
}

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

function makeTx(blockIndex, txIndex){
  const payload = Buffer.allocUnsafe(PAYLOAD_BYTES);
  const seed = shas(`${blockIndex}:${txIndex}:${Date.now()}`);
  for(let i=0;i<PAYLOAD_BYTES;i++){
    payload[i] = seed.charCodeAt(i % seed.length) ^ ((blockIndex + txIndex + i) & 255);
  }
  const tx = {
    from: shas("from:"+blockIndex+":"+txIndex).slice(0,40),
    to: shas("to:"+blockIndex+":"+txIndex).slice(0,40),
    amount_u: (blockIndex * 997 + txIndex * 31) % 1000000,
    fee_u: (txIndex % 17) + 1,
    payload_hash: shas(payload)
  };
  const encoded = JSON.stringify(tx);
  return { tx, encoded, hash: shas(encoded), bytes: Buffer.byteLength(encoded) };
}

function merkleRoot(hashes){
  if(!hashes.length) return shas("EMPTY");
  let level = hashes.slice();
  while(level.length > 1){
    const next = [];
    for(let i=0;i<level.length;i+=2){
      const a = level[i];
      const b = level[i+1] || a;
      next.push(shas(a + b));
    }
    level = next;
  }
  return level[0];
}

function mineLight(headerBase){
  let nonce = 0;
  let hash = "";
  const maxNonce = 25000;
  do {
    hash = shas(headerBase + ":" + nonce);
    nonce++;
  } while(!hash.startsWith(DIFFICULTY_PREFIX) && nonce < maxNonce);
  return {
    nonce: nonce - 1,
    hash,
    found: hash.startsWith(DIFFICULTY_PREFIX),
    maxNonce
  };
}

async function main(){
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();

  const start = performance.now();
  const mem0 = process.memoryUsage();
  const scratch = `${OUT_DIR}/blockchain_micro_packet_scratch.ndjson`;
  try { fs.rmSync(scratch,{force:true}); } catch {}

  let totalTx = 0;
  let txBytes = 0;
  let blockBytes = 0;
  let jsonBytes = 0;
  let minedFound = 0;
  let checkpointBytes = 0;
  let chainTip = shas("GENESIS_TRILLIONX");
  const globalHash = crypto.createHash("sha256");

  for(let b=0;b<BLOCKS;b++){
    const txHashes = [];
    const txs = [];

    for(let t=0;t<TX_PER_BLOCK;t++){
      const item = makeTx(b,t);
      txHashes.push(item.hash);
      txs.push(item.tx);
      txBytes += item.bytes;
      totalTx++;
      globalHash.update(item.hash);
    }

    const root = merkleRoot(txHashes);
    const headerBase = `${b}:${chainTip}:${root}:${TX_PER_BLOCK}`;
    const mined = mineLight(headerBase);
    if(mined.found) minedFound++;

    const block = {
      height: b,
      prev: chainTip,
      merkle_root: root,
      tx_count: TX_PER_BLOCK,
      nonce: mined.nonce,
      hash: mined.hash,
      valid_light: mined.found,
      doctrine: "LOCAL_BENCH_NOT_REAL_CHAIN"
    };

    const encodedBlock = JSON.stringify(block);
    JSON.parse(encodedBlock);

    blockBytes += Buffer.byteLength(encodedBlock);
    jsonBytes += Buffer.byteLength(JSON.stringify({ block, sample_tx: txs[0] }));
    chainTip = mined.hash;
    globalHash.update(chainTip);

    if(b % CHECKPOINT_EVERY === 0 && checkpointBytes < MAX_WRITE_MB * 1024 * 1024){
      const line = JSON.stringify({ h:b, tip:chainTip, root, ok:mined.found }) + "\n";
      fs.appendFileSync(scratch, line);
      checkpointBytes += Buffer.byteLength(line);
    }
  }

  let scratchPeak = 0;
  try { scratchPeak = fs.statSync(scratch).size; fs.rmSync(scratch,{force:true}); } catch {}

  delay.disable();
  const duration = (performance.now() - start) / 1000;
  const mem1 = process.memoryUsage();

  const result = {
    module: "TRILLIONX_BLOCKCHAIN_MICRO_PACKET_BENCH",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    time: new Date().toISOString(),
    config: {
      blocks: BLOCKS,
      tx_per_block: TX_PER_BLOCK,
      payload_bytes: PAYLOAD_BYTES,
      difficulty_prefix: DIFFICULTY_PREFIX,
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
      blocks_s: +(BLOCKS/duration).toFixed(2),
      tx_total: totalTx,
      tx_s: +(totalTx/duration).toFixed(2),
      tx_MB: mb(txBytes),
      block_MB: mb(blockBytes),
      json_MB: mb(jsonBytes),
      mined_light_found: minedFound,
      mined_light_percent: +((minedFound/BLOCKS)*100).toFixed(2),
      checkpoint_MB: mb(checkpointBytes),
      scratch_peak_MB: mb(scratchPeak),
      event_loop_mean_ms: Number.isFinite(delay.mean) ? +(delay.mean/1e6).toFixed(4) : "UNAVAILABLE",
      event_loop_max_ms: Number.isFinite(delay.max) ? +(delay.max/1e6).toFixed(4) : "UNAVAILABLE",
      chain_tip: chainTip,
      checksum_sha256: globalHash.digest("hex")
    },
    memory_process: {
      rss_GB_start: gb(mem0.rss),
      rss_GB_end: gb(mem1.rss),
      heap_used_GB_end: gb(mem1.heapUsed)
    },
    disk_workspaces: disk(),
    interpretation: {
      blockchain_model: "local synthetic tx + merkle root + compact block + light nonce check",
      real_crypto_transaction: false,
      real_network_chain: false,
      mining_claim: false,
      result_scope: "current Codespaces host only"
    }
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result,null,2));

  console.log("===== TRILLIONX BLOCKCHAIN MICRO PACKET BENCH =====");
  console.log(`Blocks          : ${BLOCKS}`);
  console.log(`Tx/block        : ${TX_PER_BLOCK}`);
  console.log(`Total tx        : ${totalTx}`);
  console.log(`Duration        : ${result.metrics.duration_s} s`);
  console.log(`Blocks/s        : ${result.metrics.blocks_s}`);
  console.log(`Tx/s            : ${result.metrics.tx_s}`);
  console.log(`Light found     : ${minedFound}/${BLOCKS} (${result.metrics.mined_light_percent}%)`);
  console.log(`RSS end         : ${result.memory_process.rss_GB_end} GB`);
  console.log(`Disk            : ${JSON.stringify(result.disk_workspaces)}`);
  console.log(`Report          : ${OUT_FILE}`);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => {
  console.error("BENCH_ERROR", e && e.stack ? e.stack : e);
  process.exit(1);
});
