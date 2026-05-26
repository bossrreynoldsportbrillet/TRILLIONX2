"use strict";

/*
 TRILLIONX PORT 3000 RUNTIME BRIDGE
 - Ne supprime rien
 - Ne déplace rien
 - Scanne les modules existants
 - Expose un état réel sur port 3000 via app.js si app.js l'utilise
 - Sinon sert de catalogue runtime importable
*/

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const ROOT = process.cwd();

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 8000 }).trim();
  } catch {
    return "UNAVAILABLE";
  }
}

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function scan() {
  const wanted = [
    "trillionx_network_boot.js",
    "trillionx_network_runtime.js",
    "trillionx_network_autodetect.js",
    "trillionx_cpu_power_detect.js",
    "trillionx_exascale_benchmark.js",
    "trillionx_exascale_run.js",
    "trillionx_advanced_exascale_micro_packets.js",
    "start_trillionx.sh",
    "runtime_allinone",
    "runtime_auto",
    "runtime_mesh",
    "runtime_state",
    "runtime_unified",
    "reports",
    "reports/runtime_master",
    "reports/scripts",
    "scripts",
    "supreme_hyperstack",
    "transcendence_overmind",
    "ultimate_stabilizer",
    "virtual_hardware",
    "wasm",
    "workers"
  ];

  const found = wanted.map(x => ({
    name: x,
    exists: exists(x),
    type: exists(x) ? (fs.statSync(path.join(ROOT, x)).isDirectory() ? "dir" : "file") : "missing"
  }));

  return {
    time: new Date().toISOString(),
    doctrine: "REAL_ONLY_OR_UNAVAILABLE / STRUCTURE_LOCK / NO_DELETE",
    port: process.env.PORT || "3000",
    root: ROOT,
    cpu: {
      model: os.cpus()[0]?.model || "UNAVAILABLE",
      threads: os.cpus().length,
      arch: os.arch(),
      kernel: os.release()
    },
    disk: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
    modules: found,
    git_status_count: sh("git status --short | wc -l")
  };
}

module.exports = {
  TRILLIONX_PORT3000_RUNTIME_BRIDGE: true,
  scan
};

if (require.main === module) {
  console.log(JSON.stringify(scan(), null, 2));
}
