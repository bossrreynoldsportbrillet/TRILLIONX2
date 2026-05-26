"use strict";
const fs=require("fs"),os=require("os"),crypto=require("crypto"),net=require("net"),cp=require("child_process");
const {performance}=require("perf_hooks");

const OUT="reports/TRILLIONX_CODESPACES_WORKSPACE_BENCH_LATEST.json";
const HIST="history/TRILLIONX_CODESPACES_WORKSPACE_BENCH_HISTORY.jsonl";
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2500}).trim()}catch{return""}};
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");

function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}
function kv(k,v,u=""){console.log(String(k).padEnd(32," ")+": "+String(v)+(u?" "+u:""))}

function host(){
 const c=os.cpus()||[], sp=c.map(x=>x.speed||0).filter(Boolean);
 return {
  time:new Date().toISOString(),
  hostname:os.hostname(),
  platform:os.platform(),
  arch:os.arch(),
  node:process.version,
  npm:sh("npm --version")||"unavailable",
  git:sh("git --version")||"unavailable",
  cpu:c[0]?.model||"unknown",
  logical_cpu:c.length,
  ghz:r((sp.reduce((a,b)=>a+b,0)/(sp.length||1))/1000),
  load:os.loadavg().map(r),
  ram_total_gb:r(os.totalmem()/1073741824),
  ram_free_gb:r(os.freemem()/1073741824)
 };
}

function disk(){
 const o=sh("df -P . | tail -1").split(/\s+/);
 const size=+o[1]||0, used=+o[2]||0, free=+o[3]||0, pct=parseFloat((o[4]||"0").replace("%",""))||0;
 return {total_gb:r(size/1048576),used_gb:r(used/1048576),free_gb:r(free/1048576),used_pct:r(pct),free_pct:r(100-pct),mount:o[5]||"."};
}

function countFiles(){
 const dirs=[".","data","runtime_state","reports","history","logs","benchmarks","node_modules",".git","raid60_plus"];
 const out={};
 for(const d of dirs){
  if(fs.existsSync(d)){
   const files=sh(`find ${d} -type f 2>/dev/null | wc -l`);
   const size=sh(`du -sh ${d} 2>/dev/null | awk '{print $1}'`);
   out[d]={files:Number(files)||0,size:size||"0"};
  }
 }
 return out;
}

function cpuHash(ms=800){
 const end=performance.now()+ms;
 let ops=0, bytes=0, seed=crypto.randomBytes(1024*256);
 while(performance.now()<end){
  seed=crypto.createHash("sha256").update(seed).digest();
  ops++; bytes+=1024*256;
 }
 return {ops,ops_s:r(ops/(ms/1000)),mb_s:r((bytes/1048576)/(ms/1000))};
}

function cryptoAes(ms=800){
 const end=performance.now()+ms, key=crypto.randomBytes(32), iv=crypto.randomBytes(16), buf=crypto.randomBytes(1024*512);
 let ops=0, bytes=0;
 while(performance.now()<end){
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  Buffer.concat([c.update(buf),c.final()]);
  ops++; bytes+=buf.length;
 }
 return {ops,ops_s:r(ops/(ms/1000)),mb_s:r((bytes/1048576)/(ms/1000))};
}

function jsonBench(ms=800){
 const obj={engine:"TRILLIONX",arr:Array.from({length:2000},(_,i)=>({i,v:crypto.randomBytes(8).toString("hex"),n:i*i%9973}))};
 const end=performance.now()+ms;
 let ops=0, bytes=0;
 while(performance.now()<end){
  const s=JSON.stringify(obj); JSON.parse(s);
  ops++; bytes+=s.length;
 }
 return {ops,ops_s:r(ops/(ms/1000)),mb_s:r((bytes/1048576)/(ms/1000))};
}

function fileIO(){
 const file="benchmarks/.tx_io_test.bin";
 const buf=crypto.randomBytes(8*1024*1024);
 let t0=performance.now();
 fs.writeFileSync(file,buf);
 const writeMs=performance.now()-t0;
 t0=performance.now();
 const b=fs.readFileSync(file);
 const readMs=performance.now()-t0;
 fs.unlinkSync(file);
 return {
  size_mb:8,
  write_ms:r(writeMs),
  read_ms:r(readMs),
  write_mb_s:r(8/(writeMs/1000)),
  read_mb_s:r(8/(readMs/1000)),
  checksum:crypto.createHash("sha256").update(b).digest("hex").slice(0,16)
 };
}

function tcp(port,timeout=250){
 return new Promise(res=>{
  const t0=performance.now(), s=net.createConnection({host:"127.0.0.1",port});
  let done=false;
  const fin=o=>{if(done)return;done=true;try{s.destroy()}catch{}res({port,ms:r(performance.now()-t0),...o})};
  s.setTimeout(timeout);
  s.on("connect",()=>fin({open:true}));
  s.on("timeout",()=>fin({open:false,error:"TIMEOUT"}));
  s.on("error",e=>fin({open:false,error:e.code||e.message}));
 });
}

async function ports(){
 const list=[3000,3997,9229,20000,20001,20002,20003,3099,3100,8080];
 const out=[];
 for(const p of list) out.push(await tcp(p));
 return out;
}

(async()=>{
 title("TRILLIONX CODESPACES WORKSPACE BENCH");

 const h=host(), d=disk(), files=countFiles();
 kv("CPU",h.cpu);
 kv("Logical CPU",h.logical_cpu);
 kv("GHz",h.ghz,"GHz");
 kv("RAM free",h.ram_free_gb,"GB");
 kv("Disk used",d.used_pct,"%");

 title("BENCH RUN");
 const hash=cpuHash();
 kv("SHA256",hash.mb_s,"MB/s");

 const aes=cryptoAes();
 kv("AES256",aes.mb_s,"MB/s");

 const json=jsonBench();
 kv("JSON",json.ops_s,"ops/s");

 const fio=fileIO();
 kv("File write",fio.write_mb_s,"MB/s");
 kv("File read",fio.read_mb_s,"MB/s");

 const p=await ports();
 const open=p.filter(x=>x.open).map(x=>x.port);
 kv("Ports open",open.join(", ")||"none");

 const score=r(
  hash.mb_s*1.4+
  aes.mb_s*1.2+
  json.ops_s*0.8+
  fio.write_mb_s*0.7+
  fio.read_mb_s*0.7+
  open.length*20+
  Math.max(0,100-d.used_pct)*2+
  h.ram_free_gb*10
 );

 const health={
  cpu:h.load[0]<(h.logical_cpu*1.5)?"OK":"HIGH",
  memory:h.ram_free_gb>1?"OK":"LOW",
  disk:d.used_pct<80?"OK":d.used_pct<92?"HIGH":"CRITICAL",
  ports:open.includes(3000)?"APP3000_OPEN":"APP3000_CLOSED_OR_IDLE"
 };

 const report={
  engine:"TRILLIONX_CODESPACES_WORKSPACE_BENCH",
  time:new Date().toISOString(),
  scope:"CODESPACES_WORKSPACE_REAL_HOST",
  host:h,
  disk:d,
  files,
  bench:{sha256:hash,aes256:aes,json,file_io:fio,ports:p},
  summary:{
    score,
    open_ports:open,
    health,
    verdict:"CODESPACES_WORKSPACE_BENCH_COMPLETE"
  },
  truth_policy:{
    real_only:true,
    measures_codespaces_host:true,
    not_fake_threadripper:true,
    not_fake_exascale:true,
    no_destructive_actions:true
  }
 };
 report.seal=sha(report);
 fs.writeFileSync(OUT,JSON.stringify(report,null,2));
 fs.appendFileSync(HIST,JSON.stringify({time:report.time,score,health,seal:report.seal})+"\n");

 title("FINAL RESULT");
 kv("Score",score);
 kv("CPU health",health.cpu);
 kv("RAM health",health.memory);
 kv("Disk health",health.disk);
 kv("Port 3000",health.ports);
 kv("Seal",report.seal);
 kv("Report",OUT);
})();
