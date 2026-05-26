const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");
const mode=process.argv[2]||"safe";
const packets=Number(process.argv[3]||12);
const wait=Number(process.argv[4]||250);
fs.mkdirSync("data",{recursive:true});

const DETECT_FILE="data/trillionx_auto_detect_required_latest.json";
if(!fs.existsSync(DETECT_FILE)){
  console.error("AUTO_DETECT_REQUIRED: run node TRILLIONX_AUTO_DETECT_REQUIRED.js first");
  process.exit(2);
}
const AUTO_DETECT=JSON.parse(fs.readFileSync(DETECT_FILE,"utf8"));
if(!AUTO_DETECT.truth_policy || !AUTO_DETECT.truth_policy.auto_detection_required){
  console.error("AUTO_DETECT_INVALID");
  process.exit(2);
}

const now=Date.now();
const mb=x=>x/1024/1024,gb=x=>x/1024/1024/1024;
const r=n=>Math.round(n*1000)/1000;
const sleep=ms=>new Promise(a=>setTimeout(a,ms));
const flags=()=>{let s="";try{s=fs.readFileSync("/proc/cpuinfo","utf8")}catch{};let f=(s.match(/flags\s*: (.*)/)||[])[1]||"";return {
avx:/\bavx\b/.test(f),avx2:/\bavx2\b/.test(f),avx512:/\bavx512f\b/.test(f),
fma:/\bfma\b/.test(f),aes:/\baes\b/.test(f),sha_ni:/\bsha_ni\b/.test(f),
sse4_2:/\bsse4_2\b/.test(f)
}}
function host(){
 const c=os.cpus(),m=process.memoryUsage();
 return {runtime:"TRILLIONX_CRYPTO_PACKET_ENGINE",cpu_logical:c.length,cpu_model:c[0]?.model||"unknown",
 cpu_ghz:r((c[0]?.speed||0)/1000),ram_gb:r(gb(os.totalmem())),free_gb:r(gb(os.freemem())),
 node:process.version,simd:flags(),memory:{rss_mb:r(mb(m.rss)),heap_mb:r(mb(m.heapUsed)),external_mb:r(mb(m.external))}}
}
function shaBench(inputMB,rounds){
 const buf=crypto.randomBytes(inputMB*1024*1024); let h="",t=performance.now();
 for(let i=0;i<rounds;i++)h=crypto.createHash("sha256").update(buf).digest("hex");
 let ms=performance.now()-t, bytes=inputMB*1024*1024*rounds;
 return {algo:"sha256",input_mb:inputMB,rounds,ms:r(ms),hash_mb_s:r(bytes/1024/1024/(ms/1000)),last:h.slice(0,16)}
}
function pbkdfBench(iter){
 const t=performance.now();
 const out=crypto.pbkdf2Sync("TRILLIONX","ZETTA_PACKET",iter,32,"sha512");
 const ms=performance.now()-t;
 return {algo:"pbkdf2_sha512",iterations:iter,ms:r(ms),iter_s:r(iter/(ms/1000)),last:out.toString("hex").slice(0,16)}
}
function scryptBench(N){
 const t=performance.now();
 let ok=true,out="";
 try{out=crypto.scryptSync("TRILLIONX","ZETTA_PACKET",64,{N,r:8,p:1,maxmem:256*1024*1024}).toString("hex")}
 catch(e){ok=false;out=e.message}
 const ms=performance.now()-t;
 return {algo:"scrypt",N,ok,ms:r(ms),ops_s:ok?r(1000/ms):0,last:String(out).slice(0,32)}
}
function matrixBench(n,loops){
 let a=new Float64Array(n*n),b=new Float64Array(n*n),c=new Float64Array(n*n);
 for(let i=0;i<a.length;i++){a[i]=(i%97)/97;b[i]=(i%89)/89}
 let t=performance.now(),chk=0;
 for(let l=0;l<loops;l++)for(let i=0;i<n;i++)for(let k=0;k<n;k++){let aik=a[i*n+k];for(let j=0;j<n;j++)c[i*n+j]+=aik*b[k*n+j]}
 for(let i=0;i<c.length;i+=Math.max(1,Math.floor(c.length/32)))chk+=c[i];
 let ms=performance.now()-t,ops=2*n*n*n*loops;
 return {algo:"float64_matrix",n,loops,ms:r(ms),gflops:r(ops/(ms/1000)/1e9),checksum:r(chk)}
}
function compressBench(inputMB){
 const buf=crypto.randomBytes(inputMB*1024*1024);let t=performance.now();
 const out=zlib.deflateSync(buf,{level:1});let ms=performance.now()-t;
 return {algo:"deflate_l1",input_mb:inputMB,out_mb:r(mb(out.length)),ratio:r(out.length/buf.length),ms:r(ms),mb_s:r(inputMB/(ms/1000))}
}
function vrMirror(count){
 let t=performance.now(),x=0;
 for(let i=0;i<count;i++)x=(x+((i*2654435761)>>>0))&0xffffffff;
 let ms=performance.now()-t;
 return {algo:"vr_mirror_index",mirrors:count,ms:r(ms),mirror_ops_s:r(count/(ms/1000)),checksum:x}
}
function params(level){
 const m={safe:1,world:2,fire:3,omega:4}[mode]||1;
 return {
  shaMB:Math.min(64,4+level*m*2),
  shaRounds:Math.min(24,2+level*m),
  pbkdf:Math.min(900000,50000+level*m*35000),
  scryptN:2**Math.min(16,12+Math.floor(level/2)),
  matN:Math.min(96,24+level*m*4),
  matLoops:Math.min(8,1+Math.floor(level/3)),
  compMB:Math.min(48,4+level*m*2),
  mirrors:Math.min(4000000,100000*level*m)
 }
}
function score(p){
 const hash_b_s=p.sha.hash_mb_s*1024*1024;
 const flop_s=p.matrix.gflops*1e9;
 const zhash=hash_b_s/1e21;
 const zflops=flop_s/1e21;
 const crypto=(p.sha.hash_mb_s/12)+(p.pbkdf.iter_s/50000)+(p.scrypt.ops_s*30);
 const mem=p.comp.mb_s/100+p.vr.mirror_ops_s/5e6;
 const health=Math.max(0,100-(p.event_p95_ms>80?10:0)-(p.mem.rss_mb>900?10:0)-(!p.host.simd.avx2?5:0));
 return {
  packet_score:r(crypto+mem+p.matrix.gflops*2),
  hash_gb_s:r(p.sha.hash_mb_s/1024),
  hash_tb_s:r(p.sha.hash_mb_s/1024/1024),
  hash_pb_s:r(p.sha.hash_mb_s/1024/1024/1024),
  zettahash_s:Number(zhash.toExponential(6)),
  gflops:r(p.matrix.gflops),
  tflops:r(p.matrix.gflops/1000),
  pflops:r(p.matrix.gflops/1e6),
  zettaflops_s:Number(zflops.toExponential(6)),
  health:r(health)
}
}
async function main(){
 const H=host(),list=[];
 console.log("=== TRILLIONX CRYPTO ZETTA PACKET BENCH ===");
 console.log("MODE:",mode,"PACKETS:",packets,"WAIT:",wait+"ms");
 console.log("CPU PROFILE:",H.cpu_logical+" logical @ "+H.cpu_ghz+"GHz","RAM:",H.ram_gb+"GB");
 console.log("SIMD:",JSON.stringify(H.simd));
 for(let i=1;i<=packets;i++){
  await sleep(wait);
  const P=params(i),ev=[];
  for(let k=0;k<7;k++){let t=performance.now();await sleep(0);ev.push(performance.now()-t)}
  const p={packet:i,params:P,host:H,
   sha:shaBench(P.shaMB,P.shaRounds),
   pbkdf:pbkdfBench(P.pbkdf),
   scrypt:scryptBench(P.scryptN),
   matrix:matrixBench(P.matN,P.matLoops),
   comp:compressBench(P.compMB),
   vr:vrMirror(P.mirrors),
   mem:{rss_mb:r(mb(process.memoryUsage().rss)),heap_mb:r(mb(process.memoryUsage().heapUsed)),external_mb:r(mb(process.memoryUsage().external))},
   event_p95_ms:r(ev.sort((a,b)=>a-b)[Math.floor(ev.length*.95)]||0)
  };
  p.score=score(p); list.push(p);
  console.log(`--- CRYPTO PACKET ${i} ---`);
  console.log(`SHA256 ${p.sha.hash_mb_s} MB/s | PBKDF2 ${p.pbkdf.iter_s} iter/s | SCRYPT ${p.scrypt.ops_s} ops/s`);
  console.log(`MATRIX ${p.matrix.gflops} GFLOPS | COMP ${p.comp.mb_s} MB/s | VR ${p.vr.mirror_ops_s} ops/s`);
  console.log(`SCORE ${p.score.packet_score} | HASH ${p.score.hash_gb_s} GB/s ${p.score.zettahash_s} ZH/s | FLOPS ${p.score.gflops} GFLOPS ${p.score.zettaflops_s} ZFLOPS | HEALTH ${p.score.health}`);
 }
 const sum=list.reduce((a,p)=>{a.score+=p.score.packet_score;
a.zh+=p.score.zettahash_s;
a.zf+=p.score.zettaflops_s;
a.health+=p.score.health;
a.hash+=p.sha.hash_mb_s;
a.gf+=p.matrix.gflops;
return a},{score:0,zh:0,zf:0,health:0,hash:0,gf:0});
 const best=list.slice().sort((a,b)=>b.score.packet_score-a.score.packet_score)[0];
 const report={engine:"TRILLIONX",bench:"CRYPTO_ZETTA_PACKET_BENCH",mode,packets,wait_ms:wait,host:H,results:list,
  cumulative:{score:r(sum.score),avg_health:r(sum.health/list.length),avg_sha256_mb_s:r(sum.hash/list.length),avg_matrix_gflops:r(sum.gf/list.length),
  cumulative_zettahash_s:Number(sum.zh.toExponential(6)),
  cumulative_zettaflops_s:Number(sum.zf.toExponential(6)),
  avg_hash_gb_s:r((sum.hash/list.length)/1024),
  avg_hash_tb_s:r((sum.hash/list.length)/1024/1024),
  avg_tflops:r((sum.gf/list.length)/1000),
  best_packet:best.packet,
  best_score:best.score.packet_score},
  truth_policy:{real_only:true,mini_packets:true,cumulative_projection:true,no_fake_zettahash:true,no_fake_zettaflops:true,world_result_requires_external_reproducible_hosts:true},
  verdict:"REAL_LOCAL_CRYPTO_PACKET_BENCH_CUMULATIVE_WORLD_READING_INDICATIVE"};
 const file=`data/trillionx_crypto_zetta_packet_${now}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_crypto_zetta_packet_latest.json",JSON.stringify(report,null,2));
 console.log("=== SUMMARY ===");
 console.log("CUM SCORE:",report.cumulative.score);
 console.log("AVG HEALTH:",report.cumulative.avg_health);
 console.log("AVG SHA256 MB/s:",report.cumulative.avg_sha256_mb_s);
 console.log("AVG MATRIX GFLOPS:",report.cumulative.avg_matrix_gflops);
 console.log("AVG HASH GB/s:",report.cumulative.avg_hash_gb_s);
 console.log("AVG HASH TB/s:",report.cumulative.avg_hash_tb_s);
 console.log("CUM ZH/s scientific:",report.cumulative.cumulative_zettahash_s);
 console.log("AVG TFLOPS:",report.cumulative.avg_tflops);
 console.log("CUM ZFLOPS scientific:",report.cumulative.cumulative_zettaflops_s);
 console.log("BEST PACKET:",report.cumulative.best_packet);
 console.log("VERDICT:",report.verdict);
 console.log("REPORT =",file);
}
main().catch(e=>{console.error(e);process.exit(1)});
