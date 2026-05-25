#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX ADD WEB TERMINAL SAFE"
echo "============================================================"

test -f app.js || { echo "ERREUR: app.js introuvable"; exit 1; }

mkdir -p backups reports runtime_state

cp app.js "backups/app.before_web_terminal_safe_$(date +%Y%m%d_%H%M%S).js"

python3 - <<'PY'
from pathlib import Path
p=Path("app.js")
s=p.read_text()

if "TRILLIONX_WEB_TERMINAL_SAFE_V1" in s:
    print("Terminal déjà injecté.")
else:
    block = r'''
/* ============================================================
   TRILLIONX_WEB_TERMINAL_SAFE_V1
   Safe web terminal: allowlist only, no arbitrary shell.
============================================================ */
(function(){
  const cp=require("child_process");
  const fs=require("fs");
  const path=require("path");

  function txRun(cmd,args=[]){
    const map={
      status:"bash scripts/tx_global_status.sh 2>/dev/null || echo status_unavailable",
      ports:"ss -lntp 2>/dev/null | head -80",
      disk:"df -h . && du -h -d 1 . 2>/dev/null | sort -h | tail -25",
      git:"git status --short | head -120 && git status -sb",
      bench_org:"node benchmarks/trillionx_system_organization_bench.js",
      activation:"bash TRILLIONX_ACTIVATION_CHECK.sh",
      button_probe:"bash TRILLIONX_BUTTON_ACTIVATION_PROBE.sh",
      logs:"tail -120 logs/*.log 2>/dev/null || echo no_logs",
      npm_check:"node -v && npm -v && npm ls --depth=0 2>/dev/null | head -120",
      push_status:"git log --oneline origin/main..HEAD 2>/dev/null || true",
      restart_safe:"echo restart_safe_requested; touch runtime_state/TRILLIONX_RESTART_SAFE_REQUEST"
    };
    if(!map[cmd]) return Promise.resolve({ok:false,cmd,error:"COMMAND_NOT_ALLOWED"});
    return new Promise(resolve=>{
      cp.exec(map[cmd],{cwd:process.cwd(),timeout:15000,maxBuffer:1024*1024},(e,out,err)=>{
        resolve({ok:!e,cmd,code:e&&e.code?e.code:0,stdout:String(out||"").slice(-20000),stderr:String(err||"").slice(-4000)});
      });
    });
  }

  const terminalHtml = `<!doctype html><html><head><meta charset="utf-8">
<title>TRILLIONX TERMINAL SAFE</title>
<style>
body{margin:0;background:#020702;color:#00ff66;font-family:monospace}
#wrap{padding:14px}
h1{font-size:20px;margin:0 0 12px;color:#00ff99}
button{background:#021b09;color:#00ff66;border:1px solid #00ff66;padding:10px;margin:4px;font-family:monospace}
#out{white-space:pre-wrap;border:1px solid #00aa44;padding:12px;margin-top:12px;min-height:380px;background:#000}
input{background:#000;color:#00ff66;border:1px solid #00ff66;padding:10px;width:260px;font-family:monospace}
.small{color:#66ffaa;font-size:12px}
</style></head><body><div id="wrap">
<h1>Ω TRILLIONX WEB TERMINAL SAFE</h1>
<div class="small">Allowlist only: status, ports, disk, git, bench_org, activation, button_probe, logs, npm_check, push_status, restart_safe</div>
<div>
<button onclick="run('status')">STATUS</button>
<button onclick="run('ports')">PORTS</button>
<button onclick="run('disk')">DISK</button>
<button onclick="run('git')">GIT</button>
<button onclick="run('bench_org')">BENCH ORG</button>
<button onclick="run('activation')">ACTIVATION</button>
<button onclick="run('button_probe')">BUTTON PROBE</button>
<button onclick="run('logs')">LOGS</button>
<button onclick="run('npm_check')">NPM CHECK</button>
<button onclick="run('push_status')">PUSH STATUS</button>
</div>
<div style="margin-top:10px">
<input id="cmd" placeholder="commande allowlist">
<button onclick="run(document.getElementById('cmd').value)">RUN</button>
</div>
<pre id="out">READY.</pre>
<script>
async function run(cmd){
  const out=document.getElementById('out');
  out.textContent="RUN "+cmd+" ...";
  try{
    const r=await fetch('/api/terminal/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd})});
    const j=await r.json();
    out.textContent="CMD: "+j.cmd+"\\nOK: "+j.ok+"\\nCODE: "+j.code+"\\n\\n--- STDOUT ---\\n"+(j.stdout||"")+"\\n\\n--- STDERR ---\\n"+(j.stderr||j.error||"");
  }catch(e){out.textContent="ERR "+e.message}
}
</script></div></body></html>`;

  try{
    app.get("/terminal",(req,res)=>res.type("html").send(terminalHtml));
    app.get("/terminal-safe",(req,res)=>res.type("html").send(terminalHtml));
    app.post("/api/terminal/run", express.json({limit:"16kb"}), async (req,res)=>{
      const cmd=String((req.body&&req.body.cmd)||"").trim();
      const r=await txRun(cmd);
      res.json({time:new Date().toISOString(),...r});
    });
    app.get("/api/terminal/commands",(req,res)=>res.json({commands:["status","ports","disk","git","bench_org","activation","button_probe","logs","npm_check","push_status","restart_safe"],policy:"allowlist_only"}));
    console.log("[TRILLIONX_WEB_TERMINAL_SAFE_V1] routes active: /terminal /api/terminal/run");
  }catch(e){console.error("[TRILLIONX_WEB_TERMINAL_SAFE_V1] inject error",e.message)}
})();
'''
    marker = 'app.listen'
    idx = s.find(marker)
    if idx == -1:
        s += "\n" + block + "\n"
    else:
        s = s[:idx] + "\n" + block + "\n" + s[idx:]
    p.write_text(s)
    print("Terminal web safe injecté dans app.js")
PY

echo "=== TEST SYNTAX NODE ==="
node --check app.js || exit 1

echo "=== RESTART SAFE APP ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi

PORT=3000 nohup node app.js > logs/trillionx_app_terminal_safe.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== TEST ROUTES ==="
curl -fsS http://127.0.0.1:3000/terminal | head -5 || true
curl -fsS http://127.0.0.1:3000/api/terminal/commands || true
echo
curl -fsS -X POST http://127.0.0.1:3000/api/terminal/run \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"ports"}' | python3 -m json.tool | head -80 || true

echo "=== PORT 3000 ==="
ss -lntp 2>/dev/null | grep ':3000' || true

git add app.js TRILLIONX_ADD_WEB_TERMINAL_SAFE.sh 2>/dev/null || true
git commit -m "Add TRILLIONX safe web terminal" || echo "Rien à commit"

echo "✅ TERMINAL WEB SAFE AJOUTE"
echo "URL locale: http://127.0.0.1:3000/terminal"
echo "URL Codespaces: ouvre le port 3000 puis ajoute /terminal à l'adresse"
