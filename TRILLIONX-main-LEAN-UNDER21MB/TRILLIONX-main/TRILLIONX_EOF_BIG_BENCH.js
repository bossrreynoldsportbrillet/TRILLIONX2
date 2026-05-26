"use strict";

/*
TRILLIONX EOF BIG BENCH
Autonome, honnête, réel seulement.
Objectif : détecter + benchmark CPU/RAM/I/O/crypto/latence/orchestration.
Sortie : runtime_state/trillionx_eof_big_bench_last.json
*/

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");
const {execSync}=require("child_process");

const OUT_DIR="runtime_state";
const OUT_FILE=OUT_DIR+"/trillionx_eof_big_bench_last.json";
fs.mkdirSync(OUT_DIR,{recursive:true});

const now=()=>new Date().toISOString();
const gb=x=>+(x/1024/1024/1024).toFixed(3);
const mb=x=>+(x/1024/1024).toFixed(3);
const safe=cmd=>{try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:4000}).trim()}catch{return"UNAVAILABLE"}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function detect(){
 const cpu=os.cpus()||[];
 const cpuinfo=safe("cat /proc/cpuinfo");
 return {
  timestamp:now(),
  cwd:process.cwd(),
  node:process.version,
  platform:process.platform,
  arch:os.arch(),
  hostname:os.hostname(),
  codespaces:!!process.env.CODESPACES,
  cpu_model:cpu[0]?.model||"UNAVAILABLE",
  threads:cpu.length,
  cpu_speed_mhz:cpu[0]?.speed||0,
  loadavg:os.loadavg(),
  ram_total_gb:gb(os.totalmem()),
  ram_free_gb:gb(os.freemem()),
  simd:{
   sse:/sse/.test(cpuinfo),
   avx:/ avx /.test(cpuinfo),
   avx2:/ avx2 /.test(cpuinfo),
   avx512:/avx512/.test(cpuinfo)
  },
  cgroup_cpu:safe("cat /sys/fs/cgroup/cpu.max"),
  cgroup_mem:safe("cat /sys/fs/cgroup/memory.max"),
  disk:safe("df -h ."),
  gpu:safe("nvidia-smi"),
  thermal:safe("cat /sys/class/thermal/thermal_zone0/temp"),
  policy:"REAL_ONLY_OR_UNAVAILABLE"
 };
}

async function benchCPU(ms=2500){
 const end=performance.now()+ms;
 let n=0,x=0.000001;
 while(performance.now()<end){
  x=Math.sin(x)+Math.cos(x)+Math.sqrt(x+1.000001);
  n++;
 }
 return {duration_ms:ms, iterations:n, iterations_per_sec:Math.round(n/(ms/1000)), checksum:+x.toFixed(9)};
}

function benchCrypto(rounds=120000){
 const t0=performance.now();
 let h=Buffer.alloc(32,1);
 for(let i=0;i<rounds;i++) h=crypto.createHash("sha256").update(h).digest();
 const dt=performance.now()-t0;
 return {algo:"sha256_chain", rounds, duration_ms:+dt.toFixed(3), hashes_per_sec:Math.round(rounds/(dt/1000)), digest:h.toString("hex")};
}

function benchRAM(mbSize=128){
 const size=mbSize*1024*1024;
 const b=Buffer.alloc(size,7);
 const t0=performance.now();
 let s=0;
 for(let i=0;i<size;i+=4096) s=(s+b[i])&0xffffffff;
 const dt=performance.now()-t0;
 return {size_mb:mbSize, duration_ms:+dt.toFixed(3), sampled_pages:Math.floor(size/4096), scan_mb_sec:+(mbSize/(dt/1000)).toFixed(2), checksum:s};
}

function benchIO(mbSize=128){
 const file=OUT_DIR+"/eof_io_test.bin";
 const data=crypto.randomBytes(1024*1024);
 let t0=performance.now();
 const fd=fs.openSync(file,"w");
 for(let i=0;i<mbSize;i++) fs.writeSync(fd,data);
 fs.closeSync(fd);
 let writeMs=performance.now()-t0;
 t0=performance.now();
 const r=fs.readFileSync(file);
 let readMs=performance.now()-t0;
 fs.unlinkSync(file);
 return {
  size_mb:mbSize,
  write_ms:+writeMs.toFixed(3),
  read_ms:+readMs.toFixed(3),
  write_mb_sec:+(mbSize/(writeMs/1000)).toFixed(2),
  read_mb_sec:+(mbSize/(readMs/1000)).toFixed(2),
  checksum:crypto.createHash("sha256").update(r.subarray(0,1024*1024)).digest("hex")
 };
}

async function benchLatency(samples=2000){
 const arr=[];
 for(let i=0;i<samples;i++){
  const t0=performance.now();
  await Promise.resolve();
  arr.push(performance.now()-t0);
 }
 arr.sort((a,b)=>a-b);
 const q=p=>+arr[Math.floor(arr.length*p)].toFixed(6);
 return {samples,p50_ms:q(.5),p95_ms:q(.95),p99_ms:q(.99),max_ms:+arr[arr.length-1].toFixed(6)};
}

async function benchOrchestration(jobs=5000){
 const t0=performance.now();
 let done=0;
 await Promise.all(Array.from({length:jobs},(_,i)=>new Promise(res=>{
  setImmediate(()=>{crypto.createHash("sha1").update(String(i)).digest("hex");done++;res()});
 })));
 const dt=performance.now()-t0;
 return {jobs,done,duration_ms:+dt.toFixed(3),jobs_per_sec:Math.round(done/(dt/1000))};
}

function grade(report){
 const s={
  cpu:report.cpu.iterations_per_sec,
  crypto:report.crypto.hashes_per_sec,
  ram:report.ram.scan_mb_sec,
  io:(report.io.write_mb_sec+report.io.read_mb_sec)/2,
  jobs:report.orchestration.jobs_per_sec
 };
 const score=Math.round(
  Math.log10(1+s.cpu)*180+
  Math.log10(1+s.crypto)*160+
  Math.log10(1+s.ram)*140+
  Math.log10(1+s.io)*120+
  Math.log10(1+s.jobs)*160
 );
 return {
  score,
  class:score<1500?"NUC_OR_SMALL_VM":score<2300?"WORKSTATION_VM":score<3200?"STRONG_NODE_VM":"HIGH_NODE_VM",
  honesty:"Score relatif TRILLIONX EOF, pas comparaison directe supercalculateur."
 };
}

(async()=>{
 console.log("=== TRILLIONX EOF BIG BENCH START ===");
 const report={detect:detect()};
 report.cpu=await benchCPU(3000);
 report.crypto=benchCrypto(150000);
 report.ram=benchRAM(128);
 report.io=benchIO(128);
 report.latency=await benchLatency(3000);
 report.orchestration=await benchOrchestration(8000);
 report.grade=grade(report);
 report.finished_at=now();

 fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 console.log("\nRESULT FILE:",OUT_FILE);
 console.log("=== TRILLIONX EOF BIG BENCH END ===");
})();
