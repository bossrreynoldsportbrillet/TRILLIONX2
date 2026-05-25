"use strict";

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const net=require("net");
const http=require("http");
const cp=require("child_process");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("history",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const PACKETS=Math.max(1,Math.min(Number(process.argv[2]||20),500));
const WINDOW_MS=Math.max(50,Math.min(Number(process.argv[3]||300),10000));
const BUF_MB=Math.max(1,Math.min(Number(process.argv[4]||4),64));
const PORTS=[3000,3033,3044,3055,3100,3110,3111,3112,3113,3114,3115,3116,3117,3118,3119,3150,3160,3199,5000,8000,8080,8888,9000,9229];

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const now=()=>new Date().toISOString();
const sh=cmd=>{try{return cp.execSync(cmd,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return null}};
const sha256=b=>crypto.createHash("sha256").update(b).digest();
const sha3=b=>crypto.createHash("sha3-256").update(b).digest();
const blake=b=>crypto.createHash("blake2b512").update(b).digest();
const hex=b=>Buffer.from(b).toString("hex");
const dbl=b=>sha256(sha256(b));

function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}
function kv(k,v,u=""){console.log(String(k).padEnd(34," ")+": "+String(v)+(u?" "+u:""))}
function line(){console.log("─".repeat(78))}

function mem(){
 const m=process.memoryUsage();
 return {
  rss_mb:r(m.rss/1048576),
  heap_mb:r(m.heapUsed/1048576),
  external_mb:r(m.external/1048576),
  arraybuf_mb:r((m.arrayBuffers||0)/1048576),
  os_total_gb:r(os.totalmem()/1073741824),
  os_free_gb:r(os.freemem()/1073741824),
  load1:r(os.loadavg()[0])
 };
}

function cpuAuto(){
 const cpus=os.cpus()||[];
 const model=cpus[0]?.model||"unknown";
 const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
 const avgMHz=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:0;
 const flags=(sh("lscpu | sed -n '/Flags:/p'")||"").toLowerCase();
 return {
  model,
  logical:cpus.length,
  speed_mhz:r(avgMHz),
  speed_ghz:r(avgMHz/1000),
  arch:os.arch(),
  platform:os.platform(),
  simd:{
   sse:flags.includes(" sse "),
   sse2:flags.includes("sse2"),
   sse4_1:flags.includes("sse4_1"),
   sse4_2:flags.includes("sse4_2"),
   avx:flags.includes(" avx "),
   avx2:flags.includes("avx2"),
   avx512:flags.includes("avx512"),
   aes:flags.includes(" aes "),
   sha_ni:flags.includes(" sha_ni ")
  }
 };
}

function benchAlgo(name, fn, bytesPerOp=0, weight=1){
 const start=performance.now();
 let ops=0, bytes=0, checksum=0;
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   const out=fn(ops);
   ops++;
   bytes+=bytesPerOp;
   if(out){
    if(Buffer.isBuffer(out)) checksum=(checksum+out[0]+out[out.length-1])>>>0;
    else checksum=(checksum+Number(out))>>>0;
   }
  }
 }
 const ms=performance.now()-start;
 const ops_s=ops/(ms/1000);
 const mb_s=bytesPerOp?((bytes/1048576)/(ms/1000)):0;
 const score=(ops_s*weight)+(mb_s*weight*200);
 return {name,ms:r(ms),ops,ops_s:r(ops_s),mb_s:r(mb_s),score:r(score),checksum};
}

function varint(n){return n<0xfd?Buffer.from([n]):Buffer.from([0xfd,n&255,(n>>8)&255])}

function btcTx(i){
 const version=Buffer.alloc(4); version.writeUInt32LE(2);
 const prev=crypto.randomBytes(32);
 const vout=Buffer.alloc(4); vout.writeUInt32LE(i%9);
 const script=crypto.randomBytes(32+(i%32));
 const seq=Buffer.from("ffffffff","hex");
 const value=Buffer.alloc(8); value.writeBigUInt64LE(BigInt(1000+i));
 const pk=Buffer.concat([Buffer.from([0x76,0xa9,0x14]),crypto.randomBytes(20),Buffer.from([0x88,0xac])]);
 const lock=Buffer.alloc(4);
 return Buffer.concat([version,varint(1),prev,vout,varint(script.length),script,seq,varint(1),value,varint(pk.length),pk,lock]);
}

function merkleRoot(arr){
 if(!arr.length)return Buffer.alloc(32);
 let layer=arr.map(x=>Buffer.from(x));
 while(layer.length>1){
  if(layer.length%2)layer.push(layer[layer.length-1]);
  const next=[];
  for(let i=0;i<layer.length;i+=2)next.push(dbl(Buffer.concat([layer[i],layer[i+1]])));
  layer=next;
 }
 return layer[0];
}

function benchUtxoMerkle(){
 const start=performance.now();
 let tx=0, bytes=0, checksum=0;
 const utxo=new Map();
 const txids=[];
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   const raw=btcTx(tx);
   const id=dbl(raw);
   const key=hex(id).slice(0,32);
   txids.push(id);
   utxo.set(key,{value:1000+tx,height:tx%100000});
   if(tx%3===0){
    const k=utxo.keys().next().value;
    if(k)utxo.delete(k);
   }
   if(txids.length>2048)txids.splice(0,1024);
   if(tx%64===0)checksum=(checksum+merkleRoot(txids.slice(-256))[0])>>>0;
   tx++;
   bytes+=raw.length;
  }
 }
 const ms=performance.now()-start;
 return {
  name:"BTC_UTXO_MERKLE",
  ms:r(ms),
  ops:tx,
  ops_s:r(tx/(ms/1000)),
  mb_s:r((bytes/1048576)/(ms/1000)),
  utxo_size:utxo.size,
  score:r((tx/(ms/1000))*1.2+((bytes/1048576)/(ms/1000))*120),
  checksum
 };
}

function benchEthLike(){
 const start=performance.now();
 let blocks=0, tx=0, gas=0, bytes=0;
 let parent=crypto.randomBytes(32);
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   const txs=[];
   const n=16+(blocks%32);
   for(let i=0;i<n;i++){
    const payload=Buffer.concat([crypto.randomBytes(20),crypto.randomBytes(20),Buffer.from(`${blocks}:${i}`),crypto.randomBytes(96)]);
    txs.push(sha3(payload));
    gas+=21000+payload.length*16;
    bytes+=payload.length;
    tx++;
   }
   parent=sha3(Buffer.concat([parent,merkleRoot(txs),Buffer.from(String(blocks))]));
   blocks++;
  }
 }
 const ms=performance.now()-start;
 return {
  name:"ETH_LIKE_SHA3_BLOCKS",
  ms:r(ms),
  ops:tx,
  ops_s:r(tx/(ms/1000)),
  blocks,
  blocks_s:r(blocks/(ms/1000)),
  mb_s:r((bytes/1048576)/(ms/1000)),
  gas_s:r(gas/(ms/1000)),
  score:r((tx/(ms/1000))*0.8+(blocks/(ms/1000))*20+((bytes/1048576)/(ms/1000))*100),
  checksum:parent[0]+parent[31]
 };
}

function benchVector(){
 const n=1<<20;
 const a=new Float64Array(n),b=new Float64Array(n),c=new Float64Array(n);
 for(let i=0;i<n;i++){a[i]=Math.sin(i);b[i]=Math.cos(i)}
 const start=performance.now();
 let loops=0, ops=0, checksum=0;
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   for(let i=0;i<n;i++) c[i]=a[i]*b[i]+c[i]*0.99991+1.00001;
   checksum+=c[loops%n];
   loops++;
   ops+=n*4;
  }
 }
 const ms=performance.now()-start;
 const gflops=(ops/(ms/1000))/1e9;
 const stream=((a.byteLength+b.byteLength+c.byteLength)*loops/1048576)/(ms/1000);
 return {name:"VECTOR_FLOAT64_MEMORY",ms:r(ms),ops:loops,ops_s:r(loops/(ms/1000)),gflops:r(gflops),mb_s:r(stream),score:r(gflops*2000+stream*0.5),checksum:r(checksum)};
}

function connectPort(port,timeout=350){
 return new Promise(resolve=>{
  const t0=performance.now();
  const s=net.createConnection({port,host:"127.0.0.1"});
  const done=o=>{try{s.destroy()}catch{} resolve({...o,port,ms:r(performance.now()-t0)})};
  s.setTimeout(timeout);
  s.on("connect",()=>done({open:true}));
  s.on("timeout",()=>done({open:false,error:"timeout"}));
  s.on("error",e=>done({open:false,error:e.code||e.message}));
 });
}

async function networkAuto(){
 const results=[];
 for(const p of PORTS) results.push(await connectPort(p));
 const open=results.filter(x=>x.open).map(x=>x.port);
 return {ports_scanned:PORTS.length,ports_open:open,port_results:results};
}

function classify(results){
 const ranked=[...results].sort((a,b)=>b.score-a.score);
 const best=ranked[0];
 return {
  best_algorithm:best.name,
  best_score:best.score,
  best_ops_s:best.ops_s,
  best_mb_s:best.mb_s,
  ranking:ranked.map((x,i)=>({
   rank:i+1,
   algorithm:x.name,
   score:x.score,
   ops_s:x.ops_s,
   mb_s:x.mb_s||0,
   gflops:x.gflops||0,
   blocks_s:x.blocks_s||0,
   gas_s:x.gas_s||0,
   utxo_size:x.utxo_size||0
  }))
 };
}

(async()=>{
 title("TRILLIONX BLOCKCHAIN ALGORITHM STRESS RANK");
 kv("Mode","TRILLIONX_ONLY");
 kv("Packets",PACKETS);
 kv("Window par packet",WINDOW_MS,"ms");
 kv("Buffer par packet crypto",BUF_MB,"MB");

 const cpu=cpuAuto();
 const before=mem();
 const netBefore=await networkAuto();

 title("AUTO-DETECTION");
 kv("TRILLIONX","AVAILABLE_AS_SOFTWARE_ORCHESTRATOR_RUNTIME");
 kv("Support CPU réel",cpu.model);
 kv("GHz détecté",cpu.speed_ghz,"GHz");
 kv("Logical CPU",cpu.logical);
 kv("RAM totale",before.os_total_gb,"GB");
 kv("RAM libre avant",before.os_free_gb,"GB");
 kv("Ports ouverts avant",netBefore.ports_open.join(", ")||"aucun");
 kv("Distinction","HOST_CPU_REAL != TRILLIONX_RUNTIME");

 const buf=crypto.randomBytes(BUF_MB*1024*1024);
 const key=crypto.randomBytes(32);
 const iv=crypto.randomBytes(16);
 const small=crypto.randomBytes(4096);
 const password=crypto.randomBytes(32);
 const salt=crypto.randomBytes(16);

 title("STRESS RUN");
 const results=[];

 const sha256d=benchAlgo("BTC_SHA256D",()=>dbl(buf),buf.length,1.0);
 results.push(sha256d); kv("BTC_SHA256D",`${sha256d.ops_s} ops/s | ${sha256d.mb_s} MB/s | score ${sha256d.score}`);

 const sha3r=benchAlgo("ETH_SHA3_256",()=>sha3(buf),buf.length,0.95);
 results.push(sha3r); kv("ETH_SHA3_256",`${sha3r.ops_s} ops/s | ${sha3r.mb_s} MB/s | score ${sha3r.score}`);

 const blaker=benchAlgo("BLAKE2B_512",()=>blake(buf),buf.length,1.1);
 results.push(blaker); kv("BLAKE2B_512",`${blaker.ops_s} ops/s | ${blaker.mb_s} MB/s | score ${blaker.score}`);

 const aesr=benchAlgo("AES_256_CBC",()=>{
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  return Buffer.concat([c.update(buf),c.final()]);
 },buf.length,0.9);
 results.push(aesr); kv("AES_256_CBC",`${aesr.ops_s} ops/s | ${aesr.mb_s} MB/s | score ${aesr.score}`);

 const hmacr=benchAlgo("HMAC_SHA256",()=>crypto.createHmac("sha256",key).update(buf).digest(),buf.length,0.8);
 results.push(hmacr); kv("HMAC_SHA256",`${hmacr.ops_s} ops/s | ${hmacr.mb_s} MB/s | score ${hmacr.score}`);

 const pbkdf2r=benchAlgo("PBKDF2_SHA256_1000",()=>crypto.pbkdf2Sync(password,salt,1000,32,"sha256"),0,3.0);
 results.push(pbkdf2r); kv("PBKDF2_SHA256_1000",`${pbkdf2r.ops_s} ops/s | score ${pbkdf2r.score}`);

 const scryptr=benchAlgo("SCRYPT_N16384",()=>crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}),0,8.0);
 results.push(scryptr); kv("SCRYPT_N16384",`${scryptr.ops_s} ops/s | score ${scryptr.score}`);

 const utxo=benchUtxoMerkle();
 results.push(utxo); kv("BTC_UTXO_MERKLE",`${utxo.ops_s} tx/s | ${utxo.mb_s} MB/s | UTXO ${utxo.utxo_size} | score ${utxo.score}`);

 const eth=benchEthLike();
 results.push(eth); kv("ETH_LIKE_SHA3_BLOCKS",`${eth.ops_s} tx/s | ${eth.blocks_s} blocks/s | gas/s ${eth.gas_s} | score ${eth.score}`);

 const vector=benchVector();
 results.push(vector); kv("VECTOR_FLOAT64_MEMORY",`${vector.gflops} GFLOPS | ${vector.mb_s} MB/s | score ${vector.score}`);

 const after=mem();
 const netAfter=await networkAuto();
 const rank=classify(results);

 title("FINAL RANKING - CHIFFRES");
 for(const x of rank.ranking){
  console.log(
   String("#"+x.rank).padEnd(5)+
   String(x.algorithm).padEnd(26)+
   " score="+String(x.score).padEnd(12)+
   " ops/s="+String(x.ops_s).padEnd(14)+
   " MB/s="+String(x.mb_s).padEnd(12)+
   " GFLOPS="+String(x.gflops).padEnd(10)+
   " blocks/s="+String(x.blocks_s).padEnd(10)+
   " gas/s="+String(x.gas_s)
  );
 }

 title("WINNER");
 kv("Meilleur algorithme TRILLIONX",rank.best_algorithm);
 kv("Meilleur score",rank.best_score);
 kv("Meilleur ops/s",rank.best_ops_s);
 kv("Meilleur MB/s",rank.best_mb_s);
 kv("CPU GHz support",cpu.speed_ghz,"GHz");
 kv("RAM libre après",after.os_free_gb,"GB");
 kv("Ports ouverts après",netAfter.ports_open.join(", ")||"aucun");

 const totalScore=results.reduce((s,x)=>s+x.score,0);
 const health=Math.max(0,Math.min(100,100-(after.os_free_gb<0.3?20:0)-(netAfter.ports_open.length===0?10:0)));

 title("SUMMARY FINAL");
 kv("Total score cumulé",r(totalScore));
 kv("Health",r(health));
 kv("Verdict","REAL_LOCAL_TRILLIONX_BLOCKCHAIN_ALGO_STRESS_RANK_COMPLETE");
 kv("Lecture","TRILLIONX runtime mesuré; Xeon = support Codespaces réel");

 const report={
  engine:"TRILLIONX_BLOCKCHAIN_ALGO_STRESS_RANK",
  ts:now(),
  target:"TRILLIONX_ONLY",
  parameters:{packets:PACKETS,window_ms:WINDOW_MS,buffer_mb:BUF_MB},
  identity:{
   trillionx:"AVAILABLE_AS_SOFTWARE_ORCHESTRATOR_RUNTIME",
   host_cpu_real:cpu.model,
   host_cpu_ghz:cpu.speed_ghz,
   distinction:"HOST_CPU_REAL != TRILLIONX_RUNTIME"
  },
  system:{cpu,memory_before:before,memory_after:after},
  network:{before:netBefore,after:netAfter},
  results,
  ranking:rank,
  summary:{
   total_score:r(totalScore),
   winner:rank.best_algorithm,
   winner_score:rank.best_score,
   winner_ops_s:rank.best_ops_s,
   winner_mb_s:rank.best_mb_s,
   health:r(health),
   verdict:"REAL_LOCAL_TRILLIONX_BLOCKCHAIN_ALGO_STRESS_RANK_COMPLETE"
  },
  truth_policy:{
   real_only:true,
   trillionx_only:true,
   synthetic_local_blockchain_workloads:true,
   not_mainnet_mining:true,
   no_fake_zettahash:true,
   no_fake_exascale:true,
   no_fake_gpu:true,
   codespaces_limits_apply:true
  }
 };

 const stamp=Date.now();
 const file=`data/trillionx_blockchain_algo_stress_rank_${stamp}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_blockchain_algo_stress_rank_latest.json",JSON.stringify(report,null,2));
 fs.appendFileSync("history/trillionx_blockchain_algo_stress_rank_history.jsonl",JSON.stringify({ts:report.ts,summary:report.summary,ranking:rank.ranking.slice(0,5)})+"\n");

 kv("Report JSON",file);
 line();
})();
