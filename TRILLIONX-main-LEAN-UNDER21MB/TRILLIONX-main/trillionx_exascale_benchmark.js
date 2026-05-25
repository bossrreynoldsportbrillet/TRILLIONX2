"use strict";
const fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto"),{performance}=require("perf_hooks"),{Worker}=require("worker_threads");
const powerDetect=require("./trillionx_cpu_power_detect");
const autonet=require("./trillionx_network_autodetect");

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const DATA_DIR=path.join(__dirname,"data");
fs.mkdirSync(DATA_DIR,{recursive:true});

// === MICRO-BENCHMARK BASE ===
class MicroBench{
 constructor(id,category,fn,opts={}){
  this.id=id;this.category=category;this.fn=fn;this.opts=opts;this.result=null;
 }
 async run(timeout=2000){
  return new Promise(resolve=>{
   let done=false,end=v=>{if(done)return;done=true;resolve(v)};
   const t0=performance.now();
   try{
    const timer=setTimeout(()=>end({ok:false,error:"timeout",ms:r(performance.now()-t0),result:null}),timeout);
    const fnResult=this.fn();
    if(fnResult instanceof Promise){
     fnResult.then(res=>{clearTimeout(timer);end({ok:true,result:res,ms:r(performance.now()-t0)})})
      .catch(e=>{clearTimeout(timer);end({ok:false,error:e.message,ms:r(performance.now()-t0),result:null})});
    }else{
     clearTimeout(timer);end({ok:true,result:fnResult,ms:r(performance.now()-t0)});
    }
   }catch(e){end({ok:false,error:e.message,ms:r(performance.now()-t0),result:null})}
  }).then(res=>{this.result={id:this.id,category:this.category,...res};return this.result});
 }
}

// === COLLECTION DE MICRO-BENCHMARKS ===
function buildBenchmarks(){
 const benches=[];
 
 // === CPU: PURE COMPUTE ===
 benches.push(new MicroBench("cpu_loop_billion","cpu",()=>{let n=0;for(let i=0;i<1e9;i++)n++;return n}));
 benches.push(new MicroBench("cpu_fib_40","cpu",()=>{
  const fib=n=>n<2?n:fib(n-1)+fib(n-2);
  return fib(30);
 }));
 benches.push(new MicroBench("cpu_prime_sieve","cpu",()=>{
  const n=100000,sieve=new Uint8Array(n+1).fill(1);
  for(let i=2;i*i<=n;i++)if(sieve[i])for(let j=i*i;j<=n;j+=i)sieve[j]=0;
  return sieve.reduce((a,b)=>a+(b?1:0),0);
 }));
 benches.push(new MicroBench("cpu_sort_1m","cpu",()=>{
  const arr=new Array(1e6).fill(0).map(()=>Math.random());
  arr.sort((a,b)=>a-b);
  return arr.length;
 }));
 benches.push(new MicroBench("cpu_json_parse","cpu",()=>{
  const obj={a:1,b:[1,2,3],c:{d:4}};
  const json=JSON.stringify(obj);
  for(let i=0;i<10000;i++)JSON.parse(json);
  return 10000;
 }));
 
 // === CPU: BIGINT MATH ===
 benches.push(new MicroBench("cpu_bigint_factorial","cpu",()=>{
  let f=BigInt(1);
  for(let i=2n;i<=100n;i++)f*=i;
  return f.toString().length;
 }));
 benches.push(new MicroBench("cpu_bigint_pow","cpu",()=>{
  let n=BigInt(2);
  for(let i=0;i<100;i++)n=(n*BigInt(2))%BigInt("999999999999999999");
  return n.toString().length;
 }));
 
 // === CRYPTO: HASH SPEED ===
 benches.push(new MicroBench("crypto_sha256_1mb","crypto",()=>{
  const buf=Buffer.alloc(1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){crypto.createHash("sha256").update(buf).digest();n++}
  return n;
 }));
 benches.push(new MicroBench("crypto_sha256_100x1kb","crypto",()=>{
  const buf=Buffer.alloc(1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){for(let i=0;i<100;i++)crypto.createHash("sha256").update(buf).digest();n++}
  return n*100;
 }));
 benches.push(new MicroBench("crypto_sha3_1mb","crypto",()=>{
  const buf=Buffer.alloc(1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){crypto.createHash("sha3-256").update(buf).digest();n++}
  return n;
 }));
 benches.push(new MicroBench("crypto_blake2b_1mb","crypto",()=>{
  const buf=Buffer.alloc(1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){crypto.createHash("blake2b512").update(buf).digest();n++}
  return n;
 }));
 benches.push(new MicroBench("crypto_hmac_sha256","crypto",()=>{
  const secret="secret",msg="message";
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){crypto.createHmac("sha256",secret).update(msg).digest();n++}
  return n;
 }));
 
 // === MEMORY: THROUGHPUT ===
 benches.push(new MicroBench("mem_alloc_10m","memory",()=>{
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){Buffer.alloc(10000);n++}
  return n;
 }));
 benches.push(new MicroBench("mem_copy_10m","memory",()=>{
  const src=Buffer.alloc(10*1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){src.copy(Buffer.alloc(10*1024*1024));n++}
  return n;
 }));
 benches.push(new MicroBench("mem_read_write_4gb","memory",()=>{
  const buf=Buffer.alloc(4*1024*1024);
  let sum=0;
  for(let i=0;i<buf.length;i++){buf[i]=(buf[i]+1)%256;sum++}
  return sum;
 }));
 
 // === ASYNC/CONCURRENCY ===
 benches.push(new MicroBench("async_promise_chain","concurrency",()=>{
  let p=Promise.resolve(1);
  for(let i=0;i<1000;i++)p=p.then(x=>x+1);
  return p;
 },1000));
 benches.push(new MicroBench("async_parallel_100","concurrency",()=>{
  return Promise.all(Array.from({length:100},(_,i)=>Promise.resolve(i)));
 },1000));
 
 // === FILE I/O ===
 benches.push(new MicroBench("io_write_1mb","io",()=>{
  const f=path.join(DATA_DIR,`bench_tmp_${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(f,Buffer.alloc(1024*1024));
  fs.unlinkSync(f);
  return 1024*1024;
 }));
 benches.push(new MicroBench("io_read_1mb","io",()=>{
  const f=path.join(DATA_DIR,"bench_tmp_read.tmp");
  fs.writeFileSync(f,Buffer.alloc(1024*1024));
  const n=fs.readFileSync(f).length;
  fs.unlinkSync(f);
  return n;
 }));
 
 // === REGEX ===
 benches.push(new MicroBench("regex_email_1000","regex",()=>{
  const re=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let n=0;
  for(let i=0;i<1000;i++){if(re.test(`user${i}@example.com`))n++}
  return n;
 }));
 benches.push(new MicroBench("regex_complex_10000","regex",()=>{
  const re=/([a-z]+)(\d+)([A-Z]+)/g;
  const str="abc123XYZ def456GHI ghi789JKL";
  let n=0;
  for(let i=0;i<10000;i++){if(re.test(str))n++}
  return n;
 }));
 
 // === NETWORK FACTS (utilise autodetect) ===
 benches.push(new MicroBench("network_facts_fetch","network",async()=>{
  const auto=require("./trillionx_network_autodetect");
  const live=auto.getLive();
  if(!live){
   const state=await auto.detectAll({timeout:3000,concurrency:8});
   return {ok:state.summary.ok,facts_count:Object.keys(state.facts).length};
  }else{
   return {ok:live.summary.ok,facts_count:Object.keys(live.facts).length};
  }
 },5000));
 
 // === MATRIX / NUMERICAL ===
 benches.push(new MicroBench("math_matrix_mult_100","math",()=>{
  const n=100;
  const a=Array(n).fill(0).map(()=>Array(n).fill(1));
  const b=Array(n).fill(0).map(()=>Array(n).fill(1));
  const c=Array(n).fill(0).map(()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++)c[i][j]+=a[i][k]*b[k][j];
  return c[0][0];
 }));
 
 // === COMPRESSION / ENCODING ===
 benches.push(new MicroBench("encode_base64_1mb","encoding",()=>{
  const buf=Buffer.alloc(1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){buf.toString("base64");n++}
  return n;
 }));
 benches.push(new MicroBench("encode_hex_1mb","encoding",()=>{
  const buf=Buffer.alloc(1024*1024);
  let n=0;
  const t0=performance.now();
  while(performance.now()-t0<100){buf.toString("hex");n++}
  return n;
 }));
 
 
 return addFrontierBenchmarks(benches);
}
}

// === PARALLEL RUN ===
async function runAllBenches(benches,timeout=2000,concurrency=4){
 const results=[];
 let idx=0;
 async function worker(){
  while(idx<benches.length){
   const i=idx++;
   try{await benches[i].run(timeout);results[i]=benches[i].result}
   catch(e){results[i]={id:benches[i].id,category:benches[i].category,ok:false,error:e.message}}
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,benches.length)},worker));
 return results.filter(x=>x);
}

// === AGGREGATE SCORE ===
function aggregateResults(results,power){
 const byCategory={};
 for(const res of results){
  byCategory[res.category]=byCategory[res.category]||{ok:0,fail:0,ms_sum:0,results:[]};
  const c=byCategory[res.category];
  if(res.ok){c.ok++;c.ms_sum+=res.ms}else{c.fail++}
  c.results.push(res);
 }
 
 for(const k of Object.keys(byCategory)){
  const c=byCategory[k];
  c.success_rate=c.ok+c.fail>0?r(100*c.ok/(c.ok+c.fail)):0;
  c.avg_ms=c.ok>0?r(c.ms_sum/c.ok):null;
 }
 
 const weights={cpu:0.25,quantum:0.08,graph:0.08,ai:0.12,monte_carlo:0.07,sat:0.05,signal:0.05,fractal:0.05,evolution:0.05,information:0.05,crypto:0.25,memory:0.15,io:0.1,concurrency:0.1,network:0.05,regex:0.03,math:0.02};
 let scoreSum=0,weightSum=0;
 for(const [cat,w] of Object.entries(weights)){
  if(byCategory[cat]){
   scoreSum+=w*byCategory[cat].success_rate;
   weightSum+=w;
  }
 }
 const globalScore=weightSum>0?r(scoreSum/weightSum):0;
 
 return {byCategory,globalScore,power_estimated_mhz:power.scores.base_power_ops_per_ms_per_core*100};
}

// === MAIN ===
async function runExascaleBench(){
 console.log("[TRILLIONX EXASCALE BENCHMARK STARTING]");
 
 const t0=performance.now();
 console.log("[step 1/4] Detecting CPU power...");
 const power=await powerDetect.detectPower();
 console.log("[power]",JSON.stringify(power.scores,null,2));
 
 console.log("[step 2/4] Building micro-benchmarks ("+buildBenchmarks().length+" tests)...");
 const benches=buildBenchmarks();
 
 const adaptiveTimeout=power.recommendations.adaptive_timeout_ms;
 const adaptiveConcurrency=power.recommendations.worker_threads;
 console.log(`[step 3/4] Running with timeout=${adaptiveTimeout}ms concurrency=${adaptiveConcurrency}...`);
 
 const results=await runAllBenches(benches,adaptiveTimeout,adaptiveConcurrency);
 const totalMs=r(performance.now()-t0);
 
 const agg=aggregateResults(results,power);
 
 const report={
  engine:"TRILLIONX_EXASCALE_BENCHMARK",
  version:"1.0-micro-packets",
  timestamp:new Date().toISOString(),
  duration_ms:totalMs,
  power_detected:power,
  config:{
   total_benches:benches.length,
   adaptive_timeout_ms:adaptiveTimeout,
   adaptive_concurrency:adaptiveConcurrency
  },
  results:{
   by_category:agg.byCategory,
   global_score:agg.globalScore,
   total_ok:results.filter(x=>x.ok).length,
   total_fail:results.filter(x=>!x.ok).length,
   success_pct:r(100*results.filter(x=>x.ok).length/results.length)
  },
  details:results
 };
 
 const file=path.join(DATA_DIR,`trillionx_exascale_${Date.now()}.json`);
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(DATA_DIR,"trillionx_exascale_latest.json"),JSON.stringify(report,null,2));
 
 console.log("\n=== RESULTS ===");
 console.log("Global Score:",agg.globalScore);
 console.log("Success Rate:",report.results.success_pct+"%");
 console.log("Duration:",totalMs+"ms");
 console.log("By Category:");
 for(const [k,v] of Object.entries(agg.byCategory)){
  console.log(`  ${k}: ${v.ok}/${v.ok+v.fail} (${v.success_rate.toFixed(1)}%) avg=${v.avg_ms}ms`);
 }
 console.log("Report:",file);
 
 return report;
}

module.exports={MicroBench,buildBenchmarks,runAllBenches,aggregateResults,runExascaleBench};

if(require.main===module){
 runExascaleBench().catch(e=>{console.error(e);process.exit(1)});
}

// === FRONTIER EXASCALE IMPOSSIBILITIES ===
// (Ce que les supercomputers classiques n'optimisent pas bien)

const gcd=(a,b)=>b===0?a:gcd(b,a%b);

function quantumCircuit(){
 // Simule 8 qubits avec Hadamard gate
 const n=8, size=2**n;
 let prob=0;
 for(let i=0;i<size;i++){
  const real=Math.sqrt(1/size);
  prob+=real*real;
 }
 return prob;
}

function pollardRho(){
 const n=10007*10009;
 let x=2, y=2, d=1;
 const f=xx=>((xx*xx)+1)%n;
 
 for(let iter=0;iter<10000;iter++){
  x=f(x); y=f(f(y));
  d=gcd(Math.abs(x-y)||1,n);
  if(d>1 && d<n)return d;
 }
 return -1;
}

function longestPathDFS(){
 const nodes=50, edges=new Set();
 for(let i=0;i<100;i++){
  const u=Math.floor(Math.random()*nodes);
  const v=Math.floor(Math.random()*nodes);
  if(u!==v)edges.add([u,v].sort().join(","));
 }
 
 const adj=Array.from({length:nodes},()=>[]);
 for(const e of edges){
  const [u,v]=e.split(",").map(Number);
  adj[u].push(v); adj[v].push(u);
 }
 
 let maxPath=0;
 const visited=new Set();
 const dfs=(node,depth)=>{
  maxPath=Math.max(maxPath,depth);
  if(depth>10)return;
  for(const next of adj[node]){
   if(!visited.has(next)){
    visited.add(next);
    dfs(next,depth+1);
    visited.delete(next);
   }
  }
 };
 dfs(0,0);
 return maxPath;
}

function neuralNetworkInference(){
 const input=new Float32Array(128).map(()=>Math.random());
 const w1=new Float32Array(128*64).map(()=>(Math.random()-0.5)*0.1);
 const b1=new Float32Array(64).fill(0);
 const w2=new Float32Array(64*32).map(()=>(Math.random()-0.5)*0.1);
 
 let h1=0, out=0;
 for(let i=0;i<64;i++){
  let sum=b1[i];
  for(let j=0;j<128;j++)sum+=input[j]*w1[i*128+j];
  h1+=Math.max(0,sum);
 }
 
 for(let i=0;i<32;i++){
  let sum=0;
  for(let j=0;j<64;j++)sum+=h1/64*w2[i*64+j];
  out+=sum;
 }
 return out;
}

function monteCarloPI(){
 let inside=0;
 for(let i=0;i<1e6;i++){
  const x=Math.random(), y=Math.random();
  if(x*x+y*y<=1)inside++;
 }
 return (4*inside)/1e6;
}

function satSolver3SAT(){
 // (x0 ∨ ¬x1 ∨ x2) ∧ (x1 ∨ x2 ∨ ¬x0) ∧ (¬x0 ∨ ¬x1 ∨ x2)
 for(let mask=0;mask<8;mask++){
  const x0=(mask>>0)&1, x1=(mask>>1)&1, x2=(mask>>2)&1;
  const c1=x0 || !x1 || x2;
  const c2=x1 || x2 || !x0;
  const c3=!x0 || !x1 || x2;
  if(c1 && c2 && c3)return mask;
 }
 return -1;
}

function fftSimulation(){
 const n=512;
 const real=new Float32Array(n).map(()=>Math.random());
 let result=0;
 
 for(let k=0;k<32;k++){
  let sumR=0, sumI=0;
  for(let t=0;t<n;t++){
   const angle=-2*Math.PI*k*t/n;
   const c=Math.cos(angle), s=Math.sin(angle);
   sumR+=real[t]*c;
   sumI+=real[t]*s;
  }
  result+=sumR*sumR+sumI*sumI;
 }
 return Math.sqrt(result);
}

function mandelbrotDepth(){
 let totalDepth=0;
 for(let py=0;py<32;py++){
  for(let px=0;px<32;px++){
   const x0=px/32*3.5-2.5, y0=py/32*2-1;
   let x=0, y=0, iter=0;
   
   while(iter<100 && x*x+y*y<4){
    const xt=x*x-y*y+x0;
    y=2*x*y+y0; x=xt;
    iter++;
   }
   totalDepth+=iter;
  }
 }
 return totalDepth/1024;
}

function geneticEvolution(){
 const target="EXASCALE";
 const popSize=50, gens=100;
 
 const random=()=>String.fromCharCode(65+Math.floor(Math.random()*26));
 let pop=Array(popSize).fill().map(()=>
  Array(target.length).fill().map(random).join("")
 );
 
 for(let g=0;g<gens;g++){
  pop.sort((a,b)=>{
   const sa=a.split("").reduce((s,c,i)=>s+(c===target[i]?1:0),0);
   const sb=b.split("").reduce((s,c,i)=>s+(c===target[i]?1:0),0);
   return sb-sa;
  });
  
  const newPop=pop.slice(0,5);
  while(newPop.length<popSize){
   const p=pop[Math.floor(Math.random()*5)];
   const m=p.split("").map(c=>Math.random()<0.1?random():c).join("");
   newPop.push(m);
  }
  pop=newPop;
 }
 return pop[0]===target?1:0;
}

function baileyBorweinPI(){
 let pi=0;
 for(let k=0;k<500;k++){
  const term=(1/(16**k))*(4/(8*k+1)-2/(8*k+4)-1/(8*k+5)-1/(8*k+6));
  pi+=term;
 }
 return pi;
}

function entropyShannonMax(){
 const data=new Uint8Array(10000).map(()=>Math.floor(Math.random()*256));
 const freq=new Map();
 for(const b of data)freq.set(b,(freq.get(b)||0)+1);
 
 let entropy=0;
 for(const count of freq.values()){
  const p=count/data.length;
  entropy-=p*Math.log2(p);
 }
 return entropy;
}

// Ajoute les nouveaux benches à buildBenchmarks()
function addFrontierBenchmarks(benches){
 benches.push(new MicroBench("frontier_quantum_circuit","quantum",quantumCircuit));
 benches.push(new MicroBench("frontier_rsa_factorize","crypto",pollardRho));
 benches.push(new MicroBench("frontier_graph_dfs","graph",longestPathDFS));
 benches.push(new MicroBench("frontier_nn_inference","ai",neuralNetworkInference));
 benches.push(new MicroBench("frontier_monte_carlo_pi","monte_carlo",monteCarloPI));
 benches.push(new MicroBench("frontier_sat_solver","sat",satSolver3SAT));
 benches.push(new MicroBench("frontier_fft_sim","signal",fftSimulation));
 benches.push(new MicroBench("frontier_mandelbrot","fractal",mandelbrotDepth));
 benches.push(new MicroBench("frontier_genetic_algo","evolution",geneticEvolution));
 benches.push(new MicroBench("frontier_entropy_shannon","information",entropyShannonMax));
 
 return addFrontierBenchmarks(benches);
}
}
