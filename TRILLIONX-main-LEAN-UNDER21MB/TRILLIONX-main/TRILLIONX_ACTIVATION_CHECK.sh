#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX ACTIVATION CHECK"
echo "============================================================"

mkdir -p reports history logs

REPORT="reports/TRILLIONX_ACTIVATION_CHECK_LATEST.json"

node - <<'JS'
const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim()}catch(e){return""}};
const okFile=f=>fs.existsSync(f);
const json=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
const age=f=>{try{return Math.round((Date.now()-fs.statSync(f).mtimeMs)/1000)}catch{return null}};
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");

const pidAlive=f=>{
  if(!okFile(f)) return false;
  const p=String(fs.readFileSync(f,"utf8")).trim();
  return !!p && sh(`ps -p ${p} -o pid= 2>/dev/null`)!=="";
};

const ports=sh("ss -lntp 2>/dev/null || true");
const appCurl=sh("curl -fsS http://127.0.0.1:3000/ 2>/dev/null | head -5 || true");

const checks={
  app3000_open:/\:3000\b/.test(ports),
  app3000_http:appCurl.length>0,
  main_pid_alive:pidAlive("runtime_state/TRILLIONX_MAIN_PID"),
  watchdog_pid_alive:pidAlive("runtime_state/TRILLIONX_WATCHDOG_PID"),
  micro_pid_alive:pidAlive("runtime_state/TRILLIONX_MICRO_SYNC_PID") || pidAlive("runtime_state/TRILLIONX_PARALLEL_MICRO_SYNC_PID"),
  async_queue_empty:(sh("find async_queue -type f -name '*.json' 2>/dev/null | wc -l")||"0").trim()==="0",
  async_running_empty:(sh("find async_jobs -type f -name '*.json' 2>/dev/null | wc -l")||"0").trim()==="0",
  git_clean:(sh("git status --short | wc -l")||"999").trim()==="0",
  org_report_ok:!!json("reports/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_LATEST.json"),
  global_drain_report_ok:!!json("reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_LATEST.json"),
  micro_report_ok:!!json("reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json") || !!json("reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json")
};

const ages={
  org_report_age_s:age("reports/TRILLIONX_SYSTEM_ORGANIZATION_BENCH_LATEST.json"),
  drain_report_age_s:age("reports/TRILLIONX_ASYNC_GLOBAL_DRAIN_V2_LATEST.json"),
  micro_parallel_age_s:age("reports/TRILLIONX_PARALLEL_MICRO_SYNC_LATEST.json"),
  micro_remote_age_s:age("reports/TRILLIONX_REMOTE_HOST_MICRO_SYNC_LATEST.json")
};

const activeCount=Object.values(checks).filter(Boolean).length;
const total=Object.keys(checks).length;
const activation_percent=Math.round(activeCount*1000/total)/10;

let verdict="PARTIAL";
if(checks.app3000_open && checks.app3000_http && checks.async_queue_empty && checks.async_running_empty && checks.git_clean) verdict="ACTIVE_CORE_OK";
if(activation_percent>=90) verdict="ACTIVE_FULL_OK";
if(!checks.app3000_open) verdict="APP3000_NOT_ACTIVE";
if(!checks.git_clean) verdict="ACTIVE_WITH_LOCAL_GIT_CHANGES";

const report={
  engine:"TRILLIONX_ACTIVATION_CHECK",
  time:new Date().toISOString(),
  checks,
  ages,
  activation_percent,
  activeCount,
  total,
  verdict,
  truth_policy:{
    real_only:true,
    checks_runtime_presence:true,
    no_fake_activation:true,
    no_appjs_touch:true
  }
};
report.seal=sha(report);
fs.writeFileSync("reports/TRILLIONX_ACTIVATION_CHECK_LATEST.json",JSON.stringify(report,null,2));

console.log("Activation % :",activation_percent);
console.log("Verdict      :",verdict);
console.log("Port 3000    :",checks.app3000_open?"OPEN":"CLOSED");
console.log("HTTP 3000    :",checks.app3000_http?"OK":"NO_HTTP");
console.log("Main PID     :",checks.main_pid_alive?"ALIVE":"MISSING/DEAD");
console.log("Watchdog PID :",checks.watchdog_pid_alive?"ALIVE":"MISSING/DEAD");
console.log("Micro-sync   :",checks.micro_pid_alive?"ALIVE":"MISSING/DEAD");
console.log("Async queue  :",checks.async_queue_empty?"EMPTY":"NOT_EMPTY");
console.log("Async running:",checks.async_running_empty?"EMPTY":"NOT_EMPTY");
console.log("Git          :",checks.git_clean?"OK":"LOCAL_CHANGES");
console.log("Report       : reports/TRILLIONX_ACTIVATION_CHECK_LATEST.json");
JS

git add TRILLIONX_ACTIVATION_CHECK.sh reports/TRILLIONX_ACTIVATION_CHECK_LATEST.json 2>/dev/null || true
git commit -m "Add TRILLIONX activation check" || echo "Rien à commit"

echo "============================================================"
echo "✅ Activation check terminé"
echo "============================================================"
