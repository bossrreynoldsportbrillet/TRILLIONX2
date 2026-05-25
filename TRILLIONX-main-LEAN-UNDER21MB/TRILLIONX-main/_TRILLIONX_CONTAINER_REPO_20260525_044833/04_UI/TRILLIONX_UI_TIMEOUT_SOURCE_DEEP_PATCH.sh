#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX UI TIMEOUT SOURCE DEEP PATCH"
echo "============================================================"

test -f app.js || { echo "ERREUR: app.js introuvable"; exit 1; }

mkdir -p backups reports logs runtime_state
cp app.js "backups/app.before_ui_timeout_deep_patch_$(date +%Y%m%d_%H%M%S).js"

echo "=== AUDIT UI SOURCE AUTOUR OUTPUT/FETCH/TIMEOUT ==="
grep -nEi "OUTPUT|output|outEl|safeText|RUN SAFE SHELL|api/terminal/run|timeout_ms|timeout|AbortController|fetch\(" app.js \
  | head -400 \
  > reports/TRILLIONX_UI_TIMEOUT_SOURCE_AUDIT.txt

cat reports/TRILLIONX_UI_TIMEOUT_SOURCE_AUDIT.txt | head -220

python3 - <<'PY'
from pathlib import Path
import re,json,time,hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")
orig=s

# 1) Augmente les timeouts UI trop courts, sans toucher aux timeout backend lourds s'ils sont déjà grands.
# 800ms/1000ms/1500ms/2500ms/3000ms/4000ms deviennent plus raisonnables pour Codespaces mobile.
repls = {
    "timeout_ms:800":"timeout_ms:12000",
    "timeout_ms: 800":"timeout_ms: 12000",
    "timeout_ms\":800":"timeout_ms\":12000",
    "timeout_ms\": 800":"timeout_ms\": 12000",
    "timeout:800":"timeout:12000",
    "timeout: 800":"timeout: 12000",
    "timeout:1000":"timeout:12000",
    "timeout: 1000":"timeout: 12000",
    "timeout:1500":"timeout:12000",
    "timeout: 1500":"timeout: 12000",
    "timeout:2500":"timeout:15000",
    "timeout: 2500":"timeout: 15000",
    "timeout:3000":"timeout:15000",
    "timeout: 3000":"timeout: 15000",
    "timeout:4000":"timeout:15000",
    "timeout: 4000":"timeout: 15000",
}
count=0
for a,b in repls.items():
    n=s.count(a)
    if n:
        s=s.replace(a,b); count+=n

# 2) Ajoute un renderer profond qui sait traiter JSON stringifié plusieurs fois.
helper = r'''
/* TRILLIONX_UI_TIMEOUT_RENDER_DEEP_V1 */
function TRILLIONX_deepParse(x){
  for(let i=0;i<4;i++){
    if(typeof x==="string"){
      const t=x.trim();
      if((t.startsWith("{")&&t.endsWith("}"))||(t.startsWith("[")&&t.endsWith("]"))){
        try{x=JSON.parse(t); continue;}catch(e){}
      }
    }
    break;
  }
  return x;
}
function TRILLIONX_deepCleanText(x){
  try{
    x=TRILLIONX_deepParse(x);
    if(typeof x==="string") return x;
    if(!x) return "";
    const o=[];
    if(x.time) o.push("TIME: "+x.time);
    if(x.name) o.push("NAME: "+x.name);
    if(x.cmd) o.push("CMD: "+x.cmd);
    if(typeof x.ok!=="undefined") o.push("OK: "+x.ok);
    if(typeof x.code!=="undefined") o.push("CODE: "+x.code);
    if(x.verdict) o.push("VERDICT: "+x.verdict);
    if(x.status) o.push("STATUS: "+x.status);
    if(x.terminal) o.push("\n--- TERMINAL ---\n"+TRILLIONX_deepCleanText(x.terminal));
    if(x.stdout) o.push("\n--- STDOUT ---\n"+String(x.stdout));
    if(x.out) o.push("\n--- OUTPUT ---\n"+String(x.out));
    if(x.data) o.push("\n--- DATA ---\n"+TRILLIONX_deepCleanText(x.data));
    if(x.summary) o.push("\n--- SUMMARY ---\n"+JSON.stringify(x.summary,null,2));
    if(x.tools) o.push("\n--- TOOLS ---\n"+JSON.stringify(x.tools,null,2));
    if(x.stderr) o.push("\n--- STDERR ---\n"+String(x.stderr));
    if(x.err) o.push("\n--- ERR ---\n"+String(x.err));
    if(x.error) o.push("\n--- ERROR ---\n"+String(x.error));
    if(o.length) return o.join("\n");
    return JSON.stringify(x,null,2);
  }catch(e){ return "RENDER_ERROR: "+e.message+"\n"+String(x); }
}
function TRILLIONX_findOutputBox(){
  return document.querySelector("#output,#out,#terminalOut,#terminal-output,#result,.output,.terminal-output,pre");
}
function TRILLIONX_writeOutput(x){
  const el=TRILLIONX_findOutputBox();
  const txt=TRILLIONX_deepCleanText(x);
  if(el) el.textContent=txt;
  return txt;
}
async function TRILLIONX_fetchTimeoutClean(url,opt,timeoutMs){
  const ctrl=new AbortController();
  const tm=setTimeout(()=>ctrl.abort(), timeoutMs||15000);
  try{
    opt=opt||{};
    opt.signal=ctrl.signal;
    const r=await fetch(url,opt);
    const t=await r.text();
    let x=TRILLIONX_deepParse(t);
    if(typeof x==="object" && x){ x.http_status=r.status; x.http_ok=r.ok; }
    TRILLIONX_writeOutput(x);
    return x;
  }catch(e){
    const x={ok:false,error:e.name==="AbortError"?"TIMEOUT_UI_ABORT":e.message,timeout_ms:timeoutMs||15000,url};
    TRILLIONX_writeOutput(x);
    return x;
  }finally{ clearTimeout(tm); }
}
'''

if "TRILLIONX_UI_TIMEOUT_RENDER_DEEP_V1" not in s:
    if "</script>" in s:
        s=s.replace("</script>", helper+"\n</script>", 1)
    else:
        s += "\n"+helper+"\n"

# 3) Patch ciblé: fetch('/api/terminal/run'...) vers wrapper avec timeout long quand pattern simple présent.
# Ne casse pas si déjà complexe: on laisse la logique, le helper global reste utilisable.
s2,n = re.subn(
    r"fetch\(\s*['\"]\/api\/terminal\/run['\"]\s*,\s*\{",
    "TRILLIONX_fetchTimeoutClean('/api/terminal/run',{",
    s
)
if n:
    s=s2
    count+=n
    # Refermer les appels peut être délicat; on ne modifie que l'appel initial si la syntaxe supporte wrapper.
    # Le node --check validera. Si échec, rollback automatique plus bas.

p.write_text(s)

report={
 "engine":"TRILLIONX_UI_TIMEOUT_SOURCE_DEEP_PATCH",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
 "timeout_replacements":count,
 "deep_renderer_present":True,
 "target":"UI buttons / OUTPUT / terminal source",
 "policy":"no backend logic change; UI timeout/render only"
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_UI_TIMEOUT_SOURCE_DEEP_PATCH_LATEST.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
PY

echo "=== NODE CHECK ==="
if ! node --check app.js; then
  echo "NODE CHECK FAILED -> rollback"
  last=$(ls -t backups/app.before_ui_timeout_deep_patch_*.js | head -1)
  cp "$last" app.js
  node --check app.js
  exit 1
fi

echo "=== RESTART SAFE ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi
PORT=3000 nohup node app.js > logs/trillionx_app_ui_timeout_deep_patch.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== PORT 3000 ==="
ss -lntp 2>/dev/null | grep ':3000' || true

echo "=== TEST API TERMINAL TIMEOUT ==="
curl -fsS -X POST http://127.0.0.1:3000/api/terminal/run \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"ports"}' | python3 -m json.tool | head -60 || true

git add app.js TRILLIONX_UI_TIMEOUT_SOURCE_DEEP_PATCH.sh reports/TRILLIONX_UI_TIMEOUT_SOURCE_DEEP_PATCH_LATEST.json reports/TRILLIONX_UI_TIMEOUT_SOURCE_AUDIT.txt 2>/dev/null || true
git commit -m "Patch TRILLIONX UI timeout and deep output rendering" || echo "Rien à commit"

echo "✅ UI TIMEOUT SOURCE DEEP PATCH TERMINE"
