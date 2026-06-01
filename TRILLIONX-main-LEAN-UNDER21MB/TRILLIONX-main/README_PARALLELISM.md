# TRILLIONX_PARALLELISM_PATTERN — v1.0

**Doctrine :** `REAL_ONLY_OR_UNAVAILABLE` · `ADDITIVE_ONLY` · `NO_FAKE_METRICS` · `SAFE_REPAIR_ONLY`

Ajoute multi-parallélisme synchrone + asynchrone + dynamique à TRILLIONX,
sans toucher à un seul fichier existant.

---

## Les 5 fichiers livrés

| Fichier | Rôle |
|---|---|
| `TRILLIONX_PARALLELISM_PATTERN.js` | Module commun : `measureRealLoad`, `runAsync`, `runParallel`, `chooseDynamicMode` |
| `TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js` | Wrapper VR Mirror : 4 modes |
| `TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js` | Wrapper Heavy Packet : 4 modes |
| `TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES.js` | Routes HTTP additives pour le fabric |
| `TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js` | Lance les 3 en parallèle |

---

## Architecture des 4 couches

```
COUCHE 0  SYNC      ← existant, INTOUCHÉ
COUCHE 1  ASYNC     ← setImmediate yields, non-bloquant
COUCHE 2  PARALLEL  ← worker_threads natifs, max 4 workers
COUCHE 3  DYNAMIC   ← choisit selon event-loop / RAM / loadavg
```

Chaque couche existe en parallèle des autres. Aucune ne remplace.

---

## Déploiement sur ton tel (Termux)

```bash
cd $HOME/TX3_TRILLIONS_v1.3_COCKPIT/TX3

# Copier les 5 fichiers ici (par GitHub.dev, scp, ou termux-storage)
# Vérifier:
ls -la TRILLIONX_PARALLELISM_PATTERN.js
ls -la TRILLIONX_*_PARALLEL*.js
ls -la TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js
```

---

## Tests unitaires (sans toucher au fabric en prod)

```bash
# VR Mirror — les 4 modes comparés
node TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js compare

# Heavy Packet — les 4 modes comparés
node TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js compare

# Orchestrateur 3-en-1 (sans fabric)
node TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js --skip-fabric --mode=dynamic
```

Chaque commande écrit son rapport JSON dans `runtime_state/bench/`.

---

## Intégration des routes parallèles dans le fabric

Le fabric (`TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js`) est un serveur HTTP
sur port 3160. Les routes parallèles s'**ajoutent** sans modifier les anciennes.

### Étape 1 : backup (déjà fait)

```bash
ls TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js.bak-20260530-1630
# Le .bak créé lors de la session précédente est ton filet de sécurité
```

### Étape 2 : 2 lignes à ajouter au fabric

Ouvre `TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js`. Tu cherches deux endroits :

**A. Avant `const server = http.createServer(...)` (vers ligne ~245) :**

```javascript
const parallelRoutes = require("./TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES.js");
parallelRoutes.attach(FABRIC);
```

**B. Dans le handler, AVANT le `404` final :**

```javascript
// ... routes existantes restent INTOUCHÉES ...

// AJOUT (avant le 404):
if (await parallelRoutes.handle(req, res)) return;

res.writeHead(404);
res.end("not found");
```

⚠️ Le handler doit être `async` pour `await`. Si c'est déjà `function(req,res)`,
change en `async function(req,res)`. C'est la seule modif.

### Étape 3 : redémarrer le fabric

```bash
# Tuer l'ancien process (récupérer le PID)
ps aux | grep TRILLIONX_MEMORY_FABRIC | grep -v grep
# kill <PID>

# Relancer
node TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js &
```

### Étape 4 : tester les nouvelles routes

```bash
# Lister les routes parallèles disponibles
curl -s http://127.0.0.1:3160/api/memory-stress-routes | head -20

# Sync (original, inchangé) — référence
time curl -s "http://127.0.0.1:3160/api/memory-stress" > /dev/null

# Async
time curl -s "http://127.0.0.1:3160/api/memory-stress-async?n=12"

# Parallel (4 workers concurrents)
time curl -s "http://127.0.0.1:3160/api/memory-stress-parallel?n=12&workers=4"

# Dynamic (auto-choisi)
time curl -s "http://127.0.0.1:3160/api/memory-stress-dynamic?n=12"

# Compare (les 4 modes dans la même réponse)
curl -s "http://127.0.0.1:3160/api/memory-stress-compare?n=12" | head -40
```

---

## Limites honnêtes (REAL_ONLY_OR_UNAVAILABLE)

### Limite 1 : digest parallèle ≠ digest séquentiel

Sur VR Mirror, la chaîne de digest est séquentielle par construction
(`digest_i = sha(digest_{i-1} + h_i)`). En mode parallel, chaque worker
calcule son propre digest sur sa chunk. Donc :

- `digest(sync) == digest(async)` ✅ (preuve d'équivalence)
- `digest(parallel) != digest(sync)` ⚠️ (par nature, pas un bug)

Le rapport JSON expose chaque digest worker dans `worker_breakdown` pour
audit. C'est une propriété mathématique, pas une métrique fausse.

### Limite 2 : JIT V8 warmup

Sur certaines runs courts, le 2e mode mesuré peut paraître plus rapide
que le 1er parce que V8 a JIT-compilé le code pendant le 1er. Sur les
runs longs (>2s), l'effet disparaît. Sur `compare`, regarder les ratios
plutôt que les absolus.

### Limite 3 : Fabric stress en mode parallel

Le fabric (`FABRIC.put/get`) est un **état partagé in-process** (Map JS).
On ne peut PAS le donner à worker_threads car le state ne traverse pas
la frontière entre threads sans `SharedArrayBuffer`. Donc la couche
`parallel` du fabric utilise `Promise.all` avec batches concurrents
(c'est noté `parallel_light` dans la réponse JSON). C'est de la
concurrence asynchrone, pas du vrai parallélisme noyau. Pour le vrai
parallélisme noyau du fabric, il faudrait refactor en `SharedArrayBuffer`
— gros chantier, pas dans ce patch.

Pour VR Mirror et Heavy Packet, c'est du **vrai** worker_threads natif.

### Limite 4 : `max_workers: 4`

Cohérent avec `MANIFEST_ULTIMATE.guards.max_workers: 4`. Plafond dur dans
`PATTERN.MAX_WORKERS_GUARD = 4`. Au-delà, ignoré silencieusement.

---

## Fichiers de rapport générés

Tous dans `runtime_state/bench/`, ne remplacent aucun rapport existant :

```
trillionx_vr_mirror_parallel_sync_last.json
trillionx_vr_mirror_parallel_async_last.json
trillionx_vr_mirror_parallel_parallel_last.json
trillionx_vr_mirror_parallel_dynamic_last.json
trillionx_vr_mirror_parallel_compare_last.json

trillionx_heavy_packet_parallel_sync_last.json
trillionx_heavy_packet_parallel_async_last.json
trillionx_heavy_packet_parallel_parallel_last.json
trillionx_heavy_packet_parallel_dynamic_last.json
trillionx_heavy_packet_parallel_compare_last.json

trillionx_triple_parallel_orchestrator_last.json
```

Les rapports `trillionx_vr_mirror_bench_last.json` et
`heavy_micro_packet_last.json` originaux ne sont JAMAIS touchés.

---

## Rollback (si quelque chose te déplaît)

```bash
# Ces fichiers sont 100% additifs. Pour les enlever :
rm TRILLIONX_PARALLELISM_PATTERN.js
rm TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js
rm TRILLIONX_HEAVY_MICRO_PACKET_BENCH_PARALLEL.js
rm TRILLIONX_MEMORY_FABRIC_PARALLEL_ROUTES.js
rm TRILLIONX_TRIPLE_PARALLEL_ORCHESTRATOR.js

# Et restaurer le fabric depuis backup (si tu as ajouté les 2 lignes) :
cp TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js.bak-20260530-1630 TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js
```

---

## Résultats attendus sur ton Moto g75 5G (8 cores)

D'après le bench v1.3 cockpit, baseline VR Mirror = 70 901 ops/s (sync).

Projection raisonnable selon ce qu'on a mesuré sur sandbox :

| Mode | Estimation Moto g75 | Note |
|---|---|---|
| sync | 70 901 ops/s | référence existante |
| async | ~70 000 ops/s | yield faible coût, neutre |
| parallel (4 workers) | 150 000-250 000 ops/s | gain réel sur 8 cores |
| dynamic | adaptatif | choisira `parallel` si RAM libre > 1.5 GB |

**Important** : c'est une *projection*. Le bench réel sur ton tel donnera
les vraies valeurs. C'est exactement le point : mesurer, pas inventer.

---

## Si tu veux étendre à d'autres modules TRILLIONX

Le pattern est conçu pour être copié. Pour chaque nouveau bench :

1. Identifier la fonction `doRound(i, state)` (unité de travail)
2. Identifier le `state` (mutable, agrégat stateless)
3. Copier la structure de `TRILLIONX_VR_MIRROR_BENCH_PARALLEL.js`
4. Adapter `freshState()` et `finalize()` aux métriques propres au module
5. Le worker_threads entry point est *identique* (même squelette)

Module à appliquer en priorité après ce premier déploiement :
- `TRILLIONX_BLOCKCHAIN_MICRO_PACKET_BENCH`
- `TRILLIONX_DUAL_MICRO_PACKET_BENCH`
- `TRILLIONX_ONLY_MINING_10Y_MICRO_PACKET_BENCH`

---

**Garanties signées dans le code :**
- ✅ `doctrine: "REAL_ONLY_OR_UNAVAILABLE"` dans chaque output JSON
- ✅ `no_fake_metrics: true` dans le pattern
- ✅ `additive_only: true` dans le pattern
- ✅ Aucune route existante du fabric n'est modifiée
- ✅ Aucun bench original n'est exécuté ou remplacé
- ✅ MAX_WORKERS plafonné à 4 (cohérent avec MANIFEST_ULTIMATE)
- ✅ Mesures réelles (event-loop, RAM, loadavg) pour le mode dynamic
- ✅ Aucun `btc_claim`, `profit_claim`, `pool_claim`, `wallet_action`

— René / brinkcoin486 / TRILLIONX ecosystem
