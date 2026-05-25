"use strict";

/*
 TRILLIONX GLOBAL STREAM FABRIC
 - applique le calcul par micro-paquets à tout TRILLIONX
 - ne charge jamais tout le repo en RAM
 - lit fichiers/scripts/json/js par chunks
 - produit des index/résultats compacts
 - mémoire reconnue = fenêtre chaude
 - fichiers = mémoire froide
 - REAL_ONLY_OR_UNAVAILABLE
*/

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "runtime_state/global_stream");

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
function gb(x){ return +(x/1024/1024/1024).toFixed(3); }
function mb(x){ return +(x/1024/1024).toFixed(3); }

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

function sha(buf){
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function walk(dir, limit=5000){
  const out=[];
  const stack=[dir];

  while(stack.length && out.length<limit){
    const d=stack.pop();
    let items=[];
    try{ items=fs.readdirSync(d,{withFileTypes:true}); }catch{ continue; }

    for(const it of items){
      const p=path.join(d,it.name);

      if(p.includes("/.git/")) continue;
      if(p.includes("/node_modules/")) continue;
      if(p.includes("/.npm-cache/")) continue;
      if(p.includes("/_TRILLIONX_SAFE_BACKUPS/")) continue;

      if(it.isDirectory()){
        stack.push(p);
      } else if(it.isFile()){
        if(/\.(js|json|sh|txt|md|html|css|yml|yaml|env|config)$/i.test(p)){
          out.push(p);
          if(out.length>=limit) break;
        }
      }
    }
  }

  return out;
}

function streamFile(file, opts={}){
  const chunkKB=opts.chunk_kb||16;
  const maxChunks=opts.max_chunks||512;
  const chunkSize=chunkKB*1024;

  if(!fs.existsSync(file)){
    return {ok:false,file,reason:"UNAVAILABLE"};
  }

  const st=fs.statSync(file);
  const fd=fs.openSync(file,"r");

  let offset=0;
  let chunks=0;
  let bytes=0;
  const rolling=crypto.createHash("sha256");

  try{
    while(offset<st.size && chunks<maxChunks){
      const size=Math.min(chunkSize,st.size-offset);
      const buf=Buffer.alloc(size);

      fs.readSync(fd,buf,0,size,offset);

      rolling.update(sha(buf));
      offset+=size;
      bytes+=size;
      chunks++;
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    ok:true,
    file,
    relative:path.relative(ROOT,file),
    file_size_mb:mb(st.size),
    processed_mb:mb(bytes),
    chunk_kb:chunkKB,
    chunks_processed:chunks,
    truncated:offset<st.size,
    rolling_hash:rolling.digest("hex")
  };
}

function classify(file){
  const f=file.toLowerCase();
  if(f.endsWith("app.js")) return "APP_MAIN";
  if(f.endsWith(".js")) return "JAVASCRIPT";
  if(f.endsWith(".json")) return "JSON_REGISTRY";
  if(f.endsWith(".sh")) return "SCRIPT";
  if(f.endsWith(".html")) return "UI_HTML";
  if(f.includes("memory")) return "MEMORY";
  if(f.includes("network")) return "NETWORK";
  if(f.includes("crypto")) return "CRYPTO";
  if(f.includes("bench")) return "BENCH";
  if(f.includes("runtime")) return "RUNTIME";
  if(f.includes("report")) return "REPORT";
  return "OTHER";
}

function scanAll(opts={}){
  ensure(OUT_DIR);

  const files=walk(ROOT, opts.file_limit || 3000);
  const results=[];
  const families={};

  for(const f of files){
    const fam=classify(f);
    families[fam]=(families[fam]||0)+1;

    const r=streamFile(f,{
      chunk_kb:opts.chunk_kb||16,
      max_chunks:opts.max_chunks||256
    });

    r.family=fam;
    results.push(r);
  }

  const summary={
    ok:true,
    module:"TRILLIONX_GLOBAL_STREAM_FABRIC",
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    principle:"all TRILLIONX handled by micro-packets, recognized RAM window, compact results",
    no_full_load:true,
    physical_512gb_claim:false,
    virtual_mirror:"logical indexed mirror only",
    time:new Date().toISOString(),
    root:ROOT,
    real_memory:realMemory(),
    scanned_files:files.length,
    families,
    totals:{
      processed_mb:+results.reduce((a,b)=>a+(b.processed_mb||0),0).toFixed(3),
      truncated_files:results.filter(x=>x.truncated).length
    }
  };

  fs.writeFileSync(
    path.join(OUT_DIR,"global_stream_summary.json"),
    JSON.stringify(summary,null,2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR,"global_stream_index.json"),
    JSON.stringify(results.slice(0,1000),null,2)
  );

  return {summary, sample:results.slice(0,40)};
}

module.exports={realMemory,walk,streamFile,scanAll};

if(require.main===module){
  console.log(JSON.stringify(scanAll({file_limit:3000,chunk_kb:16,max_chunks:256}),null,2));
}
