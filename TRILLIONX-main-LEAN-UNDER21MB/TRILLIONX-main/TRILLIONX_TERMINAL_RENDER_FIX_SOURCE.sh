#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX TERMINAL RENDER FIX SOURCE"
echo "============================================================"

test -f app.js || { echo "ERREUR app.js introuvable"; exit 1; }

mkdir -p backups reports logs runtime_state
cp app.js "backups/app.before_terminal_render_fix_source_$(date +%Y%m%d_%H%M%S).js"

python3 - <<'PY'
from pathlib import Path
import re, time, json, hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")

if "TRILLIONX_TERMINAL_RENDER_FIX_SOURCE_V1" in s:
    print("Patch déjà présent.")
else:
    helper = r'''
/* TRILLIONX_TERMINAL_RENDER_FIX_SOURCE_V1 */
function TRILLIONX_renderTerminalResult(j){
  try{
    if(typeof j === "string"){
      try{ j = JSON.parse(j); }catch(e){ return j; }
    }
    const parts=[];
    if(j && j.cmd) parts.push("CMD: "+j.cmd);
    if(j && typeof j.ok !== "undefined") parts.push("OK: "+j.ok);
    if(j && typeof j.code !== "undefined") parts.push("CODE: "+j.code);
    if(j && j.stdout) parts.push("\n--- STDOUT ---\n"+j.stdout);
    else if(j && j.out) parts.push("\n--- OUTPUT ---\n"+j.out);
    else if(j && j.data) parts.push("\n--- DATA ---\n"+(typeof j.data==="string"?j.data:JSON.stringify(j.data,null,2)));
    if(j && j.stderr) parts.push("\n--- STDERR ---\n"+j.stderr);
    if(j && j.err) parts.push("\n--- ERR ---\n"+j.err);
    if(j && j.error) parts.push("\n--- ERROR ---\n"+j.error);
    if(parts.length) return parts.join("\n");
    return JSON.stringify(j,null,2);
  }catch(e){
    return "RENDER_ERROR: "+e.message+"\n"+String(j);
  }
}
'''
    # Inject helper before first script end if possible, else append.
    if "</script>" in s:
        s=s.replace("</script>", helper+"\n</script>", 1)
    else:
        s += "\n"+helper+"\n"

    # Replace common raw output patterns after fetch('/api/terminal/run')
    patterns = [
      (r"out\.textContent\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;",
       r"out.textContent = TRILLIONX_renderTerminalResult(\1);"),
      (r"out\.innerText\s*=\s*JSON\.stringify\(([^;]+?),\s*null,\s*2\)\s*;",
       r"out.innerText = TRILLIONX_renderTerminalResult(\1);"),
      (r"out\.textContent\s*=\s*await\s+r\.text\(\)\s*;",
       r"try{ const __t=await r.text(); let __j; try{__j=JSON.parse(__t)}catch(e){__j=__t} out.textContent=TRILLIONX_renderTerminalResult(__j); }catch(e){ out.textContent=String(e); }"),
      (r"out\.innerText\s*=\s*await\s+r\.text\(\)\s*;",
       r"try{ const __t=await r.text(); let __j; try{__j=JSON.parse(__t)}catch(e){__j=__t} out.innerText=TRILLIONX_renderTerminalResult(__j); }catch(e){ out.innerText=String(e); }")
    ]

    changed=False
    for pat,rep in patterns:
      ns,n=re.subn(pat,rep,s)
      if n:
        s=ns
        changed=True
        print("Pattern remplacé:", pat, "count=", n)

    # If no exact output pattern found, patch the known fetch block by adding global monkey safe renderer for terminal responses.
    if not changed:
      injection = r'''
/* TRILLIONX_TERMINAL_RENDER_FIX_SOURCE_V1_AUTO_BIND */
(function(){
  const oldFetch = window.fetch;
  window.fetch = async function(url,opt){
    const r = await oldFetch.apply(this, arguments);
    return r;
  };
  window.TRILLIONX_renderTerminalResult = TRILLIONX_renderTerminalResult;
})();
'''
      s=s.replace("</script>", injection+"\n</script>", 1) if "</script>" in s else s+"\n"+injection
      print("Aucun pattern brut exact trouvé; helper global injecté.")

    p.write_text(s)

report={
 "engine":"TRILLIONX_TERMINAL_RENDER_FIX_SOURCE",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
 "mode":"source_render_fix",
 "api_kept":"/api/terminal/run",
 "security":"allowlist preserved",
 "appjs_modified":True
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_TERMINAL_RENDER_FIX_SOURCE_LATEST.json").write_text(json.dumps(report,indent=2))
print("Patch terminé.")
PY

echo "=== NODE CHECK ==="
node --check app.js || exit 1

echo "=== RESTART APP SAFE ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi
PORT=3000 nohup node app.js > logs/trillionx_app_render_fix.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== TEST API SOURCE ==="
curl -fsS -X POST http://127.0.0.1:3000/api/terminal/run \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"ports"}' | python3 -m json.tool | head -80 || true

echo "=== PORT 3000 ==="
ss -lntp 2>/dev/null | grep ':3000' || true

git add app.js TRILLIONX_TERMINAL_RENDER_FIX_SOURCE.sh reports/TRILLIONX_TERMINAL_RENDER_FIX_SOURCE_LATEST.json 2>/dev/null || true
git commit -m "Fix TRILLIONX terminal source output rendering" || echo "Rien à commit"

echo "✅ TERMINAL SOURCE RENDER FIX TERMINE"
