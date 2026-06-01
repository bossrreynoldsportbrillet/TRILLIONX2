"use strict";

// =====================================================================
//   TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR
//   Lance VR_MIRROR + HEAVY_PACKET + FABRIC_STRESS dans le même run,
//   en parallèle, mesure la co-existence (comme TX3_PALIER2).
//
//   Différence vs PALIER2:
//   - Chacun s'exécute en mode "dynamic" (auto-choisi)
//   - Agrégat unifié + rapport JSON unique
//   - Mesure event-loop pendant l'exécution
//
//   Usage:
//     node TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js
//     node TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js --mode=parallel
//     node TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js --skip-fabric
// =====================================================================

const fs = require("fs");
const http = require("http");
const path = require("path");
const { performance, monitorEventLoopDelay } = require("perf_hooks");
const { spawn } = require("child_process");

const OUT_DIR = "runtime_state/bench";
const FABRIC_HOST = process.env.FABRIC_HOST || "127.0.0.1";
const FABRIC_PORT = Number(process.env.FABRIC_PORT || 3160);

const args = process.argv.slice(2);
const mode = (args.find(a => a.startsWith("--mode=")) || "--mode=dynamic").split("=")[1];
const skipFabric = args.includes("--skip-fabric");

function runChild(scriptPath, scriptArgs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let stdout = "", stderr = "";
    const child = spawn("node", [scriptPath, ...scriptArgs], { cwd: process.cwd() });
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("close", code => {
      const dt = (performance.now() - t0) / 1000;
      resolve({
        script: path.basename(scriptPath),
        args: scriptArgs,
        exit_code: code,
        duration_s: +dt.toFixed(6),
        stdout_lines: stdout.split("\n").filter(Boolean).slice(-30),
        stderr_short: stderr.slice(0, 500)
      });
    });
    child.on("error", e => resolve({
      script: path.basename(scriptPath),
      args: scriptArgs,
      exit_code: -1,
      error: String(e.message || e)
    }));
  });
}

function fabricRequest(pathUrl) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.get({ host: FABRIC_HOST, port: FABRIC_PORT, path: pathUrl, timeout: 30000 }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        const dt = (performance.now() - t0) / 1000;
        try {
          resolve({ status: res.statusCode, duration_s: +dt.toFixed(6), body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, duration_s: +dt.toFixed(6), body_raw: body.slice(0, 500) });
        }
      });
    });
    req.on("error", e => resolve({ status: 0, error: String(e.message || e), duration_s: 0 }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", duration_s: 30 }); });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const monitor = monitorEventLoopDelay({ resolution: 10 });
  monitor.enable();
  const tStart = performance.now();

  console.log("===== TRILLIONX TRIPLE PARALLEL ORCHESTRATOR =====");
  console.log(`Mode      : ${mode}`);
  console.log(`Fabric    : ${skipFabric ? "SKIPPED" : `${FABRIC_HOST}:${FABRIC_PORT}`}`);
  console.log(`Doctrine  : REAL_ONLY_OR_UNAVAILABLE`);
  console.log(`Started   : ${new Date().toISOString()}`);
  console.log();

  // Cibles : tous lancés en parallèle réel via Promise.all
  const targets = [];

  // A — VR Mirror parallel
  targets.push({
    name: "VR_MIRROR",
    promise: runChild(path.resolve(__dirname, "TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js"), [mode])
  });

  // B — Heavy micro packet parallel
  targets.push({
    name: "HEAVY_PACKET",
    promise: runChild(path.resolve(__dirname, "TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js"), [mode])
  });

  // C — Fabric stress via HTTP (si actif)
  if (!skipFabric) {
    targets.push({
      name: "FABRIC_STRESS",
      promise: fabricRequest(`/api/memory-stress-${mode === "compare" ? "compare" : mode}?n=24`)
    });
  }

  const results = {};
  const settled = await Promise.allSettled(targets.map(t => t.promise));
  targets.forEach((t, i) => {
    results[t.name] = settled[i].status === "fulfilled" ? settled[i].value : { error: String(settled[i].reason) };
  });

  monitor.disable();
  const wallClock = (performance.now() - tStart) / 1000;

  const report = {
    module: "TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    mode_requested: mode,
    fabric_skipped: skipFabric,
    wall_clock_s: +wallClock.toFixed(6),
    event_loop_during: {
      mean_ms: Number.isFinite(monitor.mean) ? +(monitor.mean / 1e6).toFixed(3) : "UNAVAILABLE",
      max_ms: Number.isFinite(monitor.max) ? +(monitor.max / 1e6).toFixed(3) : "UNAVAILABLE",
      p99_ms: Number.isFinite(monitor.percentile(99)) ? +(monitor.percentile(99) / 1e6).toFixed(3) : "UNAVAILABLE"
    },
    results,
    coexistence_verdict: {
      all_completed: Object.values(results).every(r => !r.error && (r.exit_code === 0 || r.status === 200)),
      modules_count: targets.length,
      reading: "TRILLIONX modules running in true wall-clock parallel; event-loop pressure measured live"
    },
    interpretation: {
      sync_baseline_reference: "TX3_PALIER2 wall-clock 5.16s (sync mode, no orchestrator)",
      this_run: `${wallClock.toFixed(2)}s wall-clock, mode=${mode}`,
      note: "compare ratios, not absolutes (depends on N and load at runtime)"
    },
    time: new Date().toISOString()
  };

  const file = `${OUT_DIR}/trillionx_triple_parallel_orchestrator_last.json`;
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  console.log("Wall clock total :", report.wall_clock_s, "s");
  console.log("Event loop mean  :", report.event_loop_during.mean_ms, "ms");
  console.log("Event loop max   :", report.event_loop_during.max_ms, "ms");
  console.log("Event loop p99   :", report.event_loop_during.p99_ms, "ms");
  console.log();
  for (const name of Object.keys(results)) {
    const r = results[name];
    if (r.error) console.log(`  ${name.padEnd(15)} : ERROR ${r.error}`);
    else if (r.exit_code !== undefined) console.log(`  ${name.padEnd(15)} : exit=${r.exit_code} duration=${r.duration_s}s`);
    else console.log(`  ${name.padEnd(15)} : http=${r.status} duration=${r.duration_s}s`);
  }
  console.log();
  console.log("All completed   :", report.coexistence_verdict.all_completed ? "YES" : "NO");
  console.log("Report          :", file);
  console.log("REAL_ONLY_OR_UNAVAILABLE");
}

main().catch(e => { console.error("ORCHESTRATOR_ERROR", e.stack || e); process.exit(1); });
