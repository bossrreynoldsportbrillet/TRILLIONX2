#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX FIX UI LOAD FUNCTION"
echo "============================================================"

test -f app.js || { echo "ERREUR app.js introuvable"; exit 1; }

mkdir -p backups reports logs runtime_state
cp app.js "backups/app.before_fix_ui_load_function_$(date +%Y%m%d_%H%M%S).js"

echo "=== AUDIT LOAD FUNCTION ==="
grep -nEi "function load|async function load|const load|let load|load=|JSON.stringify|output|OUTPUT|fetch\\(" app.js \
  | head -500 > reports/TRILLIONX_FIX_UI_LOAD_FUNCTION_AUDIT.txt
cat reports/TRILLIONX_FIX_UI_LOAD_FUNCTION_AUDIT.txt | head -240

python3 - <<'PY'
from pathlib import Path
import re,json,time,hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")
orig=s

helper=r'''
/* TRILLIONX_UI_LOAD_RENDERER_V1 */
function TX_LOAD_PARSE(v){
  for(let i=0;i<8;i++){
    if(typeof v==="string"){
      let t=v.trim();
      try{
        if((t.startsWith("{")&&t.endsWith("}"))||(t.startsWith("[")&&t.endsWith("]"))||(t.startsWith('"')&&t.endsWith('"'))){
          v=JSON.parse(t); continue;
        }
      }catch(e){}
    }
    break;
  }
  return v;
}
function TX_LOAD_RENDER(v){
  try{
    v=TX_LOAD_PARSE(v);
    if(typeof v==="string") return v.replace(/\\n/g,"\n").replace(/\\"/g,'"');
    if(!v) return "";
    const L=[];
    const title=v.engine||v.type||v.name||v.module||v.verdict||v.status;
    if(title) L.push("=== "+String(title).toUpperCase()+" ===");
    for(const k of ["time","ok","status","verdict","message","source","rule","mode","role","port","score","activation_percent","duration_ms","timeout_ms","http_status"]){
      if(v[k]!==undefined && typeof v[k]!=="object") L.push(k+" : "+v[k]);
    }
    if(v.iss_position){
      L.push("\n--- ISS POSITION ---");
      L.push("latitude  : "+v.iss_position.latitude);
      L.push("longitude : "+v.iss_position.longitude);
      if(v.iss_position.timestamp!==undefined) L.push("timestamp : "+v.iss_position.timestamp);
    }
    if(v.apis && Array.isArray(v.apis)){
      L.push("\n--- APIS ---");
      v.apis.forEach(x=>L.push(String(x)));
    }
    if(v.stdout) L.push("\n--- STDOUT ---\n"+String(v.stdout));
    if(v.out) L.push("\n--- OUTPUT ---\n"+TX_LOAD_RENDER(v.out));
    if(v.terminal) L.push("\n--- TERMINAL ---\n"+TX_LOAD_RENDER(v.terminal));
    if(v.data) L.push("\n--- DATA ---\n"+TX_LOAD_RENDER(v.data));
    if(v.catalog) L.push("\n--- CATALOG ---\n"+TX_LOAD_RENDER(v.catalog));
    if(v.summary) L.push("\n--- SUMMARY ---\n"+JSON.stringify(v.summary,null,2));
    if(v.health) L.push("\n--- HEALTH ---\n"+JSON.stringify(v.health,null,2));
    if(v.stderr) L.push("\n--- STDERR ---\n"+String(v.stderr));
    if(v.err) L.push("\n--- ERR ---\n"+String(v.err));
    if(v.error) L.push("\n--- ERROR ---\n"+String(v.error));
    return L.length ? L.join("\n") : JSON.stringify(v,null,2);
  }catch(e){return "LOAD_RENDER_ERROR: "+e.message+"\n"+String(v);}
}
function TX_LOAD_OUTPUT(){
  return document.querySelector("#output,#out,#result,#results,#terminalOut,.output,.terminal-output,pre");
}
function TX_LOAD_SET(v){
  const el=TX_LOAD_OUTPUT();
  const txt=TX_LOAD_RENDER(v);
  if(el){
    if("value" in el) el.value=txt;
    else el.textContent=txt;
  }
  return txt;
}
'''

if "TRILLIONX_UI_LOAD_RENDERER_V1" not in s:
    s=s.replace("</script>", helper+"\n</script>", 1) if "</script>" in s else s+"\n"+helper

# Patch timeout courts
for a,b in [
  ("timeout:800","timeout:15000"),("timeout: 800","timeout: 15000"),
  ("timeout:1000","timeout:15000"),("timeout: 1000","timeout: 15000"),
  ("timeout:3000","timeout:15000"),("timeout: 3000","timeout: 15000"),
  ("timeout:4000","timeout:15000"),("timeout: 4000","timeout: 15000"),
  ("timeout_ms:800","timeout_ms:15000"),("timeout_ms: 800","timeout_ms: 15000")
]:
    s=s.replace(a,b)

# Remplace les JSON.stringify bruts dans la zone UI
patterns=[
(r"([A-Za-z0-9_$.\[\]'\"]+)\.textContent\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.textContent = TX_LOAD_RENDER(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.innerText\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.innerText = TX_LOAD_RENDER(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.innerHTML\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.textContent = TX_LOAD_RENDER(\2);")
]
patches=0
for pat,rep in patterns:
    s,n=re.subn(pat,rep,s)
    patches+=n

# Patch direct de fonction load si elle existe en forme simple.
# On injecte une redéfinition tardive côté navigateur : elle écrase load(url) après chargement script.
override=r'''
/* TRILLIONX_UI_LOAD_OVERRIDE_V1 */
async function load(url){
  const el=TX_LOAD_OUTPUT();
  if(el) el.textContent="LOADING "+url+" ...";
  const ctrl=new AbortController();
  const tm=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch(url,{signal:ctrl.signal});
    const t=await r.text();
    let v=TX_LOAD_PARSE(t);
    if(typeof v==="object" && v){v.http_status=r.status;v.http_ok=r.ok;v.endpoint=url;}
    TX_LOAD_SET(v);
    return v;
  }catch(e){
    const v={ok:false,endpoint:url,error:e.name==="AbortError"?"TIMEOUT_15000MS":e.message};
    TX_LOAD_SET(v);
    return v;
  }finally{
    clearTimeout(tm);
  }
}
'''
if "TRILLIONX_UI_LOAD_OVERRIDE_V1" not in s:
    # important : mettre avant </script> mais plutôt dernier script; replace last occurrence
    idx=s.rfind("</script>")
    if idx!=-1:
        s=s[:idx]+override+"\n"+s[idx:]
    else:
        s+="\n"+override

p.write_text(s)

report={
 "engine":"TRILLIONX_FIX_UI_LOAD_FUNCTION",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
 "patches":patches,
 "target":"load(url) onclick buttons",
 "timeout_ms":15000,
 "policy":"UI load renderer only; endpoints/backend preserved"
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_FIX_UI_LOAD_FUNCTION_LATEST.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
PY

echo "=== NODE CHECK ==="
if ! node --check app.js; then
  echo "NODE CHECK FAILED -> rollback"
  cp "$(ls -t backups/app.before_fix_ui_load_function_*.js | head -1)" app.js
  node --check app.js
  exit 1
fi

echo "=== RESTART APP ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi
PORT=3000 nohup node app.js > logs/trillionx_app_fix_ui_load_function.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== STATUS ==="
ss -lntp 2>/dev/null | grep ':3000' || true
df -P . | awk 'NR==2{gsub("%","",$5);print "Disk used="$5"% remaining="100-$5"%"}'

git add app.js TRILLIONX_FIX_UI_LOAD_FUNCTION.sh reports/TRILLIONX_FIX_UI_LOAD_FUNCTION_LATEST.json reports/TRILLIONX_FIX_UI_LOAD_FUNCTION_AUDIT.txt 2>/dev/null || true
git commit -m "Fix TRILLIONX UI load output renderer" || echo "Rien à commit"

echo "✅ FIX UI LOAD FUNCTION TERMINE"
