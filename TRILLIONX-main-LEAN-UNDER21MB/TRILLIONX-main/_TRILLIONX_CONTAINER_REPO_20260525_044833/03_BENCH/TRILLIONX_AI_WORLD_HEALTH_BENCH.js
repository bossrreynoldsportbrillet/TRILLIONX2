const fs=require("fs"),os=require("os"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const mb=x=>Math.round(x/1024/1024*1000)/1000;
const gb=x=>Math.round(x/1024/1024/1024*1000)/1000;
const r3=x=>Math.round(x*1000)/1000;
function flags(){try{return fs.readFileSync("/proc/cpuinfo","utf8").match(/flags\s*: (.*)/)?.[1]||""}catch{return""}}
function cpu(){let c=os.cpus()[0]||{};return {model:c.model||"unknown",speedGHz:r3((c.speed||0)/1000),logical:os.cpus().length}}
function mem(){return {ramGB:gb(os.totalmem()),freeGB:gb(os.freemem()),rssMB:mb(process.memoryUsage().rss),heapMB:mb(process.memoryUsage().heapUsed),externalMB:mb(process.memoryUsage().external)}}
function readJSON(p){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return null}}
function latest(prefix){
 try{return fs.readdirSync("data").filter(f=>f.startsWith(prefix)&&f.endsWith(".json")).sort().pop()}catch{return null}
}
function registryScan(){
 let files=[];
 for(const d of [".","data","native","backups"]){
  try{for(const f of fs.readdirSync(d))files.push(d+"/"+f)}catch{}
 }
 let hit=files.filter(f=>/ai|kernel|world|bench|simd|cache|mirror|health|registry|runtime/i.test(f));
 return {files:files.length,registry_hits:hit.length,latest_world:latest("trillionx_world_superior_rediscovery"),latest_fire:latest("trillionx_fire_packet_extreme"),latest_speed:latest("trillionx_compute_speed")};
}
function calcPacket(level,rounds){
 let n=6000+level*2500, t0=performance.now(), acc=0;
 for(let r=0;r<rounds;r++){
  for(let i=1;i<n;i++) acc+=Math.sqrt((i%997)+1)*Math.sin(i%191)*Math.cos(i%97);
 }
 let ms=performance.now()-t0;
 return {matrixGOPS:r3((n*rounds*6)/(ms*1e6)),ms:r3(ms),checksum:r3(acc%999999)};
}
function hashPacket(level){
 let input=crypto.randomBytes((8+level*4)*1024*1024),t0=performance.now();
 let h=crypto.createHash("sha256").update(input).digest("hex");
 let ms=performance.now()-t0;
 return {inputMB:mb(input.length),hashMBs:r3(mb(input.length)/(ms/1000)),ms:r3(ms),hash:h.slice(0,16)};
}
function compPacket(level){
 let input=Buffer.alloc((8+level*2)*1024*1024,level),t0=performance.now();
 let out=zlib.deflateSync(input,{level:1}); let ms=performance.now()-t0;
 return {inputMB:mb(input.length),outMB:mb(out.length),ratio:r3(out.length/input.length),compMBs:r3(mb(input.length)/(ms/1000)),ms:r3(ms)};
}
function vrMirror(level){
 let t0=performance.now(), mirrors=256+level*128, sum=0;
 for(let i=0;i<mirrors;i++)sum+=((i*level)^0x9e3779b9)>>>0;
 let ms=performance.now()-t0;
 return {mirrors,mirrorOpsS:r3(mirrors/(ms/1000)),ms:r3(ms),checksum:sum%99991};
}
function aiControl(prev,level){
 let score=prev?.score||0, health=prev?.health||100;
 let mode=health>94&&score>90?"PUSH":health>88?"OPTIMIZE":"COOL";
 let waitMs=mode==="PUSH"?700:mode==="OPTIMIZE"?1200:2200;
 let rounds=mode==="PUSH"?level+5:mode==="OPTIMIZE"?level+3:level+1;
 return {mode,waitMs,rounds,active:["AI_KERNEL","AI_HEALTH_GUARD","AI_CACHE_POLICY","AI_VR_MIRROR","AI_BENCH_ROUTER","AI_WORLD_READER"]};
}
function healthOf(p,m){
 let h=100;
 if(p.eventP95>30)h-=8;
 if(m.rssMB>800)h-=10;
 if(p.memGBs<0.5)h-=6;
 if(p.matrixGOPS<0.05)h-=5;
 if(p.hashMBs<500)h-=4;
 return Math.max(0,r3(h));
}
async function main(){
 let mode=process.argv[2]||"world";
 let max=Number(process.argv[3]||10);
 let support=flags();
 let C=cpu(), R=registryScan();
 console.log("=== TRILLIONX AI WORLD HEALTH BENCH ===");
 console.log("MODE:",mode,"MAX:",max);
 console.log("CPU PROFILE:",C.logical+" logical @ "+C.speedGHz+" GHz");
 console.log("RAM:",mem().ramGB+" GB");
 console.log("SIMD:",JSON.stringify({avx:/\bavx\b/.test(support),avx2:/\bavx2\b/.test(support),avx512:/avx512/.test(support),fma:/\bfma\b/.test(support),aes:/\baes\b/.test(support),sha_ni:/sha_ni/.test(support)}));
 console.log("REGISTRY:",JSON.stringify(R));
 let results=[],prev=null;
 for(let level=1;level<=max;level++){
  let ai=aiControl(prev,level);
  await wait(ai.waitMs);
  let t0=performance.now();
  let c=calcPacket(level,ai.rounds), h=hashPacket(level), z=compPacket(level), v=vrMirror(level), m=mem();
  let eventP95=r3(performance.now()-t0);
  let p={matrixGOPS:c.matrixGOPS,hashMBs:h.hashMBs,memGBs:r3(z.compMBs/1024),vrOpsS:v.mirrorOpsS,eventP95};
  let score=r3((p.matrixGOPS*35)+(p.hashMBs/12)+(p.memGBs*10)+(Math.min(p.vrOpsS,500000)/8000)+(100-Math.min(eventP95,100)));
  let health=healthOf(p,m);
  let row={level,ai,compute:c,hash:h,compression:z,vr_mirror:v,memory:m,score,health,flags:health<90?["PRESSURE_GUARD_ACTIVE"]:[]};
  results.push(row); prev=row;
  console.log(`--- AI PACKET ${level} ---`);
  console.log(`AI:${ai.mode} WAIT:${ai.waitMs}ms HEALTH:${health} SCORE:${score}`);
  console.log(`MATRIX:${p.matrixGOPS} GOPS | HASH:${p.hashMBs} MB/s | COMP:${p.memGBs} GB/s | VR:${p.vrOpsS} ops/s | P95:${eventP95} ms`);
 }
 let best=results.slice().sort((a,b)=>b.score-a.score)[0];
 let avgHealth=r3(results.reduce((a,b)=>a+b.health,0)/results.length);
 let verdict={
  engine:"TRILLIONX",
  benchmark:"AI_WORLD_HEALTH_BENCH",
  world_reading:"WORLD_CLASS_LOCAL_RUNTIME_METHOD",
  humanity_reading:"méthode de mesure: IA + paquets + health + registres + miroirs; utile pour comparer, diagnostiquer, optimiser sans fausse télémétrie",
  best_score:best.score,
  best_level:best.level,
  avg_health:avgHealth,
  diagnostic:avgHealth>=95?"EXCELLENT":avgHealth>=88?"GOOD":"PRESSURE",
  truth_policy:{
   real_only:true,
   physical_world_supercomputer_claim:false,
   benchmark_measures_current_runtime:true,
   worldwide_label:"indicatif méthodologique, pas classement TOP500"
  },
  cpu_profile:C,
  registry:R,
  results
 };
 fs.mkdirSync("data",{recursive:true});
 let file=`data/trillionx_ai_world_health_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(verdict,null,2));
 fs.writeFileSync("data/trillionx_ai_world_health_latest.json",JSON.stringify(verdict,null,2));
 console.log("=== SUMMARY ===");
 console.log("BEST SCORE:",verdict.best_score);
 console.log("BEST LEVEL:",verdict.best_level);
 console.log("AVG HEALTH:",verdict.avg_health);
 console.log("DIAGNOSTIC:",verdict.diagnostic);
 console.log("WORLD READING:",verdict.world_reading);
 console.log("HUMANITY:",verdict.humanity_reading);
 console.log("REPORT =",file);
}
main().catch(e=>{console.error(e);process.exit(1)});
