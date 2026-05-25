#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX FIX DOUBLE JSON OUTPUT"
echo "============================================================"

test -f app.js || { echo "ERREUR app.js introuvable"; exit 1; }

mkdir -p backups logs reports runtime_state
cp app.js "backups/app.before_double_json_output_$(date +%Y%m%d_%H%M%S).js"

python3 - <<'PY'
from pathlib import Path
import re, json, time, hashlib

p=Path("app.js")
s=p.read_text(errors="ignore")

new_func=r'''function TX_LOAD_PARSE(v){
  for(let i=0;i<12;i++){
    if(typeof v!=="string") break;
    let t=v.trim();

    // Cas affiché: "{\"key\":\"value\"}" ou {\"key\":\"value\"}
    if(t.includes('\\"')){
      try{
        let u=t;
        if(!(u.startsWith('"') && u.endsWith('"'))) u='"'+u.replace(/"/g,'\\"')+'"';
        v=JSON.parse(u);
        continue;
      }catch(e){
        try{
          v=t.replace(/\\"/g,'"').replace(/\\\\n/g,"\n").replace(/\\n/g,"\n");
          continue;
        }catch(e2){}
      }
    }

    // JSON normal ou JSON-string
    if((t.startsWith("{")&&t.endsWith("}"))||(t.startsWith("[")&&t.endsWith("]"))||(t.startsWith('"')&&t.endsWith('"'))){
      try{ v=JSON.parse(t); continue; }catch(e){}
    }

    break;
  }
  return v;
}'''

# Remplace la fonction existante TX_LOAD_PARSE entière.
pat=r"function TX_LOAD_PARSE\(v\)\{.*?\n\}"
s2,n=re.subn(pat,new_func,s, count=1, flags=re.S)

if n==0:
    # fallback : injecte avant TX_LOAD_RENDER
    s2=s.replace("function TX_LOAD_RENDER(v){", new_func+"\nfunction TX_LOAD_RENDER(v){",1)
    n=1 if s2!=s else 0

p.write_text(s2)

report={
 "engine":"TRILLIONX_FIX_DOUBLE_JSON_OUTPUT",
 "time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
 "patched":bool(n),
 "target":"TX_LOAD_PARSE double encoded JSON strings",
 "policy":"UI render only"
}
report["seal"]=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
Path("reports/TRILLIONX_FIX_DOUBLE_JSON_OUTPUT_LATEST.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
PY

echo "=== NODE CHECK ==="
if ! node --check app.js; then
  echo "ROLLBACK"
  cp "$(ls -t backups/app.before_double_json_output_*.js | head -1)" app.js
  node --check app.js
  exit 1
fi

echo "=== RESTART APP ==="
PID=""
if [ -f runtime_state/TRILLIONX_MAIN_PID ]; then PID="$(cat runtime_state/TRILLIONX_MAIN_PID 2>/dev/null || true)"; fi
if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; sleep 1; fi
PORT=3000 nohup node app.js > logs/trillionx_app_double_json_output.log 2>&1 &
echo $! > runtime_state/TRILLIONX_MAIN_PID
sleep 2

echo "=== CHECK ==="
grep -n "function TX_LOAD_PARSE" app.js | head
ss -lntp 2>/dev/null | grep ':3000' || true
df -P . | awk 'NR==2{gsub("%","",$5);print "Disk used="$5"% remaining="100-$5"%"}'

git add app.js TRILLIONX_FIX_DOUBLE_JSON_OUTPUT.sh reports/TRILLIONX_FIX_DOUBLE_JSON_OUTPUT_LATEST.json 2>/dev/null || true
git commit -m "Fix TRILLIONX double encoded JSON output" || echo "Rien à commit"

echo "✅ DOUBLE JSON OUTPUT FIX TERMINE"
