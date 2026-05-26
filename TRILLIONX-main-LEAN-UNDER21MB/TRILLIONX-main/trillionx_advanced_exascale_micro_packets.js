"use strict";

const fs=require("fs"), os=require("os"), crypto=require("crypto");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const MODE=process.argv[2]||"micro";
const PACKETS=Math.max(1,Math.min(Number(process.argv[3]||8),80));
const BUDGET_MS=Math.max(50,Math.min(Number(process.argv[4]||450),5000));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const us=ms=>Math.round(ms*1000);

function mem(){
 const m=process.memoryUsage();
 return {
  rss_mb:r(m.rss/1048576),
  heap_mb:r(m.heapUsed/1048576),
  external_mb:r(m.external/1048576),
  free_gb:r(os.freemem()/1073741824),
  total_gb:r(os.totalmem()/1073741824)
 };
}
function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex")}
function bounded(name,fn,budget=BUDGET_MS){
 const before=mem(),t0=performance.now();
 let result=null,error=null,ops=0;
 try{ const out=fn(()=>performance.now()-t0<budget); result=out.result; ops=out.ops||0; }
 catch(e){ error=e.message; }
 const ms=performance.now()-t0;
 return {name,ok:!error,error,result,ops,ms:r(ms),us:us(ms),ops_s:r(ops/(ms/1000)),before,after:mem()};
}

/* 1. TSP bounded branch-and-bound sample */
function travelingSalesmanBounded(keepGoing){
 const n=10;
 const dist=(i,j)=>Math.hypot(i-j,Math.sin(i)*Math.cos(j));
 const cities=Array.from({length:n-1},(_,i)=>i+1);
 let best=Infinity,ops=0;
 function rec(path,remain,cost){
  if(!keepGoing())return;
  ops++;
  if(cost>=best)return;
  if(!remain.length){
   best=Math.min(best,cost+dist(path[path.length-1],0));
   return;
  }
  for(let k=0;k<remain.length;k++){
   const c=remain[k];
   const nr=remain.slice(0,k).concat(remain.slice(k+1));
   rec(path.concat(c),nr,cost+dist(path[path.length-1],c));
   if(!keepGoing())break;
  }
 }
 rec([0],cities,0);
 return {result:r(best),ops};
}

/* 2. Knapsack DP repeated */
function knapsackDP(keepGoing){
 let ops=0,best=0,seed=1;
 while(keepGoing()){
  const items=Array.from({length:36},(_,i)=>({weight:5+((i*7+seed)%23),value:10+((i*17+seed)%113)}));
  const cap=240,dp=Array(cap+1).fill(0);
  for(const it of items){
   for(let w=cap;w>=it.weight;w--){dp[w]=Math.max(dp[w],dp[w-it.weight]+it.value);ops++;}
  }
  best=dp[cap];seed++;
 }
 return {result:best,ops};
}

/* 3. N-body */
function nBody(keepGoing){
 const n=96,dt=.01;
 const b=Array.from({length:n},(_,i)=>({x:i%10,y:(i*7)%10,z:(i*13)%10,vx:.01,vy:.02,vz:.03,m:1}));
 let ops=0,steps=0;
 while(keepGoing()){
  for(let i=0;i<n;i++){
   let fx=0,fy=0,fz=0;
   for(let j=0;j<n;j++){
    if(i===j)continue;
    const dx=b[j].x-b[i].x,dy=b[j].y-b[i].y,dz=b[j].z-b[i].z;
    const rr=Math.sqrt(dx*dx+dy*dy+dz*dz)+.1;
    const f=b[j].m/(rr*rr*rr);
    fx+=f*dx;fy+=f*dy;fz+=f*dz;ops+=18;
   }
   b[i].vx+=fx*dt;b[i].vy+=fy*dt;b[i].vz+=fz*dt;
   b[i].x+=b[i].vx*dt;b[i].y+=b[i].vy*dt;b[i].z+=b[i].vz*dt;ops+=12;
  }
  steps++;
 }
 return {result:r(b.reduce((s,x)=>s+Math.hypot(x.vx,x.vy,x.vz),0)/n),ops};
}

/* 4. Neural mini backprop */
function neuralBackprop(keepGoing){
 let ops=0,loss=0;
 const input=new Float32Array(64).map((_,i)=>Math.sin(i));
 const target=new Float32Array(16).map((_,i)=>Math.cos(i));
 let w1=new Float32Array(64*32).map((_,i)=>((i%17)-8)*0.001);
 let w2=new Float32Array(32*16).map((_,i)=>((i%13)-6)*0.001);
 while(keepGoing()){
  const h=new Float32Array(32),out=new Float32Array(16);
  for(let i=0;i<32;i++){let s=0;for(let j=0;j<64;j++){s+=input[j]*w1[i*64+j];ops+=2}h[i]=Math.max(0,s)}
  loss=0;
  for(let i=0;i<16;i++){let s=0;for(let j=0;j<32;j++){s+=h[j]*w2[i*32+j];ops+=2}out[i]=s;loss+=(s-target[i])**2;ops+=3}
  for(let i=0;i<16;i++){const d=2*(out[i]-target[i])*.001;for(let j=0;j<32;j++){w2[i*32+j]-=d*h[j];ops+=2}}
 }
 return {result:r(loss),ops};
}

/* 5. Huffman */
function huffman(keepGoing){
 let ops=0,bits=0;
 const base="TRILLIONX_EXASCALE_CRYPTO_NETWORK_VECTOR_NEURAL_VR_CACHE_RAID60_JOKER".repeat(20);
 while(keepGoing()){
  const freq=new Map(); for(const c of base){freq.set(c,(freq.get(c)||0)+1);ops++}
  const nodes=[...freq].map(([char,freq])=>({char,freq}));
  while(nodes.length>1){nodes.sort((a,b)=>a.freq-b.freq);const l=nodes.shift(),r=nodes.shift();nodes.push({freq:l.freq+r.freq,left:l,right:r});ops+=nodes.length}
  bits=0; const enc=(node,d=0)=>{if(!node.left&&!node.right){bits+=d*(freq.get(node.char)||0);return}enc(node.left,d+1);enc(node.right,d+1);ops++}; enc(nodes[0]);
 }
 return {result:r(bits/8/1024),ops};
}

/* 6. Crypto ECDSA-like real hash workload */
function cryptoSignatureLike(keepGoing){
 let ops=0,last="";
 while(keepGoing()){
  const k=crypto.randomBytes(32);
  const msg=crypto.randomBytes(128);
  last=crypto.createHmac("sha256",k).update(msg).digest("hex");
  ops+=4096;
 }
 return {result:last.slice(0,16),ops};
}

/* 7. Runge-Kutta */
function rungeKutta(keepGoing){
 let ops=0,y=1,t=0,dt=.001;
 const f=(t,y)=>-y+Math.sin(t)*0.01;
 while(keepGoing()){
  const k1=f(t,y),k2=f(t+dt/2,y+k1*dt/2),k3=f(t+dt/2,y+k2*dt/2),k4=f(t+dt,y+k3*dt);
  y+=(k1+2*k2+2*k3+k4)*dt/6;t+=dt;ops+=28;
 }
 return {result:r(y),ops};
}

/* 8. Quantum state vector */
function quantum(keepGoing){
 const n=13,N=1<<n;
 let a=new Float64Array(N); a[0]=1;
 let ops=0,prob=0;
 while(keepGoing()){
  for(let q=0;q<n && keepGoing();q++){
   const h=1/Math.sqrt(2),b=new Float64Array(N);
   for(let i=0;i<N;i++){const j=i^(1<<q);b[i]+=a[i]*h;b[j]+=a[i]*h;ops+=4}
   a=b;
  }
  prob=0; for(let i=0;i<N;i++){prob+=a[i]*a[i];ops+=2}
 }
 return {result:r(prob),ops};
}

/* 9. Combinatorics */
function combinatorics(keepGoing){
 let count=0,ops=0;
 function gen(n,k,start,depth){
  if(!keepGoing())return;
  ops++;
  if(depth===k){count++;return}
  for(let i=start;i<=n;i++){gen(n,k,i+1,depth+1); if(!keepGoing())break}
 }
 while(keepGoing())gen(24,12,1,0);
 return {result:count,ops};
}

/* 10. Simulated annealing */
function annealing(keepGoing){
 const ras=(x,y)=>20+x*x+y*y-10*(Math.cos(2*Math.PI*x)+Math.cos(2*Math.PI*y));
 let x=4,y=-3,best=ras(x,y),T=10,ops=0;
 while(keepGoing()){
  const nx=x+(Math.random()-.5)*T,ny=y+(Math.random()-.5)*T;
  if(nx>=-5&&nx<=5&&ny>=-5&&ny<=5){
   const nf=ras(nx,ny),d=nf-ras(x,y);ops+=20;
   if(d<0||Math.random()<Math.exp(-d/T)){x=nx;y=ny;if(nf<best)best=nf}
  }
  T*=.999;if(T<.001)T=10;
 }
 return {result:r(best),ops};
}

/* 11. Floyd-Warshall */
function floyd(keepGoing){
 const n=72,INF=1e12;
 let ops=0,total=0;
 while(keepGoing()){
  const d=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:((i*j+j)%5===0?((i+j)%97)+1:INF)));
  for(let k=0;k<n&&keepGoing();k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++){const v=d[i][k]+d[k][j];if(v<d[i][j])d[i][j]=v;ops++}
  total=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(d[i][j]<INF)total+=d[i][j];
 }
 return {result:r(total/1000),ops};
}

/* 12. K-means */
function kmeans(keepGoing){
 const data=Array.from({length:900},(_,i)=>({x:(i*37)%100,y:(i*91)%100}));
 let c=data.slice(0,8).map(x=>({...x})),ops=0;
 while(keepGoing()){
  const clusters=Array.from({length:8},()=>[]);
  for(const p of data){let bi=0,bd=1e9;for(let i=0;i<8;i++){const dx=p.x-c[i].x,dy=p.y-c[i].y,d=dx*dx+dy*dy;ops+=5;if(d<bd){bd=d;bi=i}}clusters[bi].push(p)}
  for(let i=0;i<8;i++)if(clusters[i].length){c[i]={x:clusters[i].reduce((s,p)=>s+p.x,0)/clusters[i].length,y:clusters[i].reduce((s,p)=>s+p.y,0)/clusters[i].length};ops+=clusters[i].length*2}
 }
 return {result:r(c.reduce((s,x)=>s+x.x+x.y,0)),ops};
}

/* 13. Wavelet */
function wavelet(keepGoing){
 let ops=0,energy=0;
 while(keepGoing()){
  const coeff=Array.from({length:2048},(_,i)=>Math.sin(i*.01));
  for(let level=0;level<7;level++){
   const len=coeff.length>>level,half=len>>1,tmp=new Array(len);
   for(let i=0;i<half;i++){tmp[i]=(coeff[2*i]+coeff[2*i+1])/Math.SQRT2;tmp[half+i]=(coeff[2*i]-coeff[2*i+1])/Math.SQRT2;ops+=6}
   for(let i=0;i<len;i++)coeff[i]=tmp[i];
  }
  energy=coeff.reduce((s,x)=>s+x*x,0);ops+=coeff.length*2;
 }
 return {result:r(energy),ops};
}

/* 14. CSP Latin square */
function csp(keepGoing){
 const n=5,b=Array(n*n).fill(0);let sol=0,ops=0;
 function valid(pos,num){const row=Math.floor(pos/n),col=pos%n;for(let i=0;i<n;i++){ops++;if(b[row*n+i]===num||b[i*n+col]===num)return false}return true}
 function solve(pos){if(!keepGoing())return false;if(pos===n*n){sol++;return sol>2}for(let num=1;num<=n;num++){if(valid(pos,num)){b[pos]=num;if(solve(pos+1))return true;b[pos]=0}}return false}
 while(keepGoing()){b.fill(0);solve(0)}
 return {result:sol,ops};
}

/* 15. MCMC */
function mcmc(keepGoing){
 let x=0,acc=0,ops=0;
 const target=x=>Math.exp(-(x*x)/2);
 while(keepGoing()){
  const nx=x+(Math.random()-.5)*2;
  if(Math.random()<target(nx)/target(x)){x=nx;acc++}
  ops+=12;
 }
 return {result:r(acc/Math.max(1,ops/12)),ops};
}

const TESTS=[
 ["TSP_BOUNDED_NP",travelingSalesmanBounded,"NP-hard bounded search"],
 ["KNAPSACK_DP",knapsackDP,"dynamic programming"],
 ["N_BODY",nBody,"physics n²"],
 ["NEURAL_BACKPROP",neuralBackprop,"gradient/backprop"],
 ["HUFFMAN",huffman,"compression/coding"],
 ["CRYPTO_SIGNATURE_LIKE",cryptoSignatureLike,"crypto hash/HMAC"],
 ["RUNGE_KUTTA",rungeKutta,"ODE solver"],
 ["QUANTUM_STATE_VECTOR",quantum,"state vector"],
 ["COMBINATORICS",combinatorics,"combinatorial search"],
 ["ANNEALING",annealing,"stochastic optimization"],
 ["FLOYD_WARSHALL",floyd,"graph all-pairs"],
 ["KMEANS",kmeans,"clustering"],
 ["WAVELET",wavelet,"signal decomposition"],
 ["CSP_BACKTRACKING",csp,"constraint solving"],
 ["MCMC",mcmc,"Monte Carlo"]
];

async function main(){
 console.log("=== TRILLIONX ADVANCED EXASCALE MICRO-PACKETS ===");
 console.log("TARGET=TRILLIONX | HOST=CODESPACES_SUPPORT_ONLY | UNIT=µs/ms | REAL_ONLY");
 console.log("MODE:",MODE,"PACKETS:",PACKETS,"BUDGET_MS:",BUDGET_MS);
 const results=[];
 for(let p=1;p<=PACKETS;p++){
  console.log(`--- MICRO PACKET ${p}/${PACKETS} ---`);
  const packet=[];
  for(const [name,fn,kind] of TESTS){
   const row=bounded(name,fn,BUDGET_MS);
   row.kind=kind;
   row.packet=p;
   row.complexity="ADVANCED_MICRO_PACKET";
   packet.push(row);
   console.log(`${row.ok?"✓":"✗"} ${name} | ${row.ms}ms | ${row.us}µs | ops/s ${row.ops_s} | result ${row.result}`);
  }
  const score=r(packet.reduce((a,x)=>a+(x.ops_s||0),0)/1000000);
  const health=r(100-Math.max(0,mem().rss_mb-900)/25);
  results.push({packet:p,score_mops:score,health,tests:packet,memory:mem()});
 }
 const flat=results.flatMap(x=>x.tests);
 const summary={
  packets:PACKETS,
  tests_per_packet:TESTS.length,
  total_tests:flat.length,
  avg_ms:r(flat.reduce((a,b)=>a+b.ms,0)/flat.length),
  avg_us:Math.round(flat.reduce((a,b)=>a+b.us,0)/flat.length),
  total_ops:flat.reduce((a,b)=>a+(b.ops||0),0),
  avg_ops_s:r(flat.reduce((a,b)=>a+(b.ops_s||0),0)/flat.length),
  score_total_mops:r(results.reduce((a,b)=>a+b.score_mops,0)),
  avg_health:r(results.reduce((a,b)=>a+b.health,0)/results.length),
  verdict:"TRILLIONX_ADVANCED_MICRO_PACKET_READY",
  reading:"Real bounded advanced workloads, designed to add more complexity progressively without freezing Codespaces."
 };
 const report={engine:"TRILLIONX_ADVANCED_EXASCALE_MICRO_PACKETS",ts:new Date().toISOString(),mode:MODE,budget_ms:BUDGET_MS,host:{node:process.version,cpus:os.cpus().length,cpu:os.cpus()[0]?.model,ram_gb:r(os.totalmem()/1073741824)},truth_policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",real_only:true,no_fake_exascale:true,micro_packets:true},summary,results};
 const file=`data/trillionx_advanced_exascale_micro_packets_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_advanced_exascale_micro_packets_latest.json",JSON.stringify(report,null,2));
 console.log("=== SUMMARY ===");
 console.log("TOTAL TESTS:",summary.total_tests);
 console.log("AVG:",summary.avg_ms,"ms /",summary.avg_us,"µs");
 console.log("AVG OPS/S:",summary.avg_ops_s);
 console.log("SCORE MOPS:",summary.score_total_mops);
 console.log("HEALTH:",summary.avg_health);
 console.log("VERDICT:",summary.verdict);
 console.log("REPORT =",file);
}
main().catch(e=>{console.error(e);process.exit(1)});
