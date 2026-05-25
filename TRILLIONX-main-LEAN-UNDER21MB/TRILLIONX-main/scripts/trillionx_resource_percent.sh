#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

mkdir -p reports history

echo "============================================================"
echo " TRILLIONX RESOURCE % CHECK"
echo "============================================================"

node - <<'NODE'
const os=require("os"),fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const r=x=>Number.isFinite(x)?+x.toFixed(2):0;
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim()}catch{return ""}};
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");

function disk(){
  const out=sh("df -P . | tail -1").split(/\s+/);
  const size=+out[1], used=+out[2], avail=+out[3], pct=parseFloat((out[4]||"0").replace("%",""));
  return {mount:out[5]||".", total_gb:r(size/1048576), used_gb:r(used/1048576), free_gb:r(avail/1048576), used_pct:r(pct), free_pct:r(100-pct)};
}

function mem(){
  const total=os.totalmem(), free=os.freemem(), used=total-free;
  const p=process.memoryUsage();
  return {
    total_gb:r(total/1073741824),
    used_gb:r(used/1073741824),
    free_gb:r(free/1073741824),
    used_pct:r(used/total*100),
    free_pct:r(free/total*100),
    process_rss_mb:r(p.rss/1048576),
    process_heap_mb:r(p.heapUsed/1048576)
  };
}

function cpu(){
  const cpus=os.cpus()||[];
  const load=os.loadavg();
  const logical=cpus.length||1;
  const load_pct=r(Math.min(100,(load[0]/logical)*100));
  const ghz=r((cpus.map(c=>c.speed||0).reduce((a,b)=>a+b,0)/(logical||1))/1000);
  return {
    model:cpus[0]?.model||"unknown",
    logical_cpu:logical,
    ghz_detected:ghz,
    load_1m:r(load[0]),
    load_5m:r(load[1]),
    load_15m:r(load[2]),
    load_pct_estimated:load_pct,
    free_capacity_pct_estimated:r(100-load_pct)
  };
}

const report={
  engine:"TRILLIONX_RESOURCE_PERCENT_CHECK",
  time:new Date().toISOString(),
  cpu:cpu(),
  memory:mem(),
  disk:disk()
};

report.health={
  cpu: report.cpu.load_pct_estimated<70 ? "OK" : report.cpu.load_pct_estimated<90 ? "HIGH" : "CRITICAL",
  memory: report.memory.used_pct<70 ? "OK" : report.memory.used_pct<90 ? "HIGH" : "CRITICAL",
  disk: report.disk.used_pct<70 ? "OK" : report.disk.used_pct<90 ? "HIGH" : "CRITICAL"
};

report.seal=sha(report);
fs.writeFileSync("reports/TRILLIONX_RESOURCE_PERCENT_LATEST.json",JSON.stringify(report,null,2));
fs.appendFileSync("history/TRILLIONX_RESOURCE_PERCENT_HISTORY.jsonl",JSON.stringify({
  time:report.time,
  cpu_pct:report.cpu.load_pct_estimated,
  ram_pct:report.memory.used_pct,
  disk_pct:report.disk.used_pct,
  health:report.health,
  seal:report.seal
})+"\n");

console.log("");
console.log("CPU utilisé estimé      : "+report.cpu.load_pct_estimated+" %");
console.log("CPU libre estimé        : "+report.cpu.free_capacity_pct_estimated+" %");
console.log("RAM utilisée            : "+report.memory.used_pct+" %");
console.log("RAM libre               : "+report.memory.free_pct+" %");
console.log("Disque utilisé          : "+report.disk.used_pct+" %");
console.log("Disque libre            : "+report.disk.free_pct+" %");
console.log("");
console.log("CPU health              : "+report.health.cpu);
console.log("RAM health              : "+report.health.memory);
console.log("DISK health             : "+report.health.disk);
console.log("");
console.log("Rapport                 : reports/TRILLIONX_RESOURCE_PERCENT_LATEST.json");
NODE

echo "============================================================"
echo " TOP DOSSIERS"
echo "============================================================"
du -h -d 1 . 2>/dev/null | sort -h | tail -20
