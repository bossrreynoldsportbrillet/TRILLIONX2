"use strict";

// =====================================================================
//   TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES
//   Routes additives pour le serveur fabric existant (port 3160)
//   N'écrase aucun endpoint — ajoute /api/memory-stress-{async|parallel|dynamic}
//
//   Doctrine: REAL_ONLY_OR_UNAVAILABLE, ADDITIVE_ONLY
// =====================================================================
//
// INTÉGRATION dans TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js
// ---------------------------------------------------------
// Avant la ligne `const server = http.createServer(...)`, ajouter:
//
//    const parallelRoutes = require("./TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES.js");
//    parallelRoutes.attach(FABRIC);
//
// Puis dans le handler HTTP (la fonction passée à createServer),
// avant la ligne `res.writeHead(404)`, ajouter:
//
//    if (await parallelRoutes.handle(req, res)) return;
//
// C'est tout. Les anciennes routes restent intactes.
// =====================================================================

const PATTERN = require("./TRILLIONX_PARALLELISM_PATTERN.js");

let _FABRIC = null;

function attach(fabricInstance) {
  _FABRIC = fabricInstance;
  if (typeof fabricInstance.stress !== "function") {
    throw new Error("TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES: FABRIC.stress not found");
  }
}

// ---------------------------------------------------------------------
//   stressAsync(N) — version non-bloquante de stress(N)
//   Réplique la même unité de travail (3 puts + 2 gets) mais cède
//   l'event-loop entre chaque round.
//   ATTENTION: dépend de l'API publique FABRIC.put/get
// ---------------------------------------------------------------------
async function stressAsync(N) {
  if (!_FABRIC) throw new Error("FABRIC not attached");
  const t0 = Date.now();
  let puts = 0, gets = 0;
  for (let i = 0; i < N; i++) {
    // mêmes opérations que stress() original — réplique fidèle
    const k1 = `stress_async_${i}_a`;
    const k2 = `stress_async_${i}_b`;
    const k3 = `stress_async_${i}_c`;
    _FABRIC.put(k1, { i, mode: "async", a: Math.sin(i) }); puts++;
    _FABRIC.put(k2, { i, b: Math.cos(i) }); puts++;
    _FABRIC.put(k3, { i, c: Math.tan(i) }); puts++;
    _FABRIC.get(k1); gets++;
    _FABRIC.get(k2); gets++;
    await new Promise(r => setImmediate(r));
  }
  const dt = (Date.now() - t0) / 1000;
  return {
    mode: "async",
    rounds: N,
    puts, gets,
    duration_s: +dt.toFixed(6),
    rounds_per_s: +(N / Math.max(dt, 1e-9)).toFixed(2),
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

// ---------------------------------------------------------------------
//   stressParallelLight(N, workers) — variante "concurrent" plutôt
//   que worker_threads (FABRIC est un état partagé in-process).
//   Si workers>1 on lance N rounds en mode Promise.all par batch.
// ---------------------------------------------------------------------
async function stressParallelLight(N, batchConcurrency = 4) {
  if (!_FABRIC) throw new Error("FABRIC not attached");
  const C = Math.max(1, Math.min(batchConcurrency, 8));
  const t0 = Date.now();
  let puts = 0, gets = 0;
  let i = 0;
  while (i < N) {
    const batch = [];
    for (let c = 0; c < C && i < N; c++, i++) {
      const idx = i;
      batch.push(Promise.resolve().then(() => {
        const k1 = `stress_par_${idx}_a`;
        const k2 = `stress_par_${idx}_b`;
        _FABRIC.put(k1, { i: idx, mode: "parallel", a: Math.sin(idx) }); puts++;
        _FABRIC.put(k2, { i: idx, b: Math.cos(idx) }); puts++;
        _FABRIC.put(`stress_par_${idx}_c`, { i: idx, c: Math.tan(idx) }); puts++;
        _FABRIC.get(k1); gets++;
        _FABRIC.get(k2); gets++;
      }));
    }
    await Promise.all(batch);
  }
  const dt = (Date.now() - t0) / 1000;
  return {
    mode: "parallel_light",
    rounds: N,
    puts, gets,
    batch_concurrency: C,
    duration_s: +dt.toFixed(6),
    rounds_per_s: +(N / Math.max(dt, 1e-9)).toFixed(2),
    note: "in-process Promise.all batches; not worker_threads (FABRIC is shared state)",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE"
  };
}

async function stressDynamic(N) {
  if (!_FABRIC) throw new Error("FABRIC not attached");
  const decision = await PATTERN.chooseDynamicMode(N);
  let result;
  if (decision.mode === "sync") {
    const t0 = Date.now();
    _FABRIC.stress(N);
    const dt = (Date.now() - t0) / 1000;
    result = {
      mode: "sync",
      rounds: N,
      duration_s: +dt.toFixed(6),
      rounds_per_s: +(N / Math.max(dt, 1e-9)).toFixed(2),
      doctrine: "REAL_ONLY_OR_UNAVAILABLE"
    };
  } else if (decision.mode === "async") {
    result = await stressAsync(N);
  } else {
    result = await stressParallelLight(N, 4);
  }
  result.dynamic_decision = decision;
  result.mode = `dynamic→${decision.mode}`;
  return result;
}

// ---------------------------------------------------------------------
//   handle(req, res) — handler additif. Retourne true si la route
//   a été traitée, false sinon.
// ---------------------------------------------------------------------
async function handle(req, res) {
  try {
    const url = req.url || "";

    if (url.startsWith("/api/memory-stress-async")) {
      const N = Number(new URL(url, "http://x").searchParams.get("n")) || 12;
      const out = await stressAsync(N);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out, null, 2));
      return true;
    }

    if (url.startsWith("/api/memory-stress-parallel")) {
      const u = new URL(url, "http://x");
      const N = Number(u.searchParams.get("n")) || 12;
      const W = Number(u.searchParams.get("workers")) || 4;
      const out = await stressParallelLight(N, W);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out, null, 2));
      return true;
    }

    if (url.startsWith("/api/memory-stress-dynamic")) {
      const N = Number(new URL(url, "http://x").searchParams.get("n")) || 12;
      const out = await stressDynamic(N);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out, null, 2));
      return true;
    }

    if (url.startsWith("/api/memory-stress-compare")) {
      const N = Number(new URL(url, "http://x").searchParams.get("n")) || 12;
      const t0 = Date.now();
      _FABRIC.stress(N);
      const syncDt = (Date.now() - t0) / 1000;
      const out = {
        module: "TRILLIONX_MEMORY_FABRIC_PARALLEL_COMPARE",
        doctrine: "REAL_ONLY_OR_UNAVAILABLE",
        rounds: N,
        sync: { duration_s: +syncDt.toFixed(6), rounds_per_s: +(N / Math.max(syncDt, 1e-9)).toFixed(2) },
        async: await stressAsync(N),
        parallel: await stressParallelLight(N, 4),
        dynamic: await stressDynamic(N),
        time: new Date().toISOString()
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out, null, 2));
      return true;
    }

    if (url === "/api/memory-stress-routes") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        module: "TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES",
        doctrine: "REAL_ONLY_OR_UNAVAILABLE",
        additive: true,
        routes: [
          "/api/memory-stress?n=N             (sync, original, unchanged)",
          "/api/memory-stress-async?n=N       (async, setImmediate yields)",
          "/api/memory-stress-parallel?n=N&workers=W  (Promise.all batches)",
          "/api/memory-stress-dynamic?n=N     (auto-choose mode from load)",
          "/api/memory-stress-compare?n=N     (run all 4 modes, return comparison)"
        ]
      }, null, 2));
      return true;
    }

    return false;
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e), doctrine: "REAL_ONLY_OR_UNAVAILABLE" }));
    return true;
  }
}

module.exports = { attach, handle, stressAsync, stressParallelLight, stressDynamic };
