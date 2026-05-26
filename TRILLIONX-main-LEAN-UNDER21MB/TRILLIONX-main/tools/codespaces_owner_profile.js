"use strict";

const os = require("os");
const fs = require("fs");
const cp = require("child_process");

function sh(cmd){
  try { return cp.execSync(cmd,{encoding:"utf8",timeout:4000}).trim(); }
  catch { return "UNAVAILABLE"; }
}

function gb(bytes){
  return +(bytes/1024/1024/1024).toFixed(3);
}

const total = os.totalmem();
const free = os.freemem();

const profile = {
  ok: true,
  module: "TRILLIONX_CODESPACES_OWNER_PROFILE",
  doctrine: "REAL_ONLY_OR_UNAVAILABLE",
  mode: "OWNER_CODESPACES_SAFE_STREAM",
  time: new Date().toISOString(),
  host: os.hostname(),
  cpu: {
    model: os.cpus()[0]?.model || "UNAVAILABLE",
    threads: os.cpus().length,
    arch: os.arch(),
    kernel: os.release()
  },
  memory_real: {
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    source: "os.totalmem/os.freemem"
  },
  disk_real: {
    workspaces: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
    repo: sh("du -sh . 2>/dev/null | awk '{print $1}'")
  },
  runtime: {
    port_3000: sh("ss -lntp | grep ':3000' || true"),
    node_processes: sh("ps aux | grep -E 'node|app.js|TRILLIONX' | grep -v grep | wc -l")
  },
  trillionx_policy: {
    structure_lock: true,
    no_delete: true,
    no_full_load: true,
    micro_packets: true,
    virtual_mirror_512gb: "logical_index_only_not_physical_claim",
    hot_memory: "recognized_real_ram_window",
    cold_memory: "files_scripts_indexes",
    result: "compact_runtime_state"
  },
  safe_limits_for_current_codespace: {
    chunk_kb: 8,
    max_workers: 1,
    max_parallel_jobs: 1,
    max_cache_mb: 256,
    output_limit_chars: 60000,
    heavy_bench_default: false
  }
};

fs.mkdirSync("runtime_state/codespaces_owner",{recursive:true});
fs.writeFileSync(
  "runtime_state/codespaces_owner/profile.json",
  JSON.stringify(profile,null,2)
);

console.log(JSON.stringify(profile,null,2));
