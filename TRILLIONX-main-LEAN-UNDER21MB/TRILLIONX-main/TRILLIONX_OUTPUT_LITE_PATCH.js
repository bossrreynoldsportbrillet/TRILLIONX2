const fs=require("fs");
const p="app.js";
let s=fs.readFileSync(p,"utf8");

const patch=`
/* ============================================================
   TRILLIONX_OUTPUT_LITE_ROUTES_V1
   Objectif: sortie courte pour mobile/Codespaces.
   Le dump complet reste accessible seulement via fichiers data.
============================================================ */
function txLiteNumber(x,d=3){ return Number.isFinite(+x)?Number(+x).toFixed(d):x; }
function txLiteSystem(){
  const os=require("os"), fs=require("fs"), cp=require("child_process");
  let load=os.loadavg();
  let memTotal=os.totalmem()/1024/1024/1024;
  let memFree=os.freemem()/1024/1024/1024;
  let git="unavailable";
  try{ git=cp.execSync("git log --oneline -3",{timeout:1200}).toString().trim(); }catch(e){}
  let files=0, size="unavailable";
  try{ files=cp.execSync("find . -type f | wc -l",{timeout:1500}).toString().trim(); }catch(e){}
  try{ size=cp.execSync("du -sh . | cut -f1",{timeout:1500}).toString().trim(); }catch(e){}
  return {
    engine:"TRILLIONX_OUTPUT_LITE_ROUTES_V1",
    time:new Date().toISOString(),
    port:process.env.PORT||3000,
    node:process.version,
    cpu:os.cpus()[0]?.model||"unknown",
    cores:os.cpus().length,
    load_1m:txLiteNumber(load[0]),
    ram_total_gb:txLiteNumber(memTotal),
    ram_free_gb:txLiteNumber(memFree),
    repo_files:Number(files)||files,
    repo_size:size,
    gpu:"UNAVAILABLE_IN_CODESPACES",
    openxr:"UNAVAILABLE_IN_CODESPACES",
    verdict:"RUNNING_REAL_CPU_BACKEND_OUTPUT_LITE",
    git_last3:git.split("\\n")
  };
}

if (typeof app !== "undefined" && app && app.get && !global.TRILLIONX_OUTPUT_LITE_ROUTES_V1){
  global.TRILLIONX_OUTPUT_LITE_ROUTES_V1=true;

  app.get("/api/snapshot-lite",(req,res)=>{
    res.json(txLiteSystem());
  });

  app.get("/api/mobile-health",(req,res)=>{
    const x=txLiteSystem();
    res.type("text/plain").send(
      "TRILLIONX MOBILE HEALTH\\n"+
      "STATUS: OK\\n"+
      "CPU: "+x.cpu+"\\n"+
      "CORES: "+x.cores+"\\n"+
      "RAM: "+x.ram_free_gb+" free / "+x.ram_total_gb+" GB\\n"+
      "LOAD 1M: "+x.load_1m+"\\n"+
      "REPO: "+x.repo_size+" / "+x.repo_files+" files\\n"+
      "GPU: "+x.gpu+"\\n"+
      "OPENXR: "+x.openxr+"\\n"+
      "VERDICT: "+x.verdict+"\\n"
    );
  });

  app.get("/api/safe-shell-lite",(req,res)=>{
    const cp=require("child_process");
    const cmds=[
      "echo TRILLIONX_SAFE_SHELL_LITE",
      "date -u",
      "free -h | head -3",
      "df -h . | tail -1",
      "ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -12",
      "git status --short | head -30",
      "git log --oneline -5"
    ].join(" && ");
    cp.exec(cmds,{timeout:8000,maxBuffer:1024*128},(e,out,err)=>{
      res.type("text/plain").send((out||"")+(err?("\\nERR:\\n"+err):""));
    });
  });
}
`;

if(!s.includes("TRILLIONX_OUTPUT_LITE_ROUTES_V1")){
  const idx=s.lastIndexOf("app.listen");
  if(idx>0) s=s.slice(0,idx)+patch+"\n"+s.slice(idx);
  else s+="\n"+patch+"\n";
}

fs.writeFileSync(p,s);
console.log("PATCH OK: routes /api/snapshot-lite /api/mobile-health /api/safe-shell-lite");
