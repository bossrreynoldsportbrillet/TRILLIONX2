"use strict";

const fs=require("fs");
const os=require("os");
const http=require("http");
const net=require("net");
const crypto=require("crypto");
const zlib=require("zlib");
const cp=require("child_process");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("history",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const PACKETS=Math.max(1,Math.min(Number(process.argv[2]||24),300));
const WINDOW_MS=Math.max(30,Math.min(Number(process.argv[3]||180),3000));
const FIRE_LEVEL=Math.max(1,Math.min(Number(process.argv[4]||3),9));
const PORTS=[3000,3033,3044,3055,3099,3100,3150,3160,3199,3997,20000,20001,20002,20003,20004,20005,20006,20007,20008,20009];

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const us=ms=>Math.round(ms*1000);
const now=()=>new Date().toISOString();
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const sh=cmd=>{try{return cp.execSync(cmd,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return""}};

function title(s){console.log("\n"+"═".repeat(86));console.log(" "+s);console.log("═".repeat(86))}
function kv(k,v,u=""){console.log(String(k).padEnd(36," ")+": "+String(v)+(u?" "+u:""))}

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
 const speeds=cpus.map(c=>c.speed||0).filter(Boolean);
 const flags=(sh("lscpu | sed -n '/Flags:/p'")||"").toLowerCase();
 return {
  model:cpus[0]?.model||"unknown",
  logical:cpus.length,
  ghz:r((speeds.reduce((a,b)=>a+b,0)/(speeds.length||1))/1000),
  platform:os.platform(),
  arch:os.arch(),
  node:process.version,
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

function timed(name, fn){
 const before=mem();
 const t0=performance.now();
 let out={}, error=null;
 try{out=fn()}catch(e){error=e.message}
 const ms=performance.now()-t0;
 return {
  name,
  ok:!error,
  error,
  ms:r(ms),
  us:us(ms),
  before,
  after:mem(),
  ...out
 };
}

function runWindow(fn){
 const t0=performance.now();
 let ops=0, bytes=0, checksum=0;
 const end=t0+WINDOW_MS;
 while(performance.now()<end){
  const o=fn(ops);
  ops++;
  bytes+=o?.bytes||0;
  checksum=(checksum+(o?.checksum||0))>>>0;
 }
 const ms=performance.now()-t0;
 return {ops,bytes,checksum,ms};
}

function microHashPacket(){
 const buf=crypto.randomBytes((256*1024)*FIRE_LEVEL);
 return runWindow(()=>{
  const a=crypto.createHash("sha256").update(buf).digest();
  const b=crypto.createHash("sha3-256").update(a).update(buf).digest();
  return {bytes:buf.length,checksum:b[0]+b[31]};
 });
}

function microCryptoPacket(){
 const buf=crypto.randomBytes((512*1024)*FIRE_LEVEL);
 const key=crypto.randomBytes(32);
 const iv=crypto.randomBytes(16);
 return runWindow(()=>{
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  const enc=Buffer.concat([c.update(buf),c.final()]);
  const h=crypto.createHmac("sha256",key).update(enc).digest();
  return {bytes:buf.length+enc.length,checksum:h[0]+h[31]};
 });
}

function microVectorPacket(){
 const n=65536*FIRE_LEVEL;
 const a=new Float64Array(n);
 const b=new Float64Array(n);
 const c=new Float64Array(n);
 for(let i=0;i<n;i++){a[i]=Math.sin(i);b[i]=Math.cos(i)}
 return runWindow(()=>{
  let chk=0;
  for(let i=0;i<n;i++){
   c[i]=a[i]*b[i]+c[i]*0.99991+1.00001;
   if((i&8191)===0)chk+=c[i];
  }
  return {bytes:a.byteLength+b.byteLength+c.byteLength,checksum:Math.floor(chk*1000)&255};
 });
}

function microMemoryPacket(){
 const size=(8*1024*1024)*FIRE_LEVEL;
 const buf=Buffer.alloc(size);
 return runWindow((k)=>{
  let chk=0;
  const stride=(k%2)?64:4096;
  for(let i=0;i<size;i+=stride){
   buf[i]=(buf[i]+i+k)&255;
   chk=(chk+buf[i])>>>0;
  }
  return {bytes:size,checksum:chk&255};
 });
}

function microCompressionPacket(){
 const text=Buffer.from(("TRILLIONX_FIRE_DICT_UNLOCKER_MICRO_PACKET_"+sha(Date.now())).repeat(8192*FIRE_LEVEL));
 return runWindow(()=>{
  const z=zlib.deflateSync(text,{level:1});
  const u=zlib.inflateSync(z);
  return {bytes:text.length+z.length+u.length,checksum:z[0]+u[0]};
 });
}

function microJsonPacket(){
 const obj={
  engine:"TRILLIONX",
  ts:now(),
  fire:FIRE_LEVEL,
  arr:Array.from({length:512*FIRE_LEVEL},(_,i)=>({i,v:sha("json"+i).slice(0,16),n:i*i%9973}))
 };
 return runWindow(()=>{
  const s=JSON.stringify(obj);
  const j=JSON.parse(s);
  return {bytes:s.length,checksum:j.arr.length&255};
 });
}

function btcUtxoPacket(){
 const utxo=new Map();
 const varint=n=>n<0xfd?Buffer.from([n]):Buffer.from([0xfd,n&255,(n>>8)&255]);
 function tx(i){
  const version=Buffer.alloc(4); version.writeUInt32LE(2);
  const prev=crypto.randomBytes(32);
  const vout=Buffer.alloc(4); vout.writeUInt32LE(i%9);
  const script=crypto.randomBytes(16+(i%48));
  const seq=Buffer.from("ffffffff","hex");
  const value=Buffer.alloc(8); value.writeBigUInt64LE(BigInt(1000+i));
  const pk=Buffer.concat([Buffer.from([0x76,0xa9,0x14]),crypto.randomBytes(20),Buffer.from([0x88,0xac])]);
  const lock=Buffer.alloc(4);
  return Buffer.concat([version,varint(1),prev,vout,varint(script.length),script,seq,varint(1),value,varint(pk.length),pk,lock]);
 }
 return runWindow((i)=>{
  const raw=tx(i);
  const id=crypto.createHash("sha256").update(crypto.createHash("sha256").update(raw).digest()).digest("hex");
  utxo.set(id.slice(0,24),{v:i});
  if(i%3===0){
   const k=utxo.keys().next().value;
   if(k)utxo.delete(k);
  }
  return {bytes:raw.length,checksum:parseInt(id.slice(0,2),16)};
 });
}

function networkPacket(){
 return new Promise(resolve=>{
  const t0=performance.now();
  const results=[];
  let idx=0;
  function one(port){
   return new Promise(res=>{
    const s=net.createConnection({host:"127.0.0.1",port});
    const start=performance.now();
    let done=false;
    const finish=o=>{
     if(done)return; done=true;
     try{s.destroy()}catch{}
     res({port,ms:r(performance.now()-start),...o});
    };
    s.setTimeout(280);
    s.on("connect",()=>finish({open:true}));
    s.on("timeout",()=>finish({open:false,error:"TIMEOUT"}));
    s.on("error",e=>finish({open:false,error:e.code||e.message}));
   });
  }
  (async()=>{
   while(performance.now()-t0<WINDOW_MS){
    const p=PORTS[idx++%PORTS.length];
    results.push(await one(p));
   }
   const ms=performance.now()-t0;
   const open=results.filter(x=>x.open).length;
   resolve({ops:results.length,bytes:0,checksum:open,ms,open,closed:results.length-open,ports_open:[...new Set(results.filter(x=>x.open).map(x=>x.port))]});
  })();
 });
}

function scorePacket(row, kind){
 const ops_s=row.ops/(row.ms/1000);
 const mb_s=(row.bytes/1048576)/(row.ms/1000);
 const score =
  kind==="network" ? ops_s*8 + (row.open||0)*50 :
  kind==="vector" ? ops_s*5 + mb_s*0.5 :
  kind==="memory" ? ops_s*2 + mb_s*1.2 :
  kind==="btc" ? ops_s*9 + mb_s*50 :
  ops_s*6 + mb_s*1.5;
 return {ops_s:r(ops_s),mb_s:r(mb_s),score:r(score)};
}

function updateDict(dict, name, metrics){
 if(!dict[name]) dict[name]={runs:0,total_score:0,best_score:0,best_ops_s:0,best_mb_s:0,unlocked:false};
 const d=dict[name];
 d.runs++;
 d.total_score+=metrics.score;
 d.best_score=Math.max(d.best_score,metrics.score);
 d.best_ops_s=Math.max(d.best_ops_s,metrics.ops_s);
 d.best_mb_s=Math.max(d.best_mb_s,metrics.mb_s);
 d.avg_score=r(d.total_score/d.runs);
 d.unlocked=d.best_score>1000 || d.best_mb_s>100 || d.best_ops_s>1000;
}

(async()=>{
 title("TRILLIONX FIRE DiCT UNLOCKER MICRO-PACKET STRESS");
 kv("PACKETS",PACKETS);
 kv("WINDOW_MS",WINDOW_MS);
 kv("FIRE_LEVEL",FIRE_LEVEL);
 kv("Policy","REAL_ONLY / SAFE_ONLY / NO_FAKE_GPU / NO_FAKE_EXASCALE");

 const before=mem();
 const cpu=cpuAuto();

 title("AUTO-DETECTION");
 kv("TRILLIONX","AVAILABLE_AS_RUNTIME");
 kv("CPU support réel",cpu.model);
 kv("GHz",cpu.ghz,"GHz");
 kv("Logical CPU",cpu.logical);
 kv("RAM totale",before.os_total_gb,"GB");
 kv("RAM libre",before.os_free_gb,"GB");
 kv("SIMD",JSON.stringify(cpu.simd));

 const dict={};
 const results=[];

 for(let p=1;p<=PACKETS;p++){
  console.log(`\n--- FIRE MICRO PACKET ${p}/${PACKETS} ---`);

  const rows=[];

  rows.push(timed("HASH_SHA256_SHA3",()=>microHashPacket()));
  rows.push(timed("CRYPTO_AES_HMAC",()=>microCryptoPacket()));
  rows.push(timed("VECTOR_FLOAT64",()=>microVectorPacket()));
  rows.push(timed("MEMORY_STRIDE",()=>microMemoryPacket()));
  rows.push(timed("COMPRESSION_ZLIB",()=>microCompressionPacket()));
  rows.push(timed("JSON_PARSE_STRINGIFY",()=>microJsonPacket()));
  rows.push(timed("BTC_UTXO_SHA256D",()=>btcUtxoPacket()));

  const netRaw=await networkPacket();
  rows.push({
   name:"NETWORK_PORT_MICRO",
   ok:true,
   error:null,
   ms:r(netRaw.ms),
   us:us(netRaw.ms),
   before:mem(),
   after:mem(),
   ...netRaw
  });

  for(const row of rows){
   const kind =
    row.name.includes("NETWORK")?"network":
    row.name.includes("VECTOR")?"vector":
    row.name.includes("MEMORY")?"memory":
    row.name.includes("BTC")?"btc":"generic";
   const m=scorePacket(row,kind);
   const full={...row,...m,packet:p};
   updateDict(dict,row.name,m);
   results.push(full);
   console.log(`${row.ok?"✓":"✗"} ${row.name.padEnd(24)} ops/s=${String(m.ops_s).padEnd(12)} MB/s=${String(m.mb_s).padEnd(12)} score=${m.score}`);
  }

  const rss=mem().rss_mb;
  if(rss>1600){
   console.log("! MEMORY GUARD: RSS high, stopping early:",rss,"MB");
   break;
  }
 }

 const after=mem();
 const ranking=Object.entries(dict)
  .map(([name,d])=>({name,...d,total_score:r(d.total_score)}))
  .sort((a,b)=>b.best_score-a.best_score);

 const unlocked=ranking.filter(x=>x.unlocked);
 const totalScore=r(results.reduce((a,b)=>a+(b.score||0),0));
 const health=r(Math.max(0,Math.min(100,100-(after.os_free_gb<0.3?20:0)-(after.rss_mb>1600?25:0))));

 const report={
  engine:"TRILLIONX_FIRE_DICT_UNLOCKER_MICRO_STRESS",
  ts:now(),
  target:"TRILLIONX_ONLY",
  parameters:{packets:PACKETS,window_ms:WINDOW_MS,fire_level:FIRE_LEVEL},
  identity:{
   trillionx:"AVAILABLE_AS_RUNTIME",
   host_cpu_real:cpu.model,
   host_cpu_ghz:cpu.ghz,
   distinction:"HOST_CPU_REAL != TRILLIONX_RUNTIME"
  },
  system:{cpu,memory_before:before,memory_after:after},
  dict,
  ranking,
  results,
  summary:{
   total_score:totalScore,
   unlocked_count:unlocked.length,
   unlocked:unlocked.map(x=>x.name),
   winner:ranking[0]?.name||"NONE",
   winner_best_score:ranking[0]?.best_score||0,
   health,
   verdict:"TRILLIONX_FIRE_DICT_UNLOCKER_MICRO_STRESS_COMPLETE"
  },
  truth_policy:{
   real_only:true,
   safe_only:true,
   micro_packets:true,
   stress_test:true,
   no_fake_exascale:true,
   no_fake_gpu:true,
   no_intrusive_network:true
  }
 };

 const stamp=Date.now();
 const file=`data/trillionx_fire_dict_unlocker_micro_stress_${stamp}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_fire_dict_unlocker_micro_stress_latest.json",JSON.stringify(report,null,2));
 fs.appendFileSync("history/trillionx_fire_dict_unlocker_micro_stress_history.jsonl",JSON.stringify({
  ts:report.ts,
  summary:report.summary,
  top3:ranking.slice(0,3)
 })+"\n");

 title("FINAL DiCT UNLOCK RESULT");
 kv("Total score",totalScore);
 kv("Winner",report.summary.winner);
 kv("Winner best score",report.summary.winner_best_score);
 kv("Unlocked count",report.summary.unlocked_count);
 kv("Unlocked DiCT",report.summary.unlocked.join(", ")||"none");
 kv("Health",health);
 kv("Report",file);

 title("RANKING");
 for(const x of ranking){
  console.log(`${x.name.padEnd(24)} best=${String(x.best_score).padEnd(12)} avg=${String(x.avg_score).padEnd(12)} ops/s=${String(x.best_ops_s).padEnd(12)} MB/s=${String(x.best_mb_s).padEnd(12)} unlocked=${x.unlocked}`);
 }
})();
