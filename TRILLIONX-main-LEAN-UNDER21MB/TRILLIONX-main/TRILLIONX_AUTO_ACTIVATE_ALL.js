"use strict";
/* TRILLIONX AUTO ACTIVATE ALL — Termux-safe variant
   REAL_ONLY_OR_UNAVAILABLE
   APP_BOOT désactivé (TX3 déjà actif via process externe) */
const os=require("os"),fs=require("fs"),crypto=require("crypto"),{execSync}=require("child_process");
const SAFE=(c)=>{try{return execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000}).trim()}catch{return "UNAVAILABLE"}};
const REPORT={
  timestamp:new Date().toISOString(),
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  actions:[],detected:{},activated:{},
  honesty:{fake_power:false,fake_gpu:false,fake_ram:false,policy:"REAL_ONLY_OR_UNAVAILABLE",no_auto_spawn:true}
};
function ACT(name,fn){
  try{const r=fn();REPORT.actions.push({module:name,status:"ACTIVE",result:r});REPORT.activated[name]=true;}
  catch(e){REPORT.actions.push({module:name,status:"FAILED",error:String(e)});REPORT.activated[name]=false;}
}
const cpuinfo=SAFE("cat /proc/cpuinfo");
REPORT.detected={
  cpu:os.cpus()?.[0]?.model||"UNAVAILABLE",
  threads:os.cpus()?.length||0,
  ram_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
  platform:process.platform,
  termux:!!process.env.TERMUX_VERSION,
  android:SAFE("getprop ro.product.model"),
  avx:/ avx /.test(cpuinfo),avx2:/ avx2 /.test(cpuinfo),avx512:/avx512/.test(cpuinfo),
  neon:/neon/.test(cpuinfo),asimd:/asimd/.test(cpuinfo),
  thermal:SAFE("cat /sys/class/thermal/thermal_zone0/temp"),
  disk:SAFE("df -h $HOME | tail -1")
};
ACT("UV_THREADPOOL",()=>{process.env.UV_THREADPOOL_SIZE=String(Math.max(4,Math.min(os.cpus().length,64)));return process.env.UV_THREADPOOL_SIZE;});
ACT("NODE_MEMORY",()=>{process.env.NODE_OPTIONS="--max-old-space-size=4096";return process.env.NODE_OPTIONS;});
ACT("RUNTIME_STATE",()=>{
  ["runtime_state","runtime_state/cache","runtime_state/jobs","runtime_state/bench","runtime_state/registry"].forEach(d=>fs.mkdirSync(d,{recursive:true}));
  return "DIRECTORIES_READY";
});
ACT("CPU_PARALLELISM",()=>({detected_threads:os.cpus().length,scheduler_mode:"AUTO"}));
ACT("SIMD_DETECTION",()=>({avx:REPORT.detected.avx,avx2:REPORT.detected.avx2,avx512:REPORT.detected.avx512,neon:REPORT.detected.neon,asimd:REPORT.detected.asimd}));
ACT("NETWORK_STACK",()=>({hostname:os.hostname(),interfaces:Object.keys(os.networkInterfaces())}));
ACT("CACHE_LAYER",()=>{global.TRILLIONX_CACHE={sha:new Map(),jobs:new Map(),telemetry:[]};return "CACHE_READY";});
ACT("JOB_ENGINE",()=>{global.TRILLIONX_JOBS=[];return "JOB_QUEUE_READY";});
ACT("AUTO_HASH_ENGINE",()=>({algo:"sha256",sample:crypto.createHash("sha256").update(String(Date.now())).digest("hex").slice(0,32)}));
ACT("AUTO_IO_TEST",()=>{
  const f="runtime_state/io_test.bin";
  fs.writeFileSync(f,crypto.randomBytes(1024*1024));
  const s=fs.statSync(f).size;
  fs.unlinkSync(f);
  return {write_test:"OK",size:s};
});
ACT("THERMAL_CHECK",()=>REPORT.detected.thermal);
ACT("SYSTEM_LOAD",()=>({loadavg:os.loadavg(),freemem_mb:+(os.freemem()/1024/1024).toFixed(2)}));
ACT("AUTO_BENCH_LIGHT",()=>{
  let n=0;const t=Date.now()+800;
  while(Date.now()<t){Math.sqrt(n*n+1);n++;}
  return {duration_sec:0.8,iterations:n,ops_per_sec:Math.round(n/0.8)};
});
ACT("TX3_DETECTION",()=>{
  const tx3pid=SAFE("pgrep -f 'node app.js' | head -1");
  if(tx3pid && tx3pid !== "UNAVAILABLE"){
    const uptime=SAFE(`ps -o etime= -p ${tx3pid} | tr -d ' '`);
    return {status:"TX3_ALREADY_RUNNING",pid:tx3pid,uptime,note:"APP_BOOT skipped to preserve existing process"};
  }
  return {status:"TX3_NOT_DETECTED",note:"Use start_trillionx.sh to launch manually"};
});
ACT("AUTO_LOGGER",()=>{
  fs.writeFileSync("runtime_state/TRILLIONX_AUTO_ACTIVATE_REPORT.json",JSON.stringify(REPORT,null,2));
  return "REPORT_WRITTEN";
});
console.log("=== TRILLIONX AUTO ACTIVATE ALL (Termux-safe) ===");
console.log("Actions:",REPORT.actions.filter(a=>a.status==="ACTIVE").length,"/",REPORT.actions.length,"successful");
console.log("CPU:",REPORT.detected.threads,"threads | NEON:",REPORT.detected.neon,"| Platform:",REPORT.detected.android||REPORT.detected.platform);
const tx3=REPORT.actions.find(a=>a.module==="TX3_DETECTION");
if(tx3) console.log("TX3:",tx3.result.status,tx3.result.pid?"PID="+tx3.result.pid:"",tx3.result.uptime?"uptime="+tx3.result.uptime:"");
console.log("Report: runtime_state/TRILLIONX_AUTO_ACTIVATE_REPORT.json");
console.log("REAL_ONLY_OR_UNAVAILABLE | NO_AUTO_SPAWN");
