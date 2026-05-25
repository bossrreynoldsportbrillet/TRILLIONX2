#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX UI SOURCE REVIEW + OUTPUT FIX"
echo "============================================================"

test -f app.js || { echo "ERREUR: app.js introuvable"; exit 1; }

mkdir -p backups reports logs runtime_state
cp app.js "backups/app.before_ui_source_review_output_fix_$(date +%Y%m%d_%H%M%S).js"

echo "=== 1) AUDIT SOURCE UI ==="
grep -nEi "OUTPUT|output|innerText|textContent|innerHTML|fetch\(|onclick|button|catalog|ISS|open-notify|terminal|safeText|JSON.stringify|setOutput|out" app.js \
  | head -700 > reports/TRILLIONX_UI_SOURCE_REVIEW_LINES.txt

cat reports/TRILLIONX_UI_SOURCE_REVIEW_LINES.txt | head -220

echo
echo "=== 2) PATCH RENDERER UI SOURCE ==="
python3 - <<'PY'
from pathlib import Path
import re,json,time,hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")
original=s

renderer=r'''
/* TRILLIONX_UI_SOURCE_OUTPUT_RENDERER_V2 */
function TX_parseDeep(v){
  for(let i=0;i<8;i++){
    if(typeof v==="string"){
      let t=v.trim();
      if((t.startsWith('"')&&t.endsWith('"'))||(t.startsWith("{")&&t.endsWith("}"))||(t.startsWith("[")&&t.endsWith("]"))){
        try{v=JSON.parse(t);continue}catch(e){}
      }
    }
    break;
  }
  return v;
}
function TX_linesFromObject(o,depth){
  o=TX_parseDeep(o);
  if(depth>4) return [String(o)];
  if(typeof o==="string") return o.split("\n");
  if(o===null||typeof o!=="object") return [String(o)];
  let L=[];
  const title=o.type||o.engine||o.name||o.module||o.status||o.verdict;
  if(title) L.push("=== "+String(title).toUpperCase()+" ===");
  const keys=["time","started_at","ended_at","duration_ms","timeout_ms","ok","http_ok","http_status","status","verdict","score","activation_percent","port","role","message","source","rule"];
  for(const k of keys){ if(o[k]!==undefined && typeof o[k]!=="object") L.push(k+" : "+o[k]); }
  if(o.iss_position&&typeof o.iss_position==="object"){
    L.push("");
    L.push("--- ISS POSITION ---");
    if(o.iss_position.latitude!==undefined) L.push("latitude  : "+o.iss_position.latitude);
    if(o.iss_position.longitude!==undefined) L.push("longitude : "+o.iss_position.longitude);
    if(o.iss_position.timestamp!==undefined) L.push("timestamp : "+o.iss_position.timestamp);
  }
  if(o.catalog&&typeof o.catalog==="object"){
    L.push("");
    L.push("--- CATALOG ---");
    L=L.concat(TX_linesFromObject(o.catalog,depth+1));
  }
  if(o.terminal){ L.push(""); L.push("--- TERMINAL ---"); L=L.concat(TX_linesFromObject(o.terminal,depth+1)); }
  if(o.stdout){ L.push(""); L.push("--- STDOUT ---"); L=L.concat(String(o.stdout).split("\n")); }
  if(o.out){ L.push(""); L.push("--- OUTPUT ---"); L=L.concat(TX_linesFromObject(o.out,depth+1)); }
  if(o.data){ L.push(""); L.push("--- DATA ---"); L=L.concat(TX_linesFromObject(o.data,depth+1)); }
  if(o.summary){ L.push(""); L.push("--- SUMMARY ---"); L=L.concat(TX_linesFromObject(o.summary,depth+1)); }
  if(o.health){ L.push(""); L.push("--- HEALTH ---"); L=L.concat(TX_linesFromObject(o.health,depth+1)); }
  if(o.apis&&Array.isArray(o.apis)){
    L.push("");
    L.push("--- APIS ---");
    for(const a of o.apis) L.push(String(a));
  }
  if(o.tools&&typeof o.tools==="object"){
    L.push("");
    L.push("--- TOOLS ---");
    for(const [k,v] of Object.entries(o.tools)) L.push(k+" : "+(typeof v==="object"?JSON.stringify(v):v));
  }
  if(o.stderr){ L.push(""); L.push("--- STDERR ---"); L=L.concat(String(o.stderr).split("\n")); }
  if(o.err){ L.push(""); L.push("--- ERR ---"); L=L.concat(String(o.err).split("\n")); }
  if(o.error){ L.push(""); L.push("--- ERROR ---"); L.push(String(o.error)); }
  if(L.length<2) L.push(JSON.stringify(o,null,2));
  return L;
}
function TX_renderOutput(v){
  try{return TX_linesFromObject(v,0).join("\n").replace(/\\n/g,"\n").replace(/\\"/g,'"');}
  catch(e){return "UI_RENDER_ERROR: "+e.message+"\n"+String(v);}
}
function TX_outputEl(){
  return document.querySelector("#output,#out,#terminalOut,#terminal-output,#result,#results,.output,.terminal-output,pre");
}
function TX_setOutput(v){
  const el=TX_outputEl();
  const txt=TX_renderOutput(v);
  if(el){
    if("value" in el) el.value=txt;
    else el.textContent=txt;
  }
  return txt;
}
'''

if "TRILLIONX_UI_SOURCE_OUTPUT_RENDERER_V2" not in s:
    if "</script>" in s:
        s=s.replace("</script>",renderer+"\n</script>",1)
    else:
        s+="\n"+renderer+"\n"

patches=0

# Remplace JSON.stringify brut vers renderer.
rules=[
(r"([A-Za-z0-9_$.\[\]'\"]+)\.textContent\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.textContent = TX_renderOutput(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.innerText\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.innerText = TX_renderOutput(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.innerHTML\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;", r"\1.textContent = TX_renderOutput(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.textContent\s*=\s*JSON\.stringify\(([^;]+?)\)\s*;", r"\1.textContent = TX_renderOutput(\2);"),
(r"([A-Za-z0-9_$.\[\]'\"]+)\.innerText\s*=\s*JSON\.stringify\(([^;]+?)\)\s*;", r"\1.innerText = TX_renderOutput(\2);"),
]
for pat,rep in rules:
    s,n=re.subn(pat,rep,s)
    patches+=n

# Timeout UI : 800 trop agressif -> 15000.
for a,b in [
("timeout_ms:800","timeout_ms:15000"),
("timeout_ms: 800","timeout_ms: 15000"),
('"timeout_ms":800','"timeout_ms":15000'),
('"timeout_ms": 800','"timeout_ms": 15000'),
("timeout:800","timeout:15000"),
("timeout: 800","timeout: 15000"),
("timeout:3000","timeout:15000"),
("timeout: 3000","timeout: 15000"),
("timeout:4000","timeout:15000"),
("timeout: 4000","timeout: 15000")
]:
    n=s.count(a)
    if n:
        s=s.replace(a,b)
        patches+=n

p.write_text(s)

# Mapping compact des boutons/fetch.
lines=s.splitlines()
items=[]
for i,l in enumerate(lines,1):
    if re.search(r"<button|onclick|fetch\(|/api/|ISS|catalog|terminal|OUTPUT|output",l,re.I):
        items.append({"line":i,"text":l[:260]})
report={
 "engine":"TRILLIONX_UI_SOURCE_REVIEW_AND_OUTPUT_FIX",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
 "patches":patches,
 "ui_items_seen":len(items),
 "items":items[:500],
 "policy":"UI output renderer + timeout only; backend logic preserved"
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_UI_SOURCE_REVIEW_AND_OUTPUT_FIX_LATEST.json").write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ["engine","patches","ui_items_seen","seal"]},indent=2))
PY

echo
echo "=== 3) NODE CHECK / ROLLBACK SI ERREUR ==="
if ! node --check app.js; then
  echo "NODE CHECK FAILED -> rollback"
  cp "$(ls -t backups/app.before_ui_source_review_output_fix_*.js | head -1)" app.js
  node --check app.js
  exit 1
fi

echo
echo "=== 4) RESTART APP SAFE ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi

PORT=3000 nohup node app.js > logs/trillionx_app_ui_source_output_fix.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo
echo "=== 5) STATUS ==="
ss -lntp 2>/dev/null | grep ':3000' || true
df -P . | awk 'NR==2{gsub("%","",$5);print "Disk used="$5"%";print "Disk remaining="100-$5"%"}'

echo
echo "=== 6) RAPPORT COURT ==="
cat reports/TRILLIONX_UI_SOURCE_REVIEW_AND_OUTPUT_FIX_LATEST.json \
| python3 -c 'import sys,json;d=json.load(sys.stdin);print("patches =",d["patches"]);print("ui_items_seen =",d["ui_items_seen"]);print("seal =",d["seal"])'

git add app.js TRILLIONX_UI_SOURCE_REVIEW_AND_OUTPUT_FIX.sh reports/TRILLIONX_UI_SOURCE_REVIEW_LINES.txt reports/TRILLIONX_UI_SOURCE_REVIEW_AND_OUTPUT_FIX_LATEST.json 2>/dev/null || true
git commit -m "Review and fix TRILLIONX UI output renderer" || echo "Rien à commit"

echo "✅ UI SOURCE REVIEW + OUTPUT FIX TERMINE"
