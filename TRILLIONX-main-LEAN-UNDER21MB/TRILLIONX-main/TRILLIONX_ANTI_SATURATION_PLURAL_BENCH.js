"use strict";

// =====================================================================
//   TRILLIONX_ANTI_SATURATION_PLURAL_BENCH
//   "Bench pluriel" — exécute N snapshots successifs en injectant
//   une charge croissante, mesure comment le slot anti-dérapant
//   réagit en temps réel (pressure NORMAL → WARNING → BACKPRESSURE).
//
//   Différence vs un bench classique:
//   - un bench classique mesure UN run
//   - pluriel = mesure la TRAJECTOIRE sous charge variable
//
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY
// =====================================================================

const fs = require("fs");
const crypto = require("crypto");
const { performance } = require("perf_hooks");

const SLOT = require("./TRILLIONX_ANTI_SATURATION_SLOT.js");

const OUT_DIR = "runtime_state/bench";
const OUT_FILE = `${OUT_DIR}/trillionx_anti_saturation_plural_bench_last.json`;

const N_SAMPLES = Number(process.env.N_SAMPLES || 8);
const SAMPLE_INTERVAL_MS = Number(process.env.SAMPLE_INTERVAL_MS || 1000);

// Charge artificielle: génère du calcul réel (sha256 sur buffers)
// L'intensité monte du sample 0 au sample N-1, puis redescend.
function injectLoad(intensity) {
  // intensity 0..1 — ajuste la taille et le nombre de sha256
  const buffers = Math.max(1, Math.round(intensity * 200));
  const size = 4096 + Math.round(intensity * 16384);
  for (let i = 0; i < buffers; i++) {
    const b = crypto.randomBytes(size);
    crypto.createHash("sha256").update(b).digest("hex");
  }
}

function intensityCurve(i, N) {
  // Courbe en cloche: monte au milieu, descend ensuite
  const peak = (N - 1) / 2;
  const normalized = 1 - Math.abs(i - peak) / peak;
  return Math.max(0, Math.min(1, normalized));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("===== TRILLIONX ANTI-SATURATION PLURAL BENCH =====");
  console.log(`Samples           : ${N_SAMPLES}`);
  console.log(`Interval ms       : ${SAMPLE_INTERVAL_MS}`);
  console.log(`Addressable space : ${SLOT.CONFIG.addressable_space_GB} GB (LOGICAL)`);
  console.log(`Workers range     : ${SLOT.CONFIG.workers_min}..${SLOT.CONFIG.workers_max}`);
  console.log(`Doctrine          : REAL_ONLY_OR_UNAVAILABLE`);
  console.log();
  console.log("idx | intensity | level         | el_max_ms | freemem_mb | workers");
  console.log("----+-----------+---------------+-----------+------------+--------");

  const trajectory = [];
  const tStart = performance.now();

  for (let i = 0; i < N_SAMPLES; i++) {
    const intensity = intensityCurve(i, N_SAMPLES);
    const tLoad0 = performance.now();
    injectLoad(intensity);
    const loadDt = (performance.now() - tLoad0) / 1000;

    const snap = await SLOT.snapshot();

    const row = {
      idx: i,
      intensity: +intensity.toFixed(3),
      load_duration_s: +loadDt.toFixed(4),
      level: snap.pressure.level,
      event_loop_max_ms: snap.pressure.measured.event_loop_max_ms,
      event_loop_mean_ms: snap.pressure.measured.event_loop_mean_ms,
      freemem_mb: snap.pressure.measured.freemem_mb,
      rss_mb: snap.pressure.measured.rss_mb,
      workers_decided: snap.elastic_workers.decided,
      action: snap.pressure.action,
      time: new Date().toISOString()
    };
    trajectory.push(row);

    console.log(
      String(i).padStart(3) + " | " +
      row.intensity.toFixed(3) + "     | " +
      row.level.padEnd(13) + " | " +
      String(row.event_loop_max_ms).padStart(9) + " | " +
      String(row.freemem_mb).padStart(10) + " | " +
      String(row.workers_decided).padStart(7)
    );

    if (i < N_SAMPLES - 1) {
      await new Promise(r => setTimeout(r, SAMPLE_INTERVAL_MS));
    }
  }

  const wallClock = (performance.now() - tStart) / 1000;

  // Analyse de trajectoire
  const levels = trajectory.map(t => t.level);
  const uniqueLevels = [...new Set(levels)];
  const transitions = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] !== levels[i - 1]) {
      transitions.push({ from: levels[i - 1], to: levels[i], at_idx: i });
    }
  }

  const elMaxValues = trajectory.map(t => Number(t.event_loop_max_ms)).filter(Number.isFinite);
  const freememValues = trajectory.map(t => Number(t.freemem_mb)).filter(Number.isFinite);
  const workersValues = trajectory.map(t => t.workers_decided);

  const report = {
    module: "TRILLIONX_ANTI_SATURATION_PLURAL_BENCH",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    config: {
      n_samples: N_SAMPLES,
      sample_interval_ms: SAMPLE_INTERVAL_MS,
      addressable_space_GB: SLOT.CONFIG.addressable_space_GB,
      addressable_claim: "LOGICAL_ADDRESSABLE_ONLY",
      workers_min: SLOT.CONFIG.workers_min,
      workers_max: SLOT.CONFIG.workers_max
    },
    wall_clock_s: +wallClock.toFixed(4),
    trajectory,
    analysis: {
      levels_observed: uniqueLevels,
      transitions_count: transitions.length,
      transitions,
      event_loop_max_ms: {
        min: elMaxValues.length ? Math.min(...elMaxValues) : "UNAVAILABLE",
        max: elMaxValues.length ? Math.max(...elMaxValues) : "UNAVAILABLE",
        mean: elMaxValues.length ? +(elMaxValues.reduce((a,b)=>a+b,0) / elMaxValues.length).toFixed(3) : "UNAVAILABLE"
      },
      freemem_mb: {
        min: freememValues.length ? Math.min(...freememValues) : "UNAVAILABLE",
        max: freememValues.length ? Math.max(...freememValues) : "UNAVAILABLE"
      },
      workers_range: {
        min: Math.min(...workersValues),
        max: Math.max(...workersValues)
      },
      circuit_breaker_engaged: levels.includes("BACKPRESSURE") || levels.includes("REJECT"),
      adaptive_scaling_observed: new Set(workersValues).size > 1
    },
    verdict: {
      state: "ANTI_SATURATION_PLURAL_BENCH_OK",
      reading: "Trajectoire mesurée du slot anti-dérapant sous charge variable. " +
               "Les transitions de niveau et les changements de workers sont LE résultat."
    },
    guardrails: {
      no_fake_ram: true,
      no_fake_hardware: true,
      no_profit_claim: true,
      additive_only: true
    },
    time: new Date().toISOString()
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log();
  console.log("Wall clock total       :", report.wall_clock_s, "s");
  console.log("Levels observed        :", uniqueLevels.join(", "));
  console.log("Transitions count      :", transitions.length);
  console.log("Event loop max range   :", report.analysis.event_loop_max_ms.min, "..", report.analysis.event_loop_max_ms.max, "ms");
  console.log("Freemem range          :", report.analysis.freemem_mb.min, "..", report.analysis.freemem_mb.max, "MB");
  console.log("Workers range          :", report.analysis.workers_range.min, "..", report.analysis.workers_range.max);
  console.log("Circuit breaker fired  :", report.analysis.circuit_breaker_engaged ? "YES" : "NO");
  console.log("Adaptive scaling       :", report.analysis.adaptive_scaling_observed ? "YES" : "NO");
  console.log("Report                 :", OUT_FILE);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => { console.error("BENCH_ERROR", e.stack || e); process.exit(1); });
