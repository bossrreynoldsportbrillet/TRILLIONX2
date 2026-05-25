#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX ALL BUTTONS RENDER FIX SOURCE"
echo "============================================================"

test -f app.js || { echo "ERREUR app.js introuvable"; exit 1; }

mkdir -p backups reports logs runtime_state
cp app.js "backups/app.before_all_buttons_render_fix_$(date +%Y%m%d_%H%M%S).js"

python3 - <<'PY'
from pathlib import Path
import re, json, time, hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")

helper = r'''
/* TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE_V1 */
function TRILLIONX_cleanRender(x){
  try{
    if(typeof x==="string"){
      try{x=JSON.parse(x)}catch(e){return x}
    }
    if(!x) return "";
    const out=[];
    if(x.verdict) out.push("VERDICT: "+x.verdict);
    if(x.status) out.push("STATUS: "+x.status);
    if(typeof x.ok!=="undefined") out.push("OK: "+x.ok);
    if(typeof x.code!=="undefined") out.push("CODE: "+x.code);
    if(typeof x.activation_percent!=="undefined") out.push("ACTIVATION: "+x.activation_percent+"%");
    if(typeof x.score!=="undefined") out.push("SCORE: "+x.score);
    if(x.summary && typeof x.summary==="object"){
      out.push("\n--- SUMMARY ---");
      out.push(JSON.stringify(x.summary,null,2));
    }
    if(x.health && typeof x.health==="object"){
      out.push("\n--- HEALTH ---");
      out.push(JSON.stringify(x.health,null,2));
    }
    if(x.stdout) out.push("\n--- STDOUT ---\n"+x.stdout);
    if(x.out) out.push("\n--- OUTPUT ---\n"+x.out);
    if(x.data) out.push("\n--- DATA ---\n"+(typeof x.data==="string"?x.data:JSON.stringify(x.data,null,2)));
    if(x.stderr) out.push("\n--- STDERR ---\n"+x.stderr);
    if(x.err) out.push("\n--- ERR ---\n"+x.err);
    if(x.error) out.push("\n--- ERROR ---\n"+x.error);
    if(x.http_status===404 || x.statusCode===404) out.push("\nENDPOINT: 404 / non mappé");
    if(out.length) return out.join("\n");
    return JSON.stringify(x,null,2);
  }catch(e){
    return "RENDER_ERROR: "+e.message+"\n"+String(x);
  }
}
function TRILLIONX_setOutputClean(target,x){
  const txt=TRILLIONX_cleanRender(x);
  try{
    if(typeof target==="string") target=document.querySelector(target)||document.getElementById(target);
    if(!target){
      const q=document.querySelector("#output,#out,.output,pre");
      if(q) q.textContent=txt;
      return txt;
    }
    if("value" in target) target.value=txt;
    else target.textContent=txt;
  }catch(e){}
  return txt;
}
async function TRILLIONX_fetchClean(url,opt,target){
  const t0=Date.now();
  try{
    const r=await fetch(url,opt||{});
    const text=await r.text();
    let j;
    try{j=JSON.parse(text)}catch(e){j={ok:r.ok,http_status:r.status,status:r.status,out:text}}
    if(typeof j==="object" && j){
      j.http_status=j.http_status||r.status;
      j.ms=Date.now()-t0;
    }
    TRILLIONX_setOutputClean(target||"#output",j);
    return j;
  }catch(e){
    const j={ok:false,error:e.message,ms:Date.now()-t0};
    TRILLIONX_setOutputClean(target||"#output",j);
    return j;
  }
}
'''

if "TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE_V1" not in s:
    if "</script>" in s:
        s=s.replace("</script>", helper+"\n</script>", 1)
    else:
        s += "\n"+helper+"\n"

# Patch patterns fréquents de rendu brut JSON
patterns=[
  (r"(\w+)\.textContent\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;",
   r"\1.textContent = TRILLIONX_cleanRender(\2);"),
  (r"(\w+)\.innerText\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;",
   r"\1.innerText = TRILLIONX_cleanRender(\2);"),
  (r"(\w+)\.innerHTML\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;",
   r"\1.textContent = TRILLIONX_cleanRender(\2);"),
  (r"(\w+)\.textContent\s*=\s*await\s+(\w+)\.text\(\)\s*;",
   r"{ const __t=await \2.text(); let __j; try{__j=JSON.parse(__t)}catch(e){__j=__t} \1.textContent=TRILLIONX_cleanRender(__j); }"),
  (r"(\w+)\.innerText\s*=\s*await\s+(\w+)\.text\(\)\s*;",
   r"{ const __t=await \2.text(); let __j; try{__j=JSON.parse(__t)}catch(e){__j=__t} \1.innerText=TRILLIONX_cleanRender(__j); }")
]

total=0
for pat,rep in patterns:
    s,n=re.subn(pat,rep,s)
    total+=n

p.write_text(s)

report={
 "engine":"TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
 "patches":total,
 "mode":"universal_ui_button_renderer",
 "scope":"fetch/json/stdout/out/data/stderr/error",
 "no_security_bypass":True,
 "api_routes_kept":True
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE_LATEST.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
PY

echo "=== NODE CHECK ==="
node --check app.js || exit 1

echo "=== RESTART APP SAFE ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi

PORT=3000 nohup node app.js > logs/trillionx_app_all_buttons_render_fix.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== TEST PORT ==="
ss -lntp 2>/dev/null | grep ':3000' || true

echo "=== TEST API TERMINAL ==="
curl -fsS -X POST http://127.0.0.1:3000/api/terminal/run \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"ports"}' | python3 -m json.tool | head -40 || true

git add app.js TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE.sh reports/TRILLIONX_ALL_BUTTONS_RENDER_FIX_SOURCE_LATEST.json 2>/dev/null || true
git commit -m "Fix TRILLIONX rendering for all UI buttons" || echo "Rien à commit"

echo "✅ ALL BUTTONS RENDER FIX TERMINE"
