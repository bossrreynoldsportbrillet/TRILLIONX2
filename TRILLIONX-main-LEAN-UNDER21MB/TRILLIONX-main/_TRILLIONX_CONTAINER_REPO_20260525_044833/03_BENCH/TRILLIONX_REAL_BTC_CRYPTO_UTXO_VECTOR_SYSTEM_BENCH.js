const fs=require("fs"),os=require("os"),crypto=require("crypto"),cp=require("child_process"),http=require("http");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const MODE=process.argv[2]||"world";
const PACKETS=Math.max(1,parseInt(process.argv[3]||"12",10));
const WAIT=Math.max(25,parseInt(process.argv[4]||"200",10));
const ROOT=process.cwd();
const now=()=>new Date().toISOString();
const r3=x=>Math.round(x*1000)/1000;
const mem=()=>{const m=process.memoryUsage();return {
 rss_mb:r3(m.rss/1048576), heap_mb:r3(m.heapUsed/1048576),
 external_mb:r3(m.external/1048576), arraybuf_mb:r3((m.arrayBuffers||0)/1048576),
 free_gb:r3(os.freemem()/1073741824), total_gb:r3(os.totalmem()/1073741824)
}};
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2500}).trim()}catch{return ""}};
function cpuMHz(){
 const a=sh("awk -F: '/cpu MHz/{print $2; exit}' /proc/cpuinfo");
 return a? r3(parseFloat(a)/1000) : r3((os.cpus()[0]?.speed||0)/1000);
}
function flags(){
 const f=sh("grep -m1 '^flags' /proc/cpuinfo");
 const has=k=>new RegExp(`\\b${k}\\b`).test(f);
 return {sse:has("sse"),sse2:has("sse2"),sse4_1:has("sse4_1"),sse4_2:has("sse4_2"),avx:has("avx"),avx2:has("avx2"),avx512f:has("avx512f"),fma:has("fma"),aes:has("aes"),sha_ni:has("sha_ni")};
}
function walk(dir,out=[]){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if([".git","node_modules","_TRILLIONX_SNAPSHOT_KEEP"].includes(e.name))continue;
  const p=dir+"/"+e.name;
  if(e.isDirectory())walk(p,out); else out.push(p);
 }
 return out;
}
function repoScan(){
 const files=walk(".");
 const ext={}, routes=[], apis=[], reqs=new Set(), workers=[];
 const routeRe=/app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/g;
 const apiRe=/\/api\/[A-Za-z0-9_./:-]+/g;
 const reqRe=/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
 for(const f of files){
  const ex=(f.match(/\.[^.\/]+$/)||["NOEXT"])[0]; ext[ex]=(ext[ex]||0)+1;
  if(/\.(js|c|cpp|h|json|jsonl|md|txt)$/i.test(f)){
   let s=""; try{s=fs.readFileSync(f,"utf8").slice(0,1000000)}catch{}
   let m; while((m=routeRe.exec(s)))routes.push({method:m[1].toUpperCase(),route:m[2],file:f});
   while((m=apiRe.exec(s)))apis.push(m[0]);
   while((m=reqRe.exec(s)))reqs.add(m[1]);
   if(/worker_threads|new Worker|Worker\(/.test(s))workers.push(f);
  }
 }
 const roots={};
 for(const a of apis){const k=a.split("/").slice(0,3).join("/"); roots[k]=(roots[k]||0)+1}
 return {
  files:files.length, ext, routes:routes.length,
  api_strings:apis.length, api_roots:Object.entries(roots).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([key,count])=>({key,count})),
  modules:[...reqs].sort(), workers:[...new Set(workers)].slice(0,50),
  key_files:files.filter(f=>/app\.js$|package\.json|launch\.json|worker|plugin|registry|bench|crypto|btc|utxo|memory|route/i.test(f)).slice(0,120)
 };
}
function apiPing(path){
 return new Promise(res=>{
  const t=performance.now();
  const q=http.get({host:"127.0.0.1",port:3000,path,timeout:1200},r=>{
   let n=0; r.on("data",d=>n+=d.length);
   r.on("end",()=>res({path,http:r.statusCode,ms:r3(performance.now()-t),bytes:n,ok:r.statusCode<500}));
  });
  q.on("timeout",()=>{q.destroy();res({path,http:0,ms:r3(performance.now()-t),bytes:0,ok:false,timeout:true})});
  q.on("error",()=>res({path,http:0,ms:r3(performance.now()-t),bytes:0,ok:false}));
 });
}
async function apiScan(){
 const paths=["/","/api/ping","/api/full","/api/health","/api/runtime/status","/api/reconnect","/api/ai-chat","/api/hardware/9000vw","/api/benchmark","/api/performance"];
 const out=[]; for(const p of paths)out.push(await apiPing(p));
 const ok=out.filter(x=>x.ok).length, lat=out.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 return {tested:out.length, ok, fail:out.length-ok, p50:lat.length?lat[Math.floor(lat.length*.5)]:null, p95:lat.length?lat[Math.floor(lat.length*.95)]||lat.at(-1):null, results:out};
}
function shaBench(mb){
 const buf=crypto.randomBytes(mb*1048576), t=performance.now();
 const h=crypto.createHash("sha256").update(buf).digest("hex");
 const ms=performance.now()-t; return {mb,ms:r3(ms),mb_s:r3(mb/(ms/1000)),hash:h.slice(0,20)};
}
function pbkdfBench(rounds){
 const t=performance.now();
 crypto.pbkdf2Sync("trillionx","btc-utxo",rounds,32,"sha256");
 const ms=performance.now()-t; return {rounds,ms:r3(ms),iter_s:r3(rounds/(ms/1000))};
}
function scryptBench(n){
 const t=performance.now();
 crypto.scryptSync("trillionx","utxo",32,{N:n,r:8,p:1,maxmem:128*1048576});
 const ms=performance.now()-t; return {N:n,ms:r3(ms),ops_s:r3(1000/ms)};
}
function utxoBench(n){
 const t=performance.now(), map=new Map(); let sat=0n, chk=0n;
 for(let i=0;i<n;i++){
  const tx=crypto.createHash("sha256").update("trx-utxo-"+i).digest("hex");
  const v=BigInt((i*7919)%100000000);
  map.set(tx+":"+i,{v,spent:false}); sat+=v;
 }
 let scanned=0, spent=0n;
 for(const [k,o] of map){scanned++; if((scanned%7)===0){o.spent=true;spent+=o.v} chk^=BigInt("0x"+k.slice(0,12));}
 const live=sat-spent, ms=performance.now()-t;
 return {utxos:n,ms:r3(ms),utxo_s:r3(n/(ms/1000)),total_sat:sat.toString(),spent_sat:spent.toString(),live_sat:live.toString(),checksum:chk.toString()};
}
function vectorBench(n){
 const a=new Float64Array(n),b=new Float64Array(n); for(let i=0;i<n;i++){a[i]=Math.sin(i)*0.5;b[i]=Math.cos(i)*0.5}
 const t=performance.now(); let dot=0,min=1e9,max=-1e9;
 for(let i=0;i<n;i++){const v=a[i]*b[i]+a[i]-b[i];dot+=v;if(v<min)min=v;if(v>max)max=v}
 const ms=performance.now()-t, ops=n*4;
 return {items:n,ms:r3(ms),gflops:r3((ops/(ms/1000))/1e9),dot:r3(dot),min:r3(min),max:r3(max)};
}
function score(p){
 const hash=p.sha.mb_s/1000, utxo=p.utxo.utxo_s/100000, vec=p.vector.gflops, api=p.api.ok/(p.api.tested||1);
 const memHealth=Math.max(0,100-(p.memory_after.rss_mb-p.memory_before.rss_mb)/10);
 const s=(hash*220)+(utxo*180)+(vec*120)+(api*250)+(memHealth*2);
 return {score:r3(s),hash_gb_s:r3(hash),utxo_index_100k_s:r3(utxo),vector_gflops:vec,api_ratio:r3(api),mem_health:r3(memHealth)};
}
(async()=>{
 const host={node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,cpus:os.cpus().length,ghz:cpuMHz(),ram_gb:r3(os.totalmem()/1073741824),simd:flags()};
 const registry=repoScan(), api=await apiScan();
 const packets=[], cumulative={score:0,hash_mb_s:0,utxo_s:0,gflops:0,health:0};
 console.log("=== TRILLIONX REAL BTC CRYPTO UTXO VECTOR SYSTEM BENCH ===");
 console.log("TARGET TRILLIONX | HOST CODESPACES SUPPORT ONLY | REAL_ONLY");
 console.log(`MODE ${MODE} PACKETS ${PACKETS} WAIT ${WAIT}ms CPU ${host.cpus} @ ${host.ghz}GHz RAM ${host.ram_gb}GB`);
 for(let i=1;i<=PACKETS;i++){
  const before=mem();
  const sha=shaBench(16+(i%4)*8);
  const pbkdf=pbkdfBench(80000+(i%5)*20000);
  const scrypt=scryptBench(1<<14);
  const utxo=utxoBench(12000+i*1500);
  const vector=vectorBench(180000+i*25000);
  const after=mem();
  const p={i,before,sha,pbkdf,scrypt,utxo,vector,api,memory_before:before,memory_after:after};
  const sc=score(p); p.score=sc; packets.push(p);
  cumulative.score+=sc.score; cumulative.hash_mb_s+=sha.mb_s; cumulative.utxo_s+=utxo.utxo_s; cumulative.gflops+=vector.gflops; cumulative.health+=sc.mem_health;
  console.log(`--- TRX PACKET ${i} ---`);
  console.log(`SHA256 ${sha.mb_s} MB/s | PBKDF2 ${pbkdf.iter_s} iter/s | SCRYPT ${scrypt.ops_s} ops/s`);
  console.log(`UTXO ${utxo.utxo_s} utxo/s | VECTOR ${vector.gflops} GFLOPS | API OK ${api.ok}/${api.tested}`);
  console.log(`MEM RSS ${before.rss_mb}->${after.rss_mb} MB | SCORE ${sc.score} | HEALTH ${sc.mem_health}`);
  await new Promise(r=>setTimeout(r,WAIT));
 }
 const n=packets.length;
 const summary={
  cum_score:r3(cumulative.score),
  avg_score:r3(cumulative.score/n),
  avg_sha256_mb_s:r3(cumulative.hash_mb_s/n),
  avg_utxo_s:r3(cumulative.utxo_s/n),
  avg_vector_gflops:r3(cumulative.gflops/n),
  avg_health:r3(cumulative.health/n),
  cumulative_zettahash_s:r3((cumulative.hash_mb_s*1048576/64)/1e21),
  cumulative_zettaflops_s:r3((cumulative.gflops*1e9)/1e21),
  verdict:"REAL_LOCAL_TRILLIONX_BTC_CRYPTO_UTXO_VECTOR_SYSTEM_BENCH",
  reading:"Measures TRILLIONX runtime/orchestration under real local workloads; not a claim of BTC mining power or supercomputer hardware."
 };
 const report={engine:"TRILLIONX_REAL_BTC_CRYPTO_UTXO_VECTOR_SYSTEM_BENCH",ts:now(),policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",real_only:true,no_fake_zettahash:true,no_fake_gpu:true},host,registry,api,summary,packets};
 const out=`data/trillionx_real_btc_crypto_utxo_vector_system_${Date.now()}.json`;
 fs.writeFileSync(out,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_real_btc_crypto_utxo_vector_system_latest.json",JSON.stringify(report,null,2));
 console.log("=== SUMMARY ===");
 console.log(`CUM SCORE ${summary.cum_score}`);
 console.log(`AVG SHA256 ${summary.avg_sha256_mb_s} MB/s`);
 console.log(`AVG UTXO ${summary.avg_utxo_s} utxo/s`);
 console.log(`AVG VECTOR ${summary.avg_vector_gflops} GFLOPS`);
 console.log(`AVG HEALTH ${summary.avg_health}`);
 console.log(`ZH/s scientific ${summary.cumulative_zettahash_s}`);
 console.log(`ZFLOPS scientific ${summary.cumulative_zettaflops_s}`);
 console.log(`VERDICT ${summary.verdict}`);
 console.log(`REPORT ${out}`);
})();
