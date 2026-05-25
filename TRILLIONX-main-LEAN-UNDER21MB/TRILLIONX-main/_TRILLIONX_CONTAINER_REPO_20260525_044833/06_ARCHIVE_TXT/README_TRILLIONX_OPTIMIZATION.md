# TRILLIONX Optimisation Codespaces
Règles: REAL_ONLY_OR_UNAVAILABLE, SAFE_REPAIR_ONLY, NO_FAKE_METRICS, ADDITIVE_ONLY.

Démarrage: `bash scripts/start_safe.sh`
Debug: `bash scripts/start_inspect.sh`
Monitoring: `bash scripts/monitor_trillionx.sh`
Fix: `bash scripts/fix_common_issues.sh`

Variables: PORT=3000, TRILLIONX_MAX_WORKERS=2, TRILLIONX_MAX_PORT_PROCESSES=24, TRILLIONX_MEMORY_LIMIT_MB=4096.
CPU 278%: réduire workers. Load haut: réduire ports/process. ENOENT: dossiers/path.join. Mémoire: max-old-space + streams.
