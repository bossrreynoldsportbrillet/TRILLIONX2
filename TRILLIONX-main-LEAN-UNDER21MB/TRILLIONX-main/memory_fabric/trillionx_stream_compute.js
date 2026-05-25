"use strict";

/*
 TRILLIONX STREAM COMPUTE
 - gros calcul par micro-paquets
 - RAM réelle = fenêtre chaude
 - fichier/index = mémoire froide
 - résultat compact = mémoire reconnue
 - aucun full-load massif
*/

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const os = require("os");

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, "runtime_state/stream_compute");

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
function mb(x){ return +(x/1024/1024).toFixed(3); }
function gb(x){ return +(x/1024/1024/1024).toFixed(3); }

function realMemory(){
  const total=os.totalmem();
  const free=os.freemem();
  return {
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    source: "os.totalmem/os.freemem"
  };
}

function hashChunk(buf){
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function streamComputeFile(file, opts={}){
  ensure(STATE_DIR);

  const chunkKB = opts.chunk_kb || 32;
  const chunkSize = chunkKB * 1024;
  const limitChunks = opts.limit_chunks || 2048;

  if (!fs.existsSync(file)) {
    return {
      ok:false,
      reason:"FILE_UNAVAILABLE",
      file
    };
  }

  const stat = fs.statSync(file);
  const fd = fs.openSync(file, "r");

  const summary = {
    ok:true,
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    mode:"STREAM_COMPUTE_MICRO_PACKETS",
    file,
    file_size_mb: mb(stat.size),
    chunk_kb: chunkKB,
    limit_chunks: limitChunks,
    chunks_processed:0,
    bytes_processed:0,
    rolling_hash:"",
    real_memory_before: realMemory(),
    no_full_load:true,
    physical_512gb_claim:false,
    virtual_mirror_logic:"index_and_packet_window_only",
    started_at:new Date().toISOString()
  };

  let offset=0;
  let rolling=crypto.createHash("sha256");

  try {
    while(offset < stat.size && summary.chunks_processed < limitChunks){
      const size = Math.min(chunkSize, stat.size-offset);
      const buf = Buffer.alloc(size);

      fs.readSync(fd, buf, 0, size, offset);

      const h = hashChunk(buf);
      rolling.update(h);

      summary.chunks_processed++;
      summary.bytes_processed += size;
      offset += size;
    }
  } finally {
    fs.closeSync(fd);
  }

  summary.rolling_hash = rolling.digest("hex");
  summary.processed_mb = mb(summary.bytes_processed);
  summary.real_memory_after = realMemory();
  summary.finished_at = new Date().toISOString();

  const out = path.join(STATE_DIR, "last_stream_compute_result.json");
  fs.writeFileSync(out, JSON.stringify(summary,null,2));

  return summary;
}

function streamComputeBuffer(label, bytes=65536){
  ensure(STATE_DIR);

  const buf = Buffer.alloc(bytes, 7);
  const h = hashChunk(buf);

  const result = {
    ok:true,
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    mode:"STREAM_COMPUTE_BUFFER_PACKET",
    label,
    packet_bytes:bytes,
    packet_kb:+(bytes/1024).toFixed(3),
    hash:h,
    real_memory:realMemory(),
    no_full_load:true,
    time:new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(STATE_DIR, "last_packet_result.json"),
    JSON.stringify(result,null,2)
  );

  return result;
}

module.exports = {
  realMemory,
  streamComputeFile,
  streamComputeBuffer
};

if (require.main === module) {
  const target = process.argv[2] || "app.js";
  console.log(JSON.stringify(streamComputeFile(target,{chunk_kb:32,limit_chunks:2048}),null,2));
}
