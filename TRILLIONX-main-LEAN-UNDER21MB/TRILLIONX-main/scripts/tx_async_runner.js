"use strict";
const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),path=require("path");
const ROOT="/workspaces/TRILLIONX";
const Q=path.join(ROOT,"async_queue");
const JOBS=path.join(ROOT,"async_jobs");
const RES=path.join(ROOT,"async_results");
const LOGS=path.join(ROOT,"logs");
for(const d of [Q,JOBS,RES,LOGS]) fs.mkdirSync(d,{recursive:true});
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const safeCmds={
  resource:"bash scripts/trillionx_resource_percent.sh",
  disk:"bash scripts/trillionx_disk_guard_safe.sh",
  status:"bash scripts/tx_process_status.sh",
  appcheck:"node --check app.js",
  startnice:"bash scripts/tx_start_nice.sh",
  stop:"bash scripts/tx_stop.sh",
  logrotate:"bash scripts/tx_log_rotate.sh"
};
function latestJob(){
  return fs.readdirSync(Q).filter(f=>f.endsWith(".json")).sort()[0];
}
function runJob(file){
  const p=path.join(Q,file);
  const job=JSON.parse(fs.readFileSync(p,"utf8"));
  const id=job.id||file.replace(".json","");
  const cmd=safeCmds[job.type];
  const started=new Date().toISOString();
  const log=path.join(LOGS,`tx_async_${id}.log`);
  const out={id,type:job.type,cmd:cmd||null,started,status:"RUNNING",log};
  fs.writeFileSync(path.join(JOBS,`${id}.running.json`),JSON.stringify(out,null,2));
  fs.unlinkSync(p);
  if(!cmd){
    out.status="REJECTED_UNKNOWN_JOB";
    out.finished=new Date().toISOString();
    out.seal=sha(out);
    fs.writeFileSync(path.join(RES,`${id}.json`),JSON.stringify(out,null,2));
    return;
  }
  try{
    cp.execSync(cmd,{cwd:ROOT,stdio:["ignore",fs.openSync(log,"a"),fs.openSync(log,"a")],timeout:1000*60*10});
    out.status="DONE";
  }catch(e){
    out.status="FAILED_OR_TIMEOUT";
    out.error=String(e.message||e);
  }
  out.finished=new Date().toISOString();
  out.seal=sha(out);
  try{fs.unlinkSync(path.join(JOBS,`${id}.running.json`));}catch{}
  fs.writeFileSync(path.join(RES,`${id}.json`),JSON.stringify(out,null,2));
}
function loop(){
  const f=latestJob();
  if(f) runJob(f);
}
if(process.argv[2]==="once") loop();
else setInterval(loop,1500);
