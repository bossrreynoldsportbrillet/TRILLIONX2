"use strict";
const os=require("os"),{performance}=require("perf_hooks"),crypto=require("crypto"),{Worker}=require("worker_threads");

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

// Mesure brute : combien de fois on peut boucler en Xms ?
function quickMeasure(fn,durationMs=100){
 const t0=performance.now(),limit=t0+durationMs;
 let n=0;
 while(performance.now()<limit){fn();n++}
 return n;
}

// === DETECT POWER ===
async function detectPower(){
 const cores=os.cpus().length;
 const freemem=os.freemem();
 const totalmem=os.totalmem();
 
 // CPU: test pur (loop vide)
 const loopIter=quickMeasure(()=>{},50);
 
 // CPU: crypto (SHA-256 sur 1MB répété)
 const buf=Buffer.alloc(1024*1024);
 const cryptoIter=quickMeasure(()=>{crypto.createHash("sha256").update(buf).digest()},50);
 
 // CPU: BigInt maths
 const bigintIter=quickMeasure(()=>{BigInt(Math.random()*2**53)*BigInt(Math.random()*2**53)},50);
 
 // Memory: allocation speed
 const allocIter=quickMeasure(()=>{Buffer.alloc(1024*100)},50);
 
 // Estimate "core power" = ops/ms/core
 const basePower=r((loopIter+cryptoIter*0.5+bigintIter*0.1)/cores);
 const cpuScore=r(loopIter*0.4+cryptoIter*0.4+bigintIter*0.2);
 const memScore=r(allocIter);
 
 // Recommendation: worker threads = ~sqrt(cores) up to cores
 const recommendedWorkers=Math.max(1,Math.min(cores,Math.ceil(Math.sqrt(cores))));
 
 // Adaptive timeout: faster CPU = shorter timeout
 const adaptiveTimeout=Math.max(500,Math.ceil(2000/Math.max(1,cpuScore/1000)));
 
 const power={
  timestamp:new Date().toISOString(),
  hardware:{cores,freemem_gb:r(freemem/(2**30)),totalmem_gb:r(totalmem/(2**30))},
  measurements:{
   loop_iter_50ms:loopIter,
   crypto_sha256_1mb_50ms:cryptoIter,
   bigint_mul_50ms:bigintIter,
   alloc_100kb_50ms:allocIter
  },
  scores:{cpu_score:cpuScore,mem_score:memScore,base_power_ops_per_ms_per_core:basePower},
  recommendations:{
   worker_threads:recommendedWorkers,
   adaptive_timeout_ms:adaptiveTimeout,
   estimated_peak_mhz:r(cpuScore*100),
   network_concurrency:Math.max(6,Math.min(12,recommendedWorkers*2))
  }
 };
 
 return power;
}

module.exports={detectPower,quickMeasure};

if(require.main===module){
 detectPower().then(p=>{
  console.log("[power-detect]",JSON.stringify(p,null,2));
 }).catch(e=>{console.error(e);process.exit(1)});
}
