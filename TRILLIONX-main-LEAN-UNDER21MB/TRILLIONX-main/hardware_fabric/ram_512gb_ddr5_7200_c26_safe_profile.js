"use strict";

const os = require("os");
const fs = require("fs");

const PROFILE_PATH = "config/trillionx_ram_512gb_ddr5_7200_c26_safe.json";

function gb(x){ return +(x/1024/1024/1024).toFixed(2); }

function loadProfile(){
  return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
}

function detectRealMemory(){
  const total = os.totalmem();
  const free = os.freemem();
  return {
    real_total_gb: gb(total),
    real_free_gb: gb(free),
    real_used_gb: gb(total-free),
    claim_512gb_real: total >= 500 * 1024 ** 3,
    source: "os.totalmem/os.freemem",
    host: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
}

function report(){
  const profile = loadProfile();
  const real = detectRealMemory();
  return {
    ok: true,
    module: "TRILLIONX_RAM_512GB_DDR5_7200_C26_SAFE_PROFILE",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    truth: real.claim_512gb_real
      ? "512GB_OR_MORE_DETECTED_ON_REAL_HOST"
      : "TARGET_PROFILE_ONLY_REAL_HOST_IS_SMALLER",
    target_profile: profile.target_memory,
    cache_system: profile.cache_system,
    real_detection: real,
    recommended_runtime: real.real_total_gb < 32
      ? "CODESPACES_SAFE_CACHE_256MB_WORKER_1"
      : "TARGET_PROFILE_CAN_SCALE_IF_REAL_RAM_AVAILABLE"
  };
}

module.exports = { report };

if (require.main === module) {
  console.log(JSON.stringify(report(), null, 2));
}
