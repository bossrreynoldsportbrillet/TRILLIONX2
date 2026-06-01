# TX3 TRILLIONS v1.4 - Idées d'évolution

## Constat v1.3 (bench du 30/05/2026)
- Throughput plafonné à ~26 req/s
- Latence stress(12) = ~38 ms (synchrone, bloque l'event-loop)
- Hit ratio 1.0 sur 477k gets
- 0 erreur sur 17k+ requêtes en stress test
- 1 seul cœur CPU utilisé (Node mono-thread)

## Pistes v1.4

### Piste A : setImmediate entre rounds (effort 2 lignes)
Dans stress(), ajouter `await new Promise(r => setImmediate(r))` 
entre chaque round pour yielder l'event-loop.
→ Gain estimé : ×2-3 sur concurrence HTTP

### Piste B : worker_threads pour le calcul (effort 100 lignes)
Déporter le calcul stress() dans des Worker threads.
Pool de 4 workers = 4 cœurs ARM utilisés.
→ Gain estimé : ×4-8 sur throughput total
→ Risque : sérialisation des payloads entre threads

### Piste C : cluster multi-process (effort 50 lignes)
Forker N process Node, load-balancer par le master.
Problème : chaque worker a sa propre FABRIC = état non partagé.
→ Convient si état stateless, sinon nécessite Redis/SharedArrayBuffer

## À garder absolument
- Auto-déclaration intègre (no_fake_physical_ram, etc.)
- Architecture 8 niveaux hot/warm/cold
- Endpoint /api/memory-stress compatible v1.3

## Bench de référence à reproduire après chaque modif
- node bench_client.js (10000 req, 10 concurrent)
- Cible v1.4 : > 100 req/s sans dégrader hit ratio
