"use strict";

/*
 TRILLIONX GENERAL FABRIC SURGEON
 - RAID60+ logique indexé
 - CPU / coprocesseur / SIMD / crypto flags réels
 - mémoire reconnue + miroir logique
 - réseau réel ou unavailable
 - micro-paquets partout
 - aucun full-load
 - aucun delete
 - REAL_ONLY_OR_UNAVAILABLE
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const dns = require("dns");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "runtime_state/fabric_general");

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
function sh(cmd, timeout=6000){
  try { return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim(); }
  catch { return "UNAVAILABLE"; }
}
function gb(x){ return +(x/1024/1024/1024).toFixed(3); }
function mb(x){ return +(x/1024/1024).toFixed(3); }
function sha(x){ return crypto.createHash("sha256").update(x).digest("hex"); }

function cpuDetect(){
  const flagsRaw = sh("grep -m1 '^flags' /proc/cpuinfo || true");
  const has = f => new RegExp("\\b"+f+"\\b").test(flagsRaw);

  return {
    source: "lscpu + /proc/cpuinfo",
    model: os.cpus()[0]?.model || "UNAVAILABLE",
    threads: os.cpus().length,
    arch: os.arch(),
    kernel: os.release(),
    lscpu_summary: sh("lscpu | grep -E 'Model name|CPU\\(s\\)|Thread|Core|Socket|MHz|cache|Virtualization|Hypervisor' || true"),
    flags: {
      sse: has("sse"),
      sse2: has("sse2"),
      ssse3: has("ssse3"),
      sse4_1: has("sse4_1"),
      sse4_2: has("sse4_2"),
      avx: has("avx"),
      avx2: has("avx2"),
      avx512f: has("avx512f"),
      aes_ni: has("aes"),
      sha_ni: has("sha_ni") || has("sha"),
      fma: has("fma"),
      bmi1: has("bmi1"),
      bmi2: has("bmi2"),
      pclmulqdq: has("pclmulqdq"),
      vaes: has("vaes"),
      vpclmulqdq: has("vpclmulqdq")
    }
  };
}

function memoryDetect(){
  const total = os.totalmem();
  const free = os.freemem();
  return {
    source: "os.totalmem/os.freemem + free -m",
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    free_m_output: sh("free -m"),
    mirror_policy: {
      mode: "VIRTUAL_MIRROR_OF_RECOGNIZED_MEMORY",
      logical_capacity_gb: 512,
      physical_512gb_claim: false,
      hot_window_mb: 256,
      packet_kb_default: 8,
      no_full_load: true
    }
  };
}

function raid60PlusIndex(){
  const stripes = 12;
  const parity = 2;
  const mirrors = 4;
  const blocks = [];

  for(let s=0; s<stripes; s++){
    for(let p=0; p<parity; p++){
      for(let m=0; m<mirrors; m++){
        const id = `R60P_S${String(s).padStart(2,"0")}_P${p}_M${m}`;
        blocks.push({
          id,
          stripe: s,
          parity_group: p,
          mirror: m,
          mode: "LOGICAL_INDEX_ONLY",
          allocated_bytes: 0,
          checksum_seed: sha(id).slice(0,32),
          physical_raid_claim: false
        });
      }
    }
  }

  return {
    mode: "RAID60_PLUS_LOGICAL_FABRIC",
    doctrine: "index/parity/mirror metadata only unless real devices exist",
    physical_raid_claim: false,
    stripes,
    parity_groups_per_stripe: parity,
    mirrors,
    blocks_count: blocks.length,
    blocks
  };
}

function coprocessorMap(cpu){
  const families = [
    { id:"COPROC_CONTROL", role:"scheduler, watchdog, safety", weight:1 },
    { id:"COPROC_CRYPTO", role:"sha256, sha512, aes, hmac", weight: cpu.flags.aes_ni ? 2 : 1 },
    { id:"COPROC_SIMD", role:"sse, avx, avx2, avx512 vector paths", weight: cpu.flags.avx512f ? 3 : cpu.flags.avx2 ? 2 : 1 },
    { id:"COPROC_MEMORY", role:"mirror ram, cache, packet streaming", weight:2 },
    { id:"COPROC_NETWORK", role:"ports, dns, sockets, latency", weight:1 },
    { id:"COPROC_STORAGE", role:"raid60+, mirror, spill, index", weight:1 },
    { id:"COPROC_API", role:"routes, json, registry, catalog", weight:1 },
    { id:"COPROC_SOLVER", role:"bounded compute, result synthesis", weight:1 }
  ];

  return {
    mode: "SOFTWARE_COPROCESSOR_FAMILIES",
    physical_coprocessor_claim: false,
    families,
    total_weight: families.reduce((a,b)=>a+b.weight,0)
  };
}

function networkDetect(){
  return {
    source: "ip/ss/dns",
    hostname: os.hostname(),
    interfaces: os.networkInterfaces(),
    ip_brief: sh("ip -br addr || true"),
    routes: sh("ip route || true"),
    dns_resolve_conf: sh("cat /etc/resolv.conf 2>/dev/null | head -20 || true"),
    ports_trillionx: sh("ss -lntp | grep -E ':3000|:2222|:9229|:20000|:21000|:22000|:23000|:24000|:25000|:26000' || true"),
    github_dns_ms: "PENDING"
  };
}

function classifyFile(f){
  const x = f.toLowerCase();
  if(x.endsWith("app.js")) return "APP_MAIN";
  if(x.includes("raid")) return "RAID_STORAGE";
  if(x.includes("memory") || x.includes("ram") || x.includes("cache")) return "MEMORY_CACHE";
  if(x.includes("network") || x.includes("socket") || x.includes("port")) return "NETWORK";
  if(x.includes("crypto") || x.includes("sha") || x.includes("btc")) return "CRYPTO";
  if(x.includes("bench") || x.includes("flops")) return "BENCH";
  if(x.includes("processor") || x.includes("cpu") || x.includes("coproc")) return "PROCESSOR";
  if(x.includes("runtime") || x.includes("kernel") || x.includes("fabric")) return "RUNTIME";
  if(x.endsWith(".json")) return "JSON_REGISTRY";
  if(x.endsWith(".js")) return "JS_MODULE";
  if(x.endsWith(".sh")) return "SCRIPT";
  return "OTHER";
}

function streamRepoIndex(){
  const raw = sh(`find . -type f \\( -name "*.js" -o -name "*.json" -o -name "*.sh" -o -name "*.md" -o -name "*.txt" \\) \
-not -path "./node_modules/*" \
-not -path "./.git/*" \
-not -path "./_TRILLIONX_SAFE_BACKUPS/*" \
| sort | head -500`, 10000);

  const files = raw === "UNAVAILABLE" || !raw ? [] : raw.split(/\n/).filter(Boolean);
  const families = {};
  const sample = [];

  for(const f of files){
    const fam = classifyFile(f);
    families[fam] = (families[fam] || 0) + 1;

    let size = 0;
    try { size = fs.statSync(f).size; } catch {}

    const fd = fs.existsSync(f) ? fs.openSync(f,"r") : null;
    let packetHash = "UNAVAILABLE";

    if(fd){
      try{
        const buf = Buffer.alloc(Math.min(8192,size));
        fs.readSync(fd,buf,0,buf.length,0);
        packetHash = sha(buf);
      } catch {}
      try { fs.closeSync(fd); } catch {}
    }

    sample.push({
      file:f,
      family:fam,
      size_mb:mb(size),
      packet_kb:8,
      packet_hash:packetHash
    });
  }

  return {
    mode: "MICRO_PACKET_REPO_INDEX",
    files_seen: files.length,
    families,
    sample: sample.slice(0,120),
    no_full_load: true
  };
}

function cryptoPulse(){
  const start = Date.now();
  let c = 0;
  while(Date.now() - start < 250){
    crypto.createHash("sha256").update("TRILLIONX_GENERAL"+Math.random()).digest("hex");
    c++;
  }
  return {
    mode: "BOUNDED_SHA256_PULSE",
    duration_ms: 250,
    estimated_hps: Math.round(c * 4),
    physical_hashrate_claim: false
  };
}

function buildReport(){
  ensure(OUT);

  const cpu = cpuDetect();
  const mem = memoryDetect();
  const raid = raid60PlusIndex();
  const coproc = coprocessorMap(cpu);
  const net = networkDetect();
  const repo = streamRepoIndex();
  const crypto = cryptoPulse();

  const report = {
    ok: true,
    module: "TRILLIONX_GENERAL_FABRIC_SURGEON",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    structure_lock: true,
    no_delete: true,
    no_full_load: true,
    time: new Date().toISOString(),

    processor: cpu,
    coprocessor: coproc,
    memory: mem,
    raid60_plus: raid,
    network: net,
    repo_stream_index: repo,
    crypto_pulse: crypto,

    global_policy: {
      big_compute: "micro_packets_only",
      recognized_ram: "hot_window",
      scripts_files: "cold_active_memory",
      result: "compact_runtime_state",
      mirror_512gb: "logical_address_space_indexed",
      physical_512gb_claim: false,
      physical_raid_claim: false,
      safe_workers_default: 1
    }
  };

  fs.writeFileSync(path.join(OUT,"general_fabric_report.json"), JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(OUT,"general_fabric_summary.json"), JSON.stringify({
    ok: report.ok,
    time: report.time,
    cpu_model: cpu.model,
    cpu_threads: cpu.threads,
    ram_total_gb: mem.total_gb,
    ram_free_gb: mem.free_gb,
    raid60_blocks: raid.blocks_count,
    coprocessor_families: coproc.families.length,
    repo_files_seen: repo.files_seen,
    network_ports: net.ports_trillionx,
    doctrine: report.doctrine
  },null,2));

  return report;
}

module.exports = { buildReport };

if(require.main === module){
  const report = buildReport();
  console.log(JSON.stringify({
    ok: report.ok,
    module: report.module,
    doctrine: report.doctrine,
    processor: {
      model: report.processor.model,
      threads: report.processor.threads,
      flags: report.processor.flags
    },
    memory: {
      total_gb: report.memory.total_gb,
      free_gb: report.memory.free_gb,
      mirror_policy: report.memory.mirror_policy
    },
    raid60_plus: {
      mode: report.raid60_plus.mode,
      blocks_count: report.raid60_plus.blocks_count,
      physical_raid_claim: report.raid60_plus.physical_raid_claim
    },
    coprocessor: report.coprocessor,
    network: {
      hostname: report.network.hostname,
      ports_trillionx: report.network.ports_trillionx
    },
    repo_stream_index: {
      files_seen: report.repo_stream_index.files_seen,
      families: report.repo_stream_index.families
    },
    global_policy: report.global_policy
  },null,2));
}
