#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX CHECK UP-TO-DATE"
echo "============================================================"

mkdir -p data reports history logs runtime_state

echo
echo "=== 1) SYSTEM ==="
date -Iseconds
pwd
node --version 2>/dev/null || echo "node missing"
npm --version 2>/dev/null || echo "npm missing"
git --version 2>/dev/null || echo "git missing"

echo
echo "=== 2) GIT LOCAL STATUS ==="
git status --short || true
LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "branch=$LOCAL_BRANCH"
echo "local_commit=$LOCAL_COMMIT"

echo
echo "=== 3) GIT REMOTE STATUS ==="
git fetch --all --prune 2>/dev/null || echo "fetch failed"
REMOTE_COMMIT=$(git rev-parse "origin/${LOCAL_BRANCH}" 2>/dev/null || echo "unknown")
echo "remote_commit=$REMOTE_COMMIT"

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
  GIT_UP_TO_DATE="YES"
else
  GIT_UP_TO_DATE="NO"
fi
echo "git_up_to_date=$GIT_UP_TO_DATE"

echo
echo "=== 4) COMMITS DIFFERENCE ==="
echo "--- local ahead ---"
git log --oneline "origin/${LOCAL_BRANCH}..${LOCAL_BRANCH}" 2>/dev/null || true
echo "--- remote ahead ---"
git log --oneline "${LOCAL_BRANCH}..origin/${LOCAL_BRANCH}" 2>/dev/null || true

echo
echo "=== 5) APP.JS CHECK ==="
if [ -f app.js ]; then
  APP_EXISTS="YES"
  APP_SHA=$(sha256sum app.js | awk '{print $1}')
  APP_SIZE=$(wc -c < app.js)
  echo "app.js exists"
  echo "app_sha=$APP_SHA"
  echo "app_size_bytes=$APP_SIZE"
  node --check app.js && APP_SYNTAX="OK" || APP_SYNTAX="FAIL"
else
  APP_EXISTS="NO"
  APP_SHA="missing"
  APP_SIZE="0"
  APP_SYNTAX="MISSING"
  echo "app.js missing"
fi

echo
echo "=== 6) NPM / PACKAGE CHECK ==="
if [ -f package.json ]; then
  PKG_SHA=$(sha256sum package.json | awk '{print $1}')
  echo "package.json OK sha=$PKG_SHA"
  if [ -d node_modules ]; then
    NODE_MODULES="YES"
    echo "node_modules exists"
  else
    NODE_MODULES="NO"
    echo "node_modules missing"
  fi
  npm ls --depth=0 2>/tmp/trillionx_npm_ls.err | head -80 || {
    echo "npm ls has warnings/errors:"
    cat /tmp/trillionx_npm_ls.err | head -80
  }
else
  PKG_SHA="missing"
  NODE_MODULES="NO_PACKAGE"
  echo "package.json missing"
fi

echo
echo "=== 7) CRITICAL SCRIPTS CHECK ==="
for f in \
  scripts/start_safe.sh \
  scripts/monitor_trillionx.sh \
  controllers/TRILLIONX_RUNTIME_GUARD.js \
  TRILLIONX_FIRE_DICT_UNLOCKER_MICRO_STRESS.js \
  TRILLIONX_97_PORT_PROCESS_SUPERVISOR.js \
  TRILLIONX_97_NETWORK_TASK_ASSIGNER.js
do
  if [ -f "$f" ]; then
    echo "OK $f"
    case "$f" in
      *.js) node --check "$f" || true ;;
      *.sh) bash -n "$f" || true ;;
    esac
  else
    echo "MISSING $f"
  fi
done

echo
echo "=== 8) RUNTIME PORTS ==="
ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:20[0-9][0-9][0-9]" || echo "no critical ports visible"

echo
echo "=== 9) APP PORT 3000 HEALTH ==="
if curl -fsS http://127.0.0.1:3000/ >/tmp/trillionx_port3000.out 2>/dev/null; then
  PORT3000="OPEN"
  echo "port 3000 OPEN"
  head -5 /tmp/trillionx_port3000.out || true
else
  PORT3000="CLOSED_OR_APP_DOWN"
  echo "port 3000 closed or app not running"
fi

echo
echo "=== 10) LATEST REPORTS ==="
for f in \
  data/TRILLIONX_OKAY_STABLE_LATEST.json \
  data/TRILLIONX_DICT_OK_SEAL_LATEST.json \
  data/trillionx_fire_dict_unlocker_micro_stress_latest.json \
  reports/TRILLIONX_OPTIMIZATION_FAST_LATEST.json \
  reports/TRILLIONX_OPTIMIZATION_EOF_REPORT_LATEST.json \
  data/TRILLIONX_RUNTIME_GUARD_LATEST.json
do
  if [ -f "$f" ]; then
    echo "--- $f"
    ls -lh "$f"
    node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('$f','utf8')); console.log(JSON.stringify({engine:j.engine,status:j.status,verdict:j.verdict||j.summary?.verdict,seal:j.seal,time:j.time||j.ts},null,2));}catch(e){console.log('not json or unreadable')}"
  else
    echo "MISSING $f"
  fi
done

echo
echo "=== 11) RUNTIME GUARD SNAPSHOT ==="
if [ -f controllers/TRILLIONX_RUNTIME_GUARD.js ]; then
  node controllers/TRILLIONX_RUNTIME_GUARD.js | head -120 || true
fi

echo
echo "=== 12) BUILD FINAL REPORT ==="
node - <<'NODE'
const fs=require("fs"), os=require("os"), crypto=require("crypto"), cp=require("child_process");
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim()}catch{return ""}};
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const exists=p=>fs.existsSync(p);
const sha=p=>exists(p)?crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"):"missing";

const branch=sh("git rev-parse --abbrev-ref HEAD")||"unknown";
const local=sh("git rev-parse HEAD")||"unknown";
const remote=sh(`git rev-parse origin/${branch}`)||"unknown";
const dirty=sh("git status --short");
const ports=sh(`ss -lntp 2>/dev/null | grep -E ":3000|:3997|:9229|:20[0-9][0-9][0-9]" || true`);

const report={
  engine:"TRILLIONX_UP_TO_DATE_CHECK",
  time:new Date().toISOString(),
  git:{
    branch,
    local_commit:local,
    remote_commit:remote,
    up_to_date:local===remote,
    dirty:dirty?true:false,
    dirty_lines:dirty.split("\n").filter(Boolean).slice(0,80)
  },
  app:{
    exists:exists("app.js"),
    sha256:sha("app.js"),
    size_bytes:exists("app.js")?fs.statSync("app.js").size:0
  },
  npm:{
    package_json:exists("package.json"),
    package_sha256:sha("package.json"),
    node_modules:exists("node_modules"),
    npm_ready:exists("node_modules/.trillionx_npm_ready")
  },
  runtime:{
    node:process.version,
    cpu:os.cpus()[0]?.model||"unknown",
    logical_cpu:os.cpus().length,
    ram_total_gb:r(os.totalmem()/1073741824),
    ram_free_gb:r(os.freemem()/1073741824),
    load:os.loadavg().map(r),
    ports_visible:ports.split("\n").filter(Boolean)
  },
  files:{
    stable:exists("data/TRILLIONX_OKAY_STABLE_LATEST.json"),
    dict_ok:exists("data/TRILLIONX_DICT_OK_SEAL_LATEST.json"),
    runtime_guard:exists("controllers/TRILLIONX_RUNTIME_GUARD.js"),
    start_safe:exists("scripts/start_safe.sh")
  }
};
report.status =
  report.git.up_to_date && !report.git.dirty && report.app.exists && report.npm.package_json
  ? "UP_TO_DATE_CLEAN"
  : report.git.up_to_date
    ? "UP_TO_DATE_WITH_LOCAL_CHANGES_OR_WARNINGS"
    : "NOT_UP_TO_DATE";
report.seal=crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");

fs.mkdirSync("reports",{recursive:true});
fs.mkdirSync("history",{recursive:true});
fs.writeFileSync("reports/TRILLIONX_UP_TO_DATE_CHECK_LATEST.json",JSON.stringify(report,null,2));
fs.appendFileSync("history/TRILLIONX_UP_TO_DATE_CHECK_HISTORY.jsonl",JSON.stringify({time:report.time,status:report.status,seal:report.seal,local:report.git.local_commit,remote:report.git.remote_commit})+"\n");
console.log(JSON.stringify(report,null,2));
NODE

echo
echo "=== 13) SAVE CHECK REPORT ==="
git add reports/TRILLIONX_UP_TO_DATE_CHECK_LATEST.json history/TRILLIONX_UP_TO_DATE_CHECK_HISTORY.jsonl 2>/dev/null || true
git commit -m "Add TRILLIONX up-to-date check report" || echo "Rien à commit"

echo
echo "============================================================"
echo " CHECK FINI"
echo " Report: reports/TRILLIONX_UP_TO_DATE_CHECK_LATEST.json"
echo "============================================================"
