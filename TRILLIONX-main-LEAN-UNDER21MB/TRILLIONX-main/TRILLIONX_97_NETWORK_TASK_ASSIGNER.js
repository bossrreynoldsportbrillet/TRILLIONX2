"use strict";

/*
 TRILLIONX 97 NETWORK TASK ASSIGNER
 - Attribue 1 tâche à chacun des 97 réseaux/ports logiques
 - Lit les ports visibles depuis VS Code / data si disponibles
 - Complète automatiquement jusqu'à 97 réseaux
 - Safe only: aucune attaque, aucun scan agressif
 - Sortie: runtime_state + data + history ledger
*/

const fs=require("fs");
const os=require("os");
const net=require("net");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const DATA="data", RUNTIME="runtime_state", HIST="history";
fs.mkdirSync(DATA,{recursive:true});
fs.mkdirSync(RUNTIME,{recursive:true});
fs.mkdirSync(HIST,{recursive:true});

const OUT="data/TRILLIONX_97_NETWORK_TASK_ASSIGNMENTS_LATEST.json";
const QUEUE="runtime_state/TRILLIONX_97_NETWORK_TASK_QUEUE.json";
const LEDGER="history/TRILLIONX_97_NETWORK_TASK_LEDGER.jsonl";

const TIMEOUT=Number(process.argv[2]||650);

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

function readJSON(p,f=null){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return f}}
function saveJSON(p,o){fs.writeFileSync(p,JSON.stringify(o,null,2))}
function kv(k,v){console.log(String(k).padEnd(34," ")+": "+String(v))}
function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}

function host(){
 const cpus=os.cpus()||[];
 const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
 return {
  time:now(),
  hostname:os.hostname(),
  platform:os.platform(),
  arch:os.arch(),
  node:process.version,
  cpu:cpus[0]?.model||"unknown",
  logical_cpu:cpus.length,
  ghz:r((speeds.reduce((a,b)=>a+b,0)/(speeds.length||1))/1000),
  ram_total_gb:r(os.totalmem()/1073741824),
  ram_free_gb:r(os.freemem()/1073741824),
  load:os.loadavg().map(r)
 };
}

function tcpProbe(port){
 return new Promise(resolve=>{
  const t0=performance.now();
  const s=net.createConnection({host:"127.0.0.1",port});
  let done=false;
  const finish=o=>{
   if(done)return; done=true;
   try{s.destroy()}catch{}
   resolve({...o,port,ms:r(performance.now()-t0)});
  };
  s.setTimeout(TIMEOUT);
  s.on("connect",()=>finish({open:true,state:"OPEN"}));
  s.on("timeout",()=>finish({open:false,state:"TIMEOUT"}));
  s.on("error",e=>finish({open:false,state:"CLOSED",error:e.code||e.message}));
 });
}

function getKnownPorts(){
 const ports=new Set();

 const candidates=[
  "data/TRILLIONX_INTERNET_VECTOR_BLOCK_LATEST.json",
  "data/TRILLIONX_VECTOR_COMPACT_LATEST.json",
  "data/TRILLIONX_NETWORK_TASK_ORCHESTRATOR_LATEST.json"
 ];

 for(const f of candidates){
  const j=readJSON(f,{});
  const arrs=[
   j.summary?.open_ports,
   j.global?.open_ports,
   j.shards?.ports,
   j.host?.ports
  ];
  for(const a of arrs){
   if(Array.isArray(a)) for(const p of a) if(Number(p)>0) ports.add(Number(p));
  }
 }

 // Ports vus/fréquents dans ton TRILLIONX / Codespaces / réseau logique
 [
  2000,3000,3001,3002,3003,3004,3005,3010,3011,3012,3013,3014,3015,3016,3017,3018,3019,
  3030,3031,3032,3033,3040,3041,3042,3043,3050,3055,
  3099,3100,3101,3102,3103,3110,3111,3112,3113,3114,3115,3116,3117,3118,3119,
  3150,3160,3199,4000,4001,4200,4201,4202,5000,5001,5002,5003,5004,5005,
  6000,6001,6006,6007,6008,7000,7001,7002,7003,8000,8001,8080,8081,8082,8083,
  8084,8085,8443,8444,8888,8889,9000,9001,9002,9003,9090,9091,9092,9093,
  9229,9230,10000,10001,10080,11000,11001,12000,12001,12563,13005,15000,15001,16634,16635,19000,19001
 ].forEach(p=>ports.add(p));

 return [...ports].sort((a,b)=>a-b).slice(0,97);
}

const TASKS=[
 ["MAIN_APP_RUNTIME","Garder app.js vivant, mesurer uptime, réponse HTTP, logs critiques"],
 ["REMOTE_DEBUG_ATTACH","Surveiller attach Node/V8, heap snapshots safe, inspection non intrusive"],
 ["HEALTH_API","Tester /api/health, score OK/SLOW/FAIL, latence ms"],
 ["SYSTEM_API","Collecter CPU/RAM/disk/network réels, aucun faux chiffre"],
 ["VECTOR_MEMORY","Maintenir mémoire vectorielle compacte, delta scan, shard loading"],
 ["INTERNET_TARGETS","Tester URLs déclarées, statut 7/7, latence, bytes, cache"],
 ["ROUTE_REGISTRY","Indexer routes Express/API, dédoublonner, classer par priorité"],
 ["WEBSOCKET_EVENTS","Mapper événements WS, bruit, cadence, clients, backpressure"],
 ["CACHE_TTL_LRU","Servir cache court, éviter rescans, invalider par SHA256"],
 ["INTEGRITY_LEDGER","Sceller chaque résultat par hash chain append-only"],
 ["BTC_UTXO","Bench UTXO/Merkle, hashing double SHA256, rapport ops/s"],
 ["ETH_BLOCKS","Bench ETH-like SHA3/Keccak si disponible, gas/s indicatif local"],
 ["CRYPTO_AES","Mesurer AES-256 throughput réel local"],
 ["CRYPTO_SHA","Mesurer SHA256/HMAC/BLAKE2 throughput réel local"],
 ["JSON_API_LOAD","Tester charge JSON locale, p50/p95/p99"],
 ["NETWORK_LATENCY","Mesurer ping/connect latence, ports ouverts/fermés"],
 ["BANDWIDTH_STREAM","Mesurer stream mémoire/réseau local MB/s"],
 ["WORKER_POOL","Répartir jobs CPU contrôlés selon RAM/CPU pressure"],
 ["WASM_COMPUTE","Réserver tâches compute-heavy WebAssembly"],
 ["FIRMWARE_BRIDGE","Préparer futur firmware TRILLIONX sans exécution dangereuse"],
 ["SAFE_REPAIR","Réparer cache/log/index seulement, jamais destructif"],
 ["PORT_ROUTER","Router le trafic par port logique vers rôle dédié"],
 ["DASHBOARD","Publier métriques cockpit, visible mais non bloquant"],
 ["BENCHMARK_CORE","Lancer micro/macro benchmarks orchestrés"],
 ["AI_KERNEL","Acheminer demandes IA vers analyse/résumé/planification"],
 ["LLM_TOKEN_SIM","Simuler charge tokens et mémoire sans prétendre vrai LLM"],
 ["MEMORY_PRESSURE","Surveiller RSS/heap/free RAM, alerte si seuil haut"],
 ["RAID60_PLUS","Distribuer index/logs/shards en redondance logique"],
 ["VR_MIRROR","Synchroniser miroir VR logique, pas clone complet"],
 ["MESH_1X10","Répartir tâches entre 10 nœuds logiques TRILLIONX"],
 ["NODE_01","Orchestration locale noyau 1"],
 ["NODE_02","Orchestration locale noyau 2"],
 ["NODE_03","Orchestration locale noyau 3"],
 ["NODE_04","Orchestration locale noyau 4"],
 ["NODE_05","Orchestration locale noyau 5"],
 ["NODE_06","Orchestration locale noyau 6"],
 ["NODE_07","Orchestration locale noyau 7"],
 ["NODE_08","Orchestration locale noyau 8"],
 ["NODE_09","Orchestration locale noyau 9"],
 ["NODE_10","Orchestration locale noyau 10"],
 ["DNS_RESOLVE","Tester DNS public déclaré, timeout court"],
 ["HTTP_PUBLIC","Tester HTTP/HTTPS public autorisé"],
 ["GITHUB_API","Tester GitHub/API/repo reachability"],
 ["COINGECKO_API","Tester API crypto publique déclarée"],
 ["MEMPOOL_API","Tester mempool public déclaré"],
 ["BLOCKCHAIN_INFO","Tester endpoint latestblock public déclaré"],
 ["CLOUDFLARE_TRACE","Tester trace réseau public déclaré"],
 ["SECURITY_PREVIEW","Lister exposition sans secret, sans dump sensible"],
 ["PROCESS_TABLE","Lister process utiles, détecter zombies lourds"],
 ["LOG_ROTATION","Limiter logs, éviter saturation disque"],
 ["HISTORY_ARCHIVE","Ajouter historique compact JSONL"],
 ["DELTA_SCAN","Scanner seulement modifiés depuis dernier hash"],
 ["API_STRING_DEDUP","Compresser API strings massives"],
 ["ROUTE_HEALTH_MATRIX","Matrice santé endpoints/routes"],
 ["ANOMALY_DETECTOR","Détecter dérives RAM, latence, erreurs"],
 ["SMART_ROUTER","Choisir local/cache/internet selon health"],
 ["PRIORITY_JOBS","Prioriser jobs selon valeur et coût"],
 ["BACKPRESSURE","Limiter avalanche WS/HTTP"],
 ["RECONNECT","Reconnect contrôlé, jitter, backoff"],
 ["PACKET_MICRO","Mesurer micro-paquets et latence courte"],
 ["CODEC_HTTP","Codec HTTP/1.1 analyse"],
 ["CODEC_WS","Codec WebSocket analyse"],
 ["CODEC_JSON","Codec JSON parse/stringify"],
 ["CODEC_GZIP","Compression/décompression gzip si disponible"],
 ["CODEC_BASE64","Encodage/décodage base64"],
 ["IOT_MQTT_SLOT","Slot protocole MQTT si module présent"],
 ["IOT_COAP_SLOT","Slot protocole CoAP si module présent"],
 ["SATELLITE_SLOT","Slot satellite/edge déclaré, non simulé comme réel"],
 ["QUANTUM_SLOT","Slot quantum/external only, aucune fausse puissance"],
 ["GPU_SLOT","Détection GPU si disponible sinon unavailable"],
 ["SIMD_SLOT","Détection SIMD/native si module présent"],
 ["NATIVE_C_SLOT","Pont C/C++ natif si compilé"],
 ["PYTHON_SLOT","Pont Python si disponible"],
 ["SHELL_SAFE","Commandes shell safe allowlist"],
 ["PACKAGE_AUDIT","npm/package health sans correction destructive"],
 ["LAUNCH_JSON","Vérifier launch.json attach/runtime"],
 ["DEVCONTAINER","Vérifier ports/config Codespaces"],
 ["GIT_STATUS","Surveiller clean/dirty, commit prêt"],
 ["GIT_PUSH","Pousser seulement état stable validé"],
 ["LFS_GUARD","Détecter Git LFS hook absent et patcher safe"],
 ["DISK_SPACE","Surveiller df -h, nettoyage sûr"],
 ["TMP_CLEAN","Nettoyer /tmp TRILLIONX seulement"],
 ["SNAPSHOT_KEEP","Conserver snapshots importants"],
 ["BACKUP_APP","Backup app.js avant modification"],
 ["MODULE_REGISTRY","Registre modules actifs/inactifs"],
 ["PLUGIN_REGISTRY","Registre plugins et rôles"],
 ["CONTROLLER_REGISTRY","Registre contrôleurs"],
 ["FIRMWARE_REGISTRY","Registre firmware futur"],
 ["MEMORY_FABRIC","Fabrique mémoire cache/shard"],
 ["SHARED_VR_CACHE","Cache partagé miroir VR"],
 ["ORCHESTRATION_SCORE","Score global orchestration"],
 ["PERF_INTEGRITY_AI","Score performance/intégrité/intelligence"],
 ["REPORT_HTML","Rapport HTML local cockpit"],
 ["REPORT_JSON","Rapport JSON latest"],
 ["REPORT_LEDGER","Scellement rapport"],
 ["USER_VALIDATED_STABLE","Protéger base OKAY stable validée"],
 ["ADDITIVE_ONLY","Vérifier que tout ajout reste séparé"],
 ["FINAL_SENTINEL","Sentinelle de fin, résumé et verdict"]
];

function roleForPort(port,idx){
 const [name,desc]=TASKS[idx]||["NETWORK_"+(idx+1),"Tâche réseau logique"];
 return {
  index:idx+1,
  network_id:"TRILLIONX_NET_"+String(idx+1).padStart(2,"0"),
  port,
  role:name,
  task:desc,
  priority:
   idx<10?"CRITICAL":
   idx<30?"HIGH":
   idx<70?"NORMAL":"SUPPORT",
  mode:"SAFE_ONLY_REAL_OR_UNAVAILABLE",
  execution_policy:{
   no_intrusive_scan:true,
   no_bruteforce:true,
   no_fake_metric:true,
   additive_only:true,
   protect_stable_app:true
  }
 };
}

function appendLedger(report){
 let prev="GENESIS";
 try{
  const lines=fs.readFileSync(LEDGER,"utf8").trim().split(/\n/).filter(Boolean);
  if(lines.length) prev=JSON.parse(lines[lines.length-1]).hash;
 }catch{}
 const rec={ts:now(),type:"TRILLIONX_97_NETWORK_ASSIGNMENT",prev,payload_hash:sha(report)};
 rec.hash=sha(rec);
 fs.appendFileSync(LEDGER,JSON.stringify(rec)+"\n");
 return rec;
}

(async()=>{
 const t0=performance.now();
 title("TRILLIONX 97 NETWORK TASK ASSIGNER");

 const ports=getKnownPorts();
 while(ports.length<97) ports.push(20000+ports.length);

 const assignments=[];
 for(let i=0;i<97;i++){
  const a=roleForPort(ports[i],i);
  const probe=await tcpProbe(a.port);
  assignments.push({...a,health:probe.open?"OPEN":"RESERVED_OR_CLOSED",probe});
 }

 const open=assignments.filter(x=>x.health==="OPEN").length;
 const closed=assignments.length-open;

 const report={
  engine:"TRILLIONX_97_NETWORK_TASK_ASSIGNER",
  version:"V1",
  ts:now(),
  host:host(),
  policy:{
   exactly_97_networks:true,
   one_task_per_network:true,
   safe_only:true,
   real_or_unavailable:true,
   stable_base:"TRILLIONX_OKAY_STABLE_USER_VALIDATED",
   purpose:"attribuer une tâche à chacun des 97 réseaux pour orchestration"
  },
  summary:{
   networks:assignments.length,
   open,
   reserved_or_closed:closed,
   critical:TASKS.slice(0,10).length,
   high:TASKS.slice(10,30).length,
   normal:TASKS.slice(30,70).length,
   support:TASKS.slice(70,97).length,
   runtime_ms:r(performance.now()-t0)
  },
  assignments
 };

 report.seal=sha(report);
 const led=appendLedger(report);
 report.ledger_hash=led.hash;

 saveJSON(OUT,report);
 saveJSON(QUEUE,assignments.map(x=>({
  id:x.network_id,
  port:x.port,
  role:x.role,
  task:x.task,
  priority:x.priority,
  status:"QUEUED_FOR_ORCHESTRATION",
  health:x.health
 })));

 title("FINAL RESULT");
 kv("Networks assigned",report.summary.networks);
 kv("Open now",report.summary.open);
 kv("Reserved/closed",report.summary.reserved_or_closed);
 kv("Critical tasks",report.summary.critical);
 kv("High tasks",report.summary.high);
 kv("Normal tasks",report.summary.normal);
 kv("Support tasks",report.summary.support);
 kv("Seal",report.seal);
 kv("Ledger",report.ledger_hash);
 kv("Report",OUT);
 kv("Queue",QUEUE);

 title("TOP 20 ASSIGNMENTS");
 for(const a of assignments.slice(0,20)){
  console.log(`${a.network_id} | port ${String(a.port).padEnd(5)} | ${String(a.health).padEnd(18)} | ${a.role}`);
 }
})();
