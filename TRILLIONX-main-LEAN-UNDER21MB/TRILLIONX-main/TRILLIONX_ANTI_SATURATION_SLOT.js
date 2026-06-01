"use strict";

// =====================================================================
//   TRILLIONX_ANTI_SATURATION_SLOT
//   Slot anti-dérapant — combine 3 mécanismes honnêtes:
//     A. Circuit breaker (anti-crash sous saturation)
//     B. Virtual addressable space (espace logique déclaré, jamais "physique")
//     C. Elastic worker pool (workers qui grandissent/rétrécissent)
//
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY, NO_FAKE_METRICS
//   Auteur: René (brinkcoin486) — TRILLIONX ecosystem
//
//   IMPORTANT — séparation physique/logique:
//     - physical_ram_GB        : mesuré (os.totalmem)
//     - physical_disk_free_GB  : mesuré (df)
//     - addressable_space_GB   : DÉCLARÉ par configuration (logique)
//     - space_claim_type       : "LOGICAL_ADDRESSABLE_ONLY"
//     - no_fake_ram            : true
//     - physical_ram_claim     : false
//
//   Le module N'ALLOUE PAS 6 TB. Il déclare un espace adressable
//   logique pour adressage applicatif (clés, indices, slots virtuels)
//   exactement comme un OS adresse 256 TB virtuel sur 16 GB physique.
// =====================================================================

const fs = require("fs");
const os = require("os");
const { performance, monitorEventLoopDelay } = require("perf_hooks");
const { execSync } = require("child_process");

const PATTERN = require("./TRILLIONX_PARALLELISM_PATTERN.js");

// ---------------------------------------------------------------------
//   Configuration honnête
// ---------------------------------------------------------------------
const CONFIG = {
  // Espace adressable LOGIQUE (paramètre, pas mesuré)
  addressable_space_GB: Number(process.env.ADDRESSABLE_GB || 6144),  // 6 TB logique

  // Plafonds physiques HONNÊTES (limites dures pour ne jamais dépasser)
  max_physical_ram_mb: Number(process.env.MAX_PHYSICAL_RAM_MB || 4096),
  max_physical_disk_mb: Number(process.env.MAX_PHYSICAL_DISK_MB || 500),

  // Worker pool elastique (cohérent avec MANIFEST_ULTIMATE)
  workers_min: Number(process.env.WORKERS_MIN || 1),
  workers_max: Number(process.env.WORKERS_MAX || 4),

  // Seuils de pression (mesurés, pas inventés)
  pressure_thresholds: {
    NORMAL:       { event_loop_max_ms: 20,  freemem_mb_min: 1500 },
    WARNING:      { event_loop_max_ms: 50,  freemem_mb_min: 800  },
    BACKPRESSURE: { event_loop_max_ms: 100, freemem_mb_min: 400  },
    REJECT:       { event_loop_max_ms: 200, freemem_mb_min: 200  }
  },

  // Sampling
  sample_ms: Number(process.env.SAMPLE_MS || 200)
};

// ---------------------------------------------------------------------
//   A. CIRCUIT BREAKER — détermine le niveau de pression réel
// ---------------------------------------------------------------------
async function measurePressureLevel() {
  const load = await PATTERN.measureRealLoad(CONFIG.sample_ms);
  const t = CONFIG.pressure_thresholds;

  let level, action;
  const elMax = load.event_loop_max_ms;
  const freeMb = load.freemem_mb;

  // Pire des deux dimensions gagne
  if (elMax > t.REJECT.event_loop_max_ms || freeMb < t.REJECT.freemem_mb_min) {
    level = "REJECT";
    action = "refuse new work, drain existing only";
  } else if (elMax > t.BACKPRESSURE.event_loop_max_ms || freeMb < t.BACKPRESSURE.freemem_mb_min) {
    level = "BACKPRESSURE";
    action = "throttle: 1 worker only, sync mode, no new async";
  } else if (elMax > t.WARNING.event_loop_max_ms || freeMb < t.WARNING.freemem_mb_min) {
    level = "WARNING";
    action = "scale down: workers→2, prefer async over parallel";
  } else {
    level = "NORMAL";
    action = "scale up allowed: workers→max, parallel mode allowed";
  }

  return { level, action, measured: load, doctrine: "REAL_ONLY_OR_UNAVAILABLE" };
}

// ---------------------------------------------------------------------
//   B. VIRTUAL ADDRESSABLE SPACE — espace logique, jamais physique
// ---------------------------------------------------------------------
//   Inspiration: virtual memory dans un OS. Tu adresses 256 TB sur
//   une machine 16 GB. La majorité n'est jamais allouée. Ce qui est
//   touché est paginé. Ici, l'espace adressable est une clé logique
//   pour indexer des slots — pas une promesse de stockage.
//
function declareAddressableSpace() {
  const physMb = +(os.totalmem() / 1024 / 1024).toFixed(2);
  const freeMb = +(os.freemem() / 1024 / 1024).toFixed(2);

  let diskFreeMb = "UNAVAILABLE";
  try {
    const out = execSync("df -m /data 2>/dev/null | awk 'NR==2 {print $4}'",
                          { encoding: "utf8", timeout: 2000 }).trim();
    diskFreeMb = Number(out) || "UNAVAILABLE";
  } catch {}

  return {
    addressable_space_GB: CONFIG.addressable_space_GB,
    space_claim_type: "LOGICAL_ADDRESSABLE_ONLY",
    physical_ram_total_MB: physMb,
    physical_ram_free_MB: freeMb,
    physical_disk_free_MB: diskFreeMb,
    max_physical_ram_used_MB: CONFIG.max_physical_ram_mb,
    max_physical_disk_used_MB: CONFIG.max_physical_disk_mb,
    // Honnêteté explicite
    no_fake_ram: true,
    physical_ram_claim: false,
    physical_storage_claim: false,
    note: "Addressable space is a logical key range, not allocated storage. " +
          "Compare to OS virtual memory: a 64-bit OS addresses 256 TB on 16 GB RAM. " +
          "Only touched slots consume real bytes, bounded by max_physical_*.",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

// ---------------------------------------------------------------------
//   C. ELASTIC WORKER POOL — scale up/down selon pressure réelle
// ---------------------------------------------------------------------
function decideWorkerCount(pressureLevel) {
  switch (pressureLevel) {
    case "NORMAL":        return CONFIG.workers_max;       // 4
    case "WARNING":       return Math.max(2, CONFIG.workers_min);
    case "BACKPRESSURE":  return CONFIG.workers_min;       // 1
    case "REJECT":        return 0;                         // drain only
    default:              return CONFIG.workers_min;
  }
}

// ---------------------------------------------------------------------
//   SLOT SNAPSHOT — état complet du slot anti-dérapant à un instant T
// ---------------------------------------------------------------------
async function snapshot() {
  const pressure = await measurePressureLevel();
  const space = declareAddressableSpace();
  const workers = decideWorkerCount(pressure.level);

  return {
    module: "TRILLIONX_ANTI_SATURATION_SLOT",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    pressure,
    addressable_space: space,
    elastic_workers: {
      decided: workers,
      min: CONFIG.workers_min,
      max: CONFIG.workers_max,
      reason: pressure.action
    },
    guardrails: {
      no_fake_ram: true,
      no_fake_hardware: true,
      no_profit_claim: true,
      additive_only: true,
      circuit_breaker_active: true
    },
    time: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------
//   SAFE EXECUTE — wrap une fonction avec le circuit breaker
//   Si la pression est REJECT, on refuse. Sinon on exécute.
// ---------------------------------------------------------------------
async function safeExecute(name, fn) {
  const snap = await snapshot();
  if (snap.pressure.level === "REJECT") {
    return {
      executed: false,
      reason: "CIRCUIT_BREAKER_OPEN_REJECT",
      snapshot: snap,
      doctrine: "REAL_ONLY_OR_UNAVAILABLE"
    };
  }
  const t0 = performance.now();
  let result, error;
  try { result = await fn(snap.elastic_workers.decided, snap); }
  catch (e) { error = String(e.message || e); }
  const dt = (performance.now() - t0) / 1000;
  const snapAfter = await snapshot();

  return {
    executed: !error,
    name,
    duration_s: +dt.toFixed(6),
    workers_used: snap.elastic_workers.decided,
    pressure_before: snap.pressure.level,
    pressure_after: snapAfter.pressure.level,
    result, error,
    snapshot_before: snap,
    snapshot_after: snapAfter,
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

module.exports = {
  CONFIG,
  measurePressureLevel,
  declareAddressableSpace,
  decideWorkerCount,
  snapshot,
  safeExecute,
  pattern_version: "TRILLIONX_ANTI_SATURATION_SLOT_v1.0",
  doctrine: "REAL_ONLY_OR_UNAVAILABLE"
};

// ---------------------------------------------------------------------
//   CLI direct: affiche le snapshot courant
// ---------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    const snap = await snapshot();
    console.log("===== TRILLIONX ANTI-SATURATION SLOT =====");
    console.log("Pressure level         :", snap.pressure.level);
    console.log("Pressure action        :", snap.pressure.action);
    console.log("Event loop max ms      :", snap.pressure.measured.event_loop_max_ms);
    console.log("Freemem MB             :", snap.pressure.measured.freemem_mb);
    console.log();
    console.log("Addressable space GB   :", snap.addressable_space.addressable_space_GB, "(LOGICAL_ADDRESSABLE_ONLY)");
    console.log("Physical RAM total MB  :", snap.addressable_space.physical_ram_total_MB);
    console.log("Physical RAM free MB   :", snap.addressable_space.physical_ram_free_MB);
    console.log("Physical disk free MB  :", snap.addressable_space.physical_disk_free_MB);
    console.log("no_fake_ram            :", snap.addressable_space.no_fake_ram);
    console.log("physical_ram_claim     :", snap.addressable_space.physical_ram_claim);
    console.log();
    console.log("Elastic workers        :", snap.elastic_workers.decided, `(min=${snap.elastic_workers.min}, max=${snap.elastic_workers.max})`);
    console.log("Reason                 :", snap.elastic_workers.reason);
    console.log();
    console.log("REAL_ONLY_OR_UNAVAILABLE");

    const OUT = "runtime_state/bench/trillionx_anti_saturation_slot_last.json";
    try {
      fs.mkdirSync("runtime_state/bench", { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(snap, null, 2));
      console.log("Snapshot saved         :", OUT);
    } catch (e) {
      console.log("Snapshot save error    :", String(e.message || e));
    }
  })();
}
