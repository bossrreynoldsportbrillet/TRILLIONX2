"use strict";

/*
 TRILLIONX CHAT + THREADRIPPER PROFILE + PORT PROCESS BRIDGE
 - Fenêtre tchat web
 - API /api/trillionx/chat
 - WebSocket /chat
 - Threadripper = profil d’orchestration, pas faux hardware réel
 - Lit les processus/ports TRILLIONX si présents
 - Additif : peut être require() dans app.js
*/

const fs=require("fs");
const os=require("os");
const http=require("http");
const crypto=require("crypto");
const net=require("net");

const DATA="data", RUNTIME="runtime_state", HIST="history";
for(const d of [DATA,RUNTIME,HIST]) fs.mkdirSync(d,{recursive:true});

const CHAT_LOG="history/TRILLIONX_CHAT_LEDGER.jsonl";
const PORT_ASSIGN="data/TRILLIONX_97_NETWORK_TASK_ASSIGNMENTS_LATEST.json";
const PORT_SUP="data/TRILLIONX_97_PORT_PROCESS_SUPERVISOR_LATEST.json";

const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const now=()=>new Date().toISOString();
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

function readJSON(p,f=null){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return f}}
function appendLedger(type,payload){
  let prev="GENESIS";
  try{
    const lines=fs.readFileSync(CHAT_LOG,"utf8").trim().split(/\n/).filter(Boolean);
    if(lines.length) prev=JSON.parse(lines[lines.length-1]).hash;
  }catch{}
  const rec={ts:now(),type,prev,payload_hash:sha(payload),payload};
  rec.hash=sha(rec);
  fs.appendFileSync(CHAT_LOG,JSON.stringify(rec)+"\n");
  return rec;
}

function realHost(){
  const cpus=os.cpus()||[];
  const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
  return {
    real_cpu_model:cpus[0]?.model||"unknown",
    logical_cpu:cpus.length,
    real_ghz:r((speeds.reduce((a,b)=>a+b,0)/(speeds.length||1))/1000),
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    ram_total_gb:r(os.totalmem()/1073741824),
    ram_free_gb:r(os.freemem()/1073741824),
    load:os.loadavg().map(r)
  };
}

function threadripperProfile(){
  return {
    name:"TRILLIONX_THREADRIPPER_ORCHESTRATION_PROFILE",
    status:"TARGET_PROFILE_NOT_REAL_HOST_CLAIM",
    target_cpu:"Threadripper-class orchestration profile",
    target_mode:"many-core scheduler / port-process routing / cache-fabric",
    policy:"REAL_CPU remains auto-detected; profile is planning and UI layer",
    lanes:[
      "chat_router",
      "port_process_supervisor",
      "network_task_assigner",
      "vector_memory",
      "integrity_ledger",
      "benchmark_dispatch",
      "safe_repair"
    ]
  };
}

function portState(){
  const assign=readJSON(PORT_ASSIGN,{assignments:[]});
  const sup=readJSON(PORT_SUP,{assignments:[],summary:{}});
  const assignments=Array.isArray(assign.assignments)?assign.assignments:[];
  return {
    assignment_file_exists:fs.existsSync(PORT_ASSIGN),
    supervisor_file_exists:fs.existsSync(PORT_SUP),
    assigned_networks:assignments.length,
    supervisor_summary:sup.summary||null,
    sample:assignments.slice(0,12).map(a=>({
      id:a.network_id,
      port:a.port,
      role:a.role,
      health:a.health,
      priority:a.priority
    }))
  };
}

function detectIntent(msg){
  const m=String(msg||"").toLowerCase();
  if(m.includes("port")||m.includes("réseau")||m.includes("process")) return "PORT_PROCESS_STATUS";
  if(m.includes("threadripper")||m.includes("cpu")||m.includes("processeur")) return "THREADRIPPER_PROFILE";
  if(m.includes("mémoire")||m.includes("ram")||m.includes("cache")) return "MEMORY_STATUS";
  if(m.includes("internet")||m.includes("connect")) return "INTERNET_STATUS";
  if(m.includes("bench")||m.includes("score")) return "BENCHMARK_STATUS";
  return "GENERAL_TRILLIONX_CHAT";
}

function answer(message){
  const intent=detectIntent(message);
  const host=realHost();
  const profile=threadripperProfile();
  const ports=portState();

  let reply="";
  if(intent==="PORT_PROCESS_STATUS"){
    reply=[
      "TRILLIONX PORT PROCESS STATUS:",
      `- réseaux assignés: ${ports.assigned_networks}`,
      `- fichier superviseur: ${ports.supervisor_file_exists ? "présent" : "absent"}`,
      "- lecture: les ports doivent être pilotés par superviseur, pas seulement listés.",
      "- action recommandée: lancer TRILLIONX_97_PORT_PROCESS_SUPERVISOR.js start 24 puis 48 puis 97 si stable."
    ].join("\n");
  } else if(intent==="THREADRIPPER_PROFILE"){
    reply=[
      "THREADRIPPER PROFILE:",
      "- possible comme profil d’orchestration TRILLIONX.",
      "- pas comme fausse détection matérielle dans Codespaces.",
      `- CPU réel détecté: ${host.real_cpu_model}`,
      `- logical CPU réel: ${host.logical_cpu}`,
      `- GHz réel détecté: ${host.real_ghz}`,
      "- rôle: scheduler many-core, réseau par processus, cache fabric, ledger."
    ].join("\n");
  } else if(intent==="MEMORY_STATUS"){
    reply=[
      "MEMORY / CACHE STATUS:",
      `- RAM totale réelle: ${host.ram_total_gb} GB`,
      `- RAM libre réelle: ${host.ram_free_gb} GB`,
      "- pour décupler: compact vector memory + delta scan + shared cache + shards.",
      "- HBM/HAM peut rester profil cible, pas faux hardware réel."
    ].join("\n");
  } else if(intent==="INTERNET_STATUS"){
    reply=[
      "INTERNET STATUS:",
      "- TRILLIONX utilise targets déclarées + ports locaux + mémoire vectorielle.",
      "- règle: declared targets only, no aggressive scan.",
      "- vérifie data/trillionx_internet_targets.txt et le score Targets OK."
    ].join("\n");
  } else if(intent==="BENCHMARK_STATUS"){
    reply=[
      "BENCHMARK STATUS:",
      "- lancer les benches séparés, puis router les résultats au chat.",
      "- gagnant algo et score doivent venir des JSON latest, pas d’affichage inventé.",
      "- le chat sert de cockpit, pas de faux calcul."
    ].join("\n");
  } else {
    reply=[
      "TRILLIONX CHAT READY.",
      "Je peux lire: CPU réel, profil Threadripper, ports/processus, mémoire, Internet vectoriel, benchmarks.",
      "Demande par exemple: statut ports, statut Threadripper, statut mémoire, statut Internet, statut benchmark."
    ].join("\n");
  }

  const payload={message,intent,reply,host,threadripper_profile:profile,ports};
  const led=appendLedger("CHAT_MESSAGE",payload);
  return {...payload,ledger_hash:led.hash};
}

function html(){
return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TRILLIONX Chat Threadripper Ports</title>
<style>
body{margin:0;background:#020807;color:#00ff88;font-family:monospace}
.wrap{display:grid;grid-template-columns:1fr 360px;height:100vh}
.main{padding:16px;display:flex;flex-direction:column}
.side{border-left:1px solid #00552d;padding:16px;background:#03120d;overflow:auto}
h1{font-size:20px;margin:0 0 12px;color:#33ffaa}
#log{flex:1;border:1px solid #008844;padding:12px;overflow:auto;white-space:pre-wrap;background:#000}
.row{display:flex;gap:8px;margin-top:10px}
input{flex:1;background:#001a10;color:#00ff88;border:1px solid #00aa55;padding:10px;font-family:monospace}
button{background:#001f12;color:#00ff88;border:1px solid #00aa55;padding:10px;font-family:monospace}
.card{border:1px solid #006b3a;padding:10px;margin:8px 0}
.small{font-size:12px;color:#77ffc0}
</style>
</head>
<body>
<div class="wrap">
  <div class="main">
    <h1>TRILLIONX CHAT WINDOW — THREADRIPPER PROFILE + PORT PROCESS</h1>
    <div id="log">TRILLIONX chat prêt. Écris: statut ports, statut Threadripper, statut mémoire, statut Internet.</div>
    <div class="row">
      <input id="msg" placeholder="Parle à TRILLIONX..." autofocus>
      <button onclick="send()">ENVOYER</button>
    </div>
  </div>
  <div class="side">
    <h1>STATUS</h1>
    <div class="card" id="status">loading...</div>
    <button onclick="refresh()">REFRESH</button>
  </div>
</div>
<script>
async function api(path, body){
  const r=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  return await r.json();
}
async function send(){
  const el=document.getElementById('msg');
  const msg=el.value.trim(); if(!msg)return;
  el.value='';
  const log=document.getElementById('log');
  log.textContent += "\\n\\n> "+msg;
  const j=await api('/api/trillionx/chat',{message:msg});
  log.textContent += "\\n"+j.reply+"\\nledger="+j.ledger_hash;
  log.scrollTop=log.scrollHeight;
  refresh();
}
async function refresh(){
  const j=await api('/api/trillionx/status');
  document.getElementById('status').textContent=JSON.stringify({
    cpu:j.host.real_cpu_model,
    logical_cpu:j.host.logical_cpu,
    ghz:j.host.real_ghz,
    ram_free_gb:j.host.ram_free_gb,
    assigned_networks:j.ports.assigned_networks,
    supervisor:j.ports.supervisor_file_exists,
    profile:j.threadripper_profile.status
  },null,2);
}
document.getElementById('msg').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
refresh();
</script>
</body>
</html>`;
}

function install(app, server){
  if(!app) throw new Error("Express app required");

  app.get("/trillionx-chat",(req,res)=>{
    res.setHeader("content-type","text/html; charset=utf-8");
    res.end(html());
  });

  app.get("/api/trillionx/status",(req,res)=>{
    res.json({
      ok:true,
      engine:"TRILLIONX_CHAT_THREADRIPPER_PORTS_MODULE",
      host:realHost(),
      threadripper_profile:threadripperProfile(),
      ports:portState(),
      policy:"REAL_ONLY_OR_UNAVAILABLE"
    });
  });

  app.post("/api/trillionx/chat",(req,res)=>{
    const msg=req.body?.message||"";
    res.json(answer(msg));
  });

  return {
    name:"TRILLIONX_CHAT_THREADRIPPER_PORTS_MODULE",
    routes:["/trillionx-chat","/api/trillionx/status","/api/trillionx/chat"]
  };
}

module.exports={install,answer,realHost,threadripperProfile,portState};
