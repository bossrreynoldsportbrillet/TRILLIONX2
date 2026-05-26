"use strict";

/*
TRILLIONX AUTO ACTIVATE ALL
REAL_ONLY_OR_UNAVAILABLE
Détection -> activation -> optimisation légère automatique
Aucune fausse ressource.
*/

const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const {execSync,spawn}=require("child_process");

const SAFE=(cmd)=>{
 try{
  return execSync(cmd,{
   encoding:"utf8",
   stdio:["ignore","pipe","ignore"],
   timeout:5000
  }).trim();
 }catch{
  return "UNAVAILABLE";
 }
};

const REPORT={
 timestamp:new Date().toISOString(),
 actions:[],
 detected:{},
 activated:{},
 honesty:{
  fake_power:false,
  fake_gpu:false,
  fake_ram:false,
  policy:"REAL_ONLY_OR_UNAVAILABLE"
 }
};

function ACT(name,fn){
 try{
  const r=fn();
  REPORT.actions.push({
   module:name,
   status:"ACTIVE",
   result:r
  });
  REPORT.activated[name]=true;
 }catch(e){
  REPORT.actions.push({
   module:name,
   status:"FAILED",
   error:String(e)
  });
  REPORT.activated[name]=false;
 }
}

function DETECT(){

 const cpuinfo=SAFE("cat /proc/cpuinfo");

 REPORT.detected={
  cpu:os.cpus()?.[0]?.model||"UNAVAILABLE",
  threads:os.cpus()?.length||0,
  ram_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
  platform:process.platform,
  codespaces:!!process.env.CODESPACES,
  docker:fs.existsSync("/.dockerenv"),
  avx:/ avx /.test(cpuinfo),
  avx2:/ avx2 /.test(cpuinfo),
  avx512:/avx512/.test(cpuinfo),
  gpu:SAFE("nvidia-smi"),
  thermal:SAFE("cat /sys/class/thermal/thermal_zone0/temp"),
  disk:SAFE("df -h ."),
  network:SAFE("ip route")
 };
}

DETECT();

/* =========================
   AUTO ACTIVATION
========================= */

ACT("UV_THREADPOOL",()=>{
 process.env.UV_THREADPOOL_SIZE=
  String(Math.max(4,Math.min(os.cpus().length,64)));
 return process.env.UV_THREADPOOL_SIZE;
});

ACT("NODE_MEMORY",()=>{
 process.env.NODE_OPTIONS="--max-old-space-size=8192";
 return process.env.NODE_OPTIONS;
});

ACT("RUNTIME_STATE",()=>{
 fs.mkdirSync("runtime_state",{recursive:true});
 fs.mkdirSync("runtime_state/cache",{recursive:true});
 fs.mkdirSync("runtime_state/jobs",{recursive:true});
 fs.mkdirSync("runtime_state/bench",{recursive:true});
 return "DIRECTORIES_READY";
});

ACT("CPU_PARALLELISM",()=>{
 return {
  detected_threads:os.cpus().length,
  scheduler_mode:"AUTO"
 };
});

ACT("SIMD_DETECTION",()=>{
 return {
  avx:REPORT.detected.avx,
  avx2:REPORT.detected.avx2,
  avx512:REPORT.detected.avx512
 };
});

ACT("NETWORK_STACK",()=>{
 return {
  hostname:os.hostname(),
  interfaces:Object.keys(os.networkInterfaces())
 };
});

ACT("CACHE_LAYER",()=>{
 global.TRILLIONX_CACHE={
  sha:new Map(),
  jobs:new Map(),
  telemetry:[]
 };
 return "CACHE_READY";
});

ACT("JOB_ENGINE",()=>{
 global.TRILLIONX_JOBS=[];
 return "JOB_QUEUE_READY";
});

ACT("AUTO_HASH_ENGINE",()=>{

 let h=crypto.createHash("sha256")
 .update(String(Date.now()))
 .digest("hex");

 return {
  algo:"sha256",
  sample:h
 };
});

ACT("AUTO_IO_TEST",()=>{

 const file="runtime_state/io_test.bin";

 fs.writeFileSync(file,crypto.randomBytes(1024*1024));

 const s=fs.statSync(file);

 fs.unlinkSync(file);

 return {
  write_test:"OK",
  size:s.size
 };
});

ACT("THERMAL_CHECK",()=>{
 return REPORT.detected.thermal;
});

ACT("GPU_CHECK",()=>{
 return REPORT.detected.gpu;
});

ACT("SYSTEM_LOAD",()=>{
 return {
  loadavg:os.loadavg(),
  freemem_mb:+(os.freemem()/1024/1024).toFixed(2)
 };
});

ACT("AUTO_BENCH_LIGHT",()=>{

 let n=0;
 const t=Date.now()+1000;

 while(Date.now()<t){
  Math.sqrt(n*n+1);
  n++;
 }

 return {
  duration_sec:1,
  iterations:n
 };
});

ACT("AUTO_LOGGER",()=>{

 fs.writeFileSync(
  "runtime_state/TRILLIONX_AUTO_ACTIVATE_REPORT.json",
  JSON.stringify(REPORT,null,2)
 );

 return "REPORT_WRITTEN";
});

/* =========================
   OPTIONAL APP START
========================= */

if(fs.existsSync("./app.js")){

 ACT("APP_BOOT",()=>{

  const child=spawn(
   "node",
   ["app.js"],
   {
    env:{
     ...process.env,
     PORT:"3000",
     HOST:"0.0.0.0"
    },
    detached:true,
    stdio:"ignore"
   }
  );

  child.unref();

  return {
   status:"APP_STARTED_BACKGROUND",
   port:3000
  };
 });

}

console.log("\n=== TRILLIONX AUTO ACTIVATE ALL ===\n");

console.log(JSON.stringify(REPORT,null,2));

console.log("\nREPORT FILE:");
console.log("runtime_state/TRILLIONX_AUTO_ACTIVATE_REPORT.json");

console.log("\n=== END ===");

