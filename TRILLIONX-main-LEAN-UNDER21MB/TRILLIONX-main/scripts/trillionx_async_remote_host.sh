#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX ASYNC REMOTE HOST IMPROVER"
echo "============================================================"

mkdir -p scripts logs reports history runtime_state async_jobs async_results async_queue

echo "=== 1) Async runner Node ==="
cat > scripts/tx_async_runner.js <<'JS'
"use strict";
const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),path=require("path");
const ROOT="/workspaces/TRILLIONX";
const Q=path.join(ROOT,"async_queue");
const JOBS=path.join(ROOT,"async_jobs");
const RES=path.join(ROOT,"async_results");
const LOGS=path.join(ROOT,"logs");
for(const d of [Q,JOBS,RES,LOGS]) fs.mkdirSync(d,{recursive:true});
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const safeCmds={
  resource:"bash scripts/trillionx_resource_percent.sh",
  disk:"bash scripts/trillionx_disk_guard_safe.sh",
  status:"bash scripts/tx_process_status.sh",
  appcheck:"node --check app.js",
  startnice:"bash scripts/tx_start_nice.sh",
  stop:"bash scripts/tx_stop.sh",
  logrotate:"bash scripts/tx_log_rotate.sh"
};
function latestJob(){
  return fs.readdirSync(Q).filter(f=>f.endsWith(".json")).sort()[0];
}
function runJob(file){
  const p=path.join(Q,file);
  const job=JSON.parse(fs.readFileSync(p,"utf8"));
  const id=job.id||file.replace(".json","");
  const cmd=safeCmds[job.type];
  const started=new Date().toISOString();
  const log=path.join(LOGS,`tx_async_${id}.log`);
  const out={id,type:job.type,cmd:cmd||null,started,status:"RUNNING",log};
  fs.writeFileSync(path.join(JOBS,`${id}.running.json`),JSON.stringify(out,null,2));
  fs.unlinkSync(p);
  if(!cmd){
    out.status="REJECTED_UNKNOWN_JOB";
    out.finished=new Date().toISOString();
    out.seal=sha(out);
    fs.writeFileSync(path.join(RES,`${id}.json`),JSON.stringify(out,null,2));
    return;
  }
  try{
    cp.execSync(cmd,{cwd:ROOT,stdio:["ignore",fs.openSync(log,"a"),fs.openSync(log,"a")],timeout:1000*60*10});
    out.status="DONE";
  }catch(e){
    out.status="FAILED_OR_TIMEOUT";
    out.error=String(e.message||e);
  }
  out.finished=new Date().toISOString();
  out.seal=sha(out);
  try{fs.unlinkSync(path.join(JOBS,`${id}.running.json`));}catch{}
  fs.writeFileSync(path.join(RES,`${id}.json`),JSON.stringify(out,null,2));
}
function loop(){
  const f=latestJob();
  if(f) runJob(f);
}
if(process.argv[2]==="once") loop();
else setInterval(loop,1500);
JS

node --check scripts/tx_async_runner.js

echo "=== 2) Async submit shell ==="
cat > scripts/tx_async_submit.sh <<'SH'
#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
mkdir -p async_queue
TYPE="${1:-status}"
ID="$(date +%Y%m%d_%H%M%S)_${TYPE}_$$"
cat > "async_queue/${ID}.json" <<JSON
{
  "id":"$ID",
  "type":"$TYPE",
  "time":"$(date -Iseconds)",
  "policy":"ASYNC_REMOTE_HOST_SAFE"
}
JSON
echo "JOB=$ID TYPE=$TYPE"
echo "Voir: bash scripts/tx_async_status.sh"
SH
chmod +x scripts/tx_async_submit.sh

echo "=== 3) Async daemon start/stop/status ==="
cat > scripts/tx_async_daemon_start.sh <<'SH'
#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
mkdir -p logs runtime_state
if [ -f runtime_state/TRILLIONX_ASYNC_DAEMON_PID ]; then
  OLD="$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID 2>/dev/null || true)"
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null || true
fi
nohup node scripts/tx_async_runner.js > logs/tx_async_daemon.log 2>&1 &
echo $! > runtime_state/TRILLIONX_ASYNC_DAEMON_PID
echo "ASYNC_DAEMON_PID=$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID)"
SH
chmod +x scripts/tx_async_daemon_start.sh

cat > scripts/tx_async_daemon_stop.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
[ -f runtime_state/TRILLIONX_ASYNC_DAEMON_PID ] && kill "$(cat runtime_state/TRILLIONX_ASYNC_DAEMON_PID)" 2>/dev/null || true
pkill -f "node scripts/tx_async_runner.js" 2>/dev/null || true
echo "ASYNC DAEMON STOPPED"
SH
chmod +x scripts/tx_async_daemon_stop.sh

cat > scripts/tx_async_status.sh <<'SH'
#!/usr/bin/env bash
cd /workspaces/TRILLIONX || exit 1
echo "=== ASYNC QUEUE ==="
ls -1 async_queue 2>/dev/null | tail -20 || true
echo "=== RUNNING ==="
ls -1 async_jobs 2>/dev/null | tail -20 || true
echo "=== RESULTS ==="
ls -1t async_results 2>/dev/null | head -10 || true
echo "=== LAST RESULT ==="
LAST=$(ls -1t async_results/*.json 2>/dev/null | head -1 || true)
[ -n "$LAST" ] && cat "$LAST" | python3 -m json.tool | head -80 || true
echo "=== DAEMON LOG ==="
tail -30 logs/tx_async_daemon.log 2>/dev/null || true
SH
chmod +x scripts/tx_async_status.sh

echo "=== 4) Interface commandes courtes async ==="
cat >> .trillionx_aliases <<'ALIAS'

alias txa='cd /workspaces/TRILLIONX && bash scripts/tx_async_daemon_start.sh'
alias txas='cd /workspaces/TRILLIONX && bash scripts/tx_async_status.sh'
alias txar='cd /workspaces/TRILLIONX && bash scripts/tx_async_submit.sh resource'
alias txad='cd /workspaces/TRILLIONX && bash scripts/tx_async_submit.sh disk'
alias txap='cd /workspaces/TRILLIONX && bash scripts/tx_async_submit.sh status'
alias txac='cd /workspaces/TRILLIONX && bash scripts/tx_async_submit.sh appcheck'
alias txal='cd /workspaces/TRILLIONX && bash scripts/tx_async_submit.sh logrotate'
ALIAS

echo "=== 5) Rapport ==="
node - <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const rep={
  engine:"TRILLIONX_ASYNC_REMOTE_HOST_IMPROVER",
  time:new Date().toISOString(),
  status:"READY",
  safe:true,
  principle:"heavy terminal tasks moved to background queue",
  commands:{
    start_daemon:"bash scripts/tx_async_daemon_start.sh",
    submit_resource:"bash scripts/tx_async_submit.sh resource",
    submit_disk:"bash scripts/tx_async_submit.sh disk",
    submit_status:"bash scripts/tx_async_submit.sh status",
    read_status:"bash scripts/tx_async_status.sh"
  },
  does_not_touch:["app.js","data","raid60_plus","node_modules"]
};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.writeFileSync("reports/TRILLIONX_ASYNC_REMOTE_HOST_LATEST.json",JSON.stringify(rep,null,2));
fs.appendFileSync("history/TRILLIONX_ASYNC_REMOTE_HOST_HISTORY.jsonl",JSON.stringify({time:rep.time,status:rep.status,seal:rep.seal})+"\n");
console.log(JSON.stringify(rep,null,2));
NODE

git add scripts/tx_async_* .trillionx_aliases reports/TRILLIONX_ASYNC_REMOTE_HOST_LATEST.json history/TRILLIONX_ASYNC_REMOTE_HOST_HISTORY.jsonl 2>/dev/null || true
git commit -m "Add TRILLIONX async remote host improver" || echo "Rien à commit"

echo "============================================================"
echo "✅ ASYNC REMOTE HOST OK"
echo "Démarrer daemon : bash scripts/tx_async_daemon_start.sh"
echo "Envoyer status  : bash scripts/tx_async_submit.sh status"
echo "Voir résultats  : bash scripts/tx_async_status.sh"
echo "Aliases après source ~/.bashrc : txa txas txar txad txap txac"
echo "============================================================"
