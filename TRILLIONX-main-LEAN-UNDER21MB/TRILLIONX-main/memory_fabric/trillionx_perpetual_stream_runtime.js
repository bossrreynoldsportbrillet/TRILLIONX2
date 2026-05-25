"use strict";

/*
 TRILLIONX PERPETUAL STREAM RUNTIME
 - Tout TRILLIONX en micro-paquets
 - Quelques Ko en RAM reconnue
 - Fichiers/scripts = mémoire froide active
 - Résultats compacts
 - Pas de full-load massif
 - REAL_ONLY_OR_UNAVAILABLE
*/

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "runtime_state/perpetual_stream");
const MAX_FILES = 250;
const CHUNK_KB = 8;
const MAX_CHUNKS_PER_FILE = 64;
const LOOP_MS = 15000;

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
function gb(x){ return +(x/1024/1024/1024).toFixed(3); }
function mb(x){ return +(x/1024/1024).toFixed(3); }

function sh(cmd, timeout=4000){
  try { return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim(); }
  catch { return "UNAVAILABLE"; }
}

function realMemory(){
  const total = os.totalmem();
  const free = os.freemem();
  return {
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    source: "os.totalmem/os.freemem"
  };
}

function disk(){
  return {
    workspaces: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
    repo_size: sh("du -sh . 2>/dev/null | awk '{print $1}'")
  };
}

function sha(buf){
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function classify(file){
  const f=file.toLowerCase();
  if(f.endsWith("app.js")) return "APP_MAIN";
  if(f.includes("memory")) return "MEMORY";
  if(f.includes("network")) return "NETWORK";
  if(f.includes("crypto")) return "CRYPTO";
  if(f.includes("bench")) return "BENCH";
  if(f.includes("runtime")) return "RUNTIME";
  if(f.includes("report")) return "REPORT";
  if(f.endsWith(".json")) return "JSON";
  if(f.endsWith(".js")) return "JS";
  if(f.endsWith(".sh")) return "SCRIPT";
  return "OTHER";
}

function listFiles(){
  const cmd = `find . -type f \\( -name "*.js" -o -name "*.json" -o -name "*.sh" -o -name "*.md" -o -name "*.txt" \\) \
-not -path "./node_modules/*" \
-not -path "./.git/*" \
-not -path "./_TRILLIONX_SAFE_BACKUPS/*" \
-not -path "./runtime_state/perpetual_stream/*" \
| sort | head -${MAX_FILES}`;

  const raw = sh(cmd, 8000);
  if(raw === "UNAVAILABLE" || !raw) return [];
  return raw.split(/\n/).filter(Boolean);
}

function streamFile(file){
  if(!fs.existsSync(file)) return { ok:false, file, reason:"UNAVAILABLE" };

  const st = fs.statSync(file);
  const fd = fs.openSync(file,"r");
  const chunkSize = CHUNK_KB * 1024;
  const rolling = crypto.createHash("sha256");

  let offset = 0;
  let chunks = 0;
  let bytes = 0;

  try {
    while(offset < st.size && chunks < MAX_CHUNKS_PER_FILE){
      const size = Math.min(chunkSize, st.size-offset);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, offset);
      rolling.update(sha(buf));
      offset += size;
      bytes += size;
      chunks++;
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    ok:true,
    file,
    family:classify(file),
    size_mb:mb(st.size),
    processed_kb:+(bytes/1024).toFixed(3),
    chunk_kb:CHUNK_KB,
    chunks,
    truncated:offset < st.size,
    hash:rolling.digest("hex")
  };
}

function scanCycle(){
  ensure(OUT);

  const files = listFiles();
  const results = [];
  const families = {};

  for(const f of files){
    const r = streamFile(f);
    results.push(r);
    families[r.family] = (families[r.family] || 0) + 1;
  }

  const summary = {
    ok:true,
    module:"TRILLIONX_PERPETUAL_STREAM_RUNTIME",
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    mode:"PERPETUAL_MICRO_PACKET_LOOP",
    principle:"few KB in recognized RAM, files/scripts as cold memory, compact result back to runtime_state",
    time:new Date().toISOString(),
    root:ROOT,
    real_memory:realMemory(),
    disk:disk(),
    files_scanned:files.length,
    families,
    limits:{
      max_files:MAX_FILES,
      chunk_kb:CHUNK_KB,
      max_chunks_per_file:MAX_CHUNKS_PER_FILE,
      loop_ms:LOOP_MS
    },
    no_full_load:true,
    physical_512gb_claim:false,
    virtual_mirror:"logical indexed mirror only"
  };

  fs.writeFileSync(path.join(OUT,"last_summary.json"), JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(OUT,"last_index.json"), JSON.stringify(results.slice(0,250),null,2));

  return {summary, sample:results.slice(0,20)};
}

function startLoop(){
  const first = scanCycle();
  console.log(JSON.stringify(first.summary,null,2));

  setInterval(()=>{
    const r = scanCycle();
    console.log("[TRILLIONX_PERPETUAL_STREAM]", new Date().toISOString(), "files=", r.summary.files_scanned, "mem_free_gb=", r.summary.real_memory.free_gb);
  }, LOOP_MS);
}

module.exports = { scanCycle, startLoop };

if(require.main === module){
  if(process.argv.includes("--loop")) startLoop();
  else console.log(JSON.stringify(scanCycle(),null,2));
}
