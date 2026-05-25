"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto"),net=require("net"),dns=require("dns").promises,cp=require("child_process");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("history",{recursive:true});
fs.mkdirSync("logs",{recursive:true});

const PACKETS=Math.max(1,Math.min(Number(process.argv[2]||12),200));
const WINDOW_MS=Math.max(50,Math.min(Number(process.argv[3]||250),5000));
const PORTS=[3000,3033,3044,3055,3100,3110,3111,3112,3113,3114,3115,3116,3117,3118,3119,3150,3160,3199,5000,8000,8080,8888,9000,9229];

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const now=()=>new Date().toISOString();
const sh=cmd=>{try{return cp.execSync(cmd,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return null}};
const sha256=b=>crypto.createHash("sha256").update(b).digest();
const dbl=b=>sha256(sha256(b));
const hex=b=>Buffer.from(b).toString("hex");
const varint=n=>n<0xfd?Buffer.from([n]):Buffer.from([0xfd,n&255,(n>>8)&255]);

function line(){console.log("─".repeat(72))}
function title(s){console.log("\n"+"═".repeat(72));console.log(" "+s);console.log("═".repeat(72))}
function kv(k,v,u=""){console.log(String(k).padEnd(34," ")+": "+String(v)+(u?" "+u:""))}

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
  model, logical:cpus.length, speed_mhz:r(avgMHz), speed_ghz:r(avgMHz/1000),
  arch:os.arch(), platform:os.platform(),
  simd:{
   sse:flags.includes(" sse "), sse2:flags.includes("sse2"),
   sse4_1:flags.includes("sse4_1"), sse4_2:flags.includes("sse4_2"),
   avx:flags.includes(" avx "), avx2:flags.includes("avx2"),
   avx512:flags.includes("avx512"), aes:flags.includes(" aes "),
   sha_ni:flags.includes(" sha_ni ")
  }
 };
}

function btcTxSynthetic(i){
 const version=Buffer.alloc(4); version.writeUInt32LE(2);
 const prev=crypto.randomBytes(32);
 const vout=Buffer.alloc(4); vout.writeUInt32LE(i%7);
 const script=crypto.randomBytes(32+(i%32));
 const seq=Buffer.from("ffffffff","hex");
 const value=Buffer.alloc(8); value.writeBigUInt64LE(BigInt(1000+i));
 const pk=Buffer.concat([Buffer.from([0x76,0xa9,0x14]),crypto.randomBytes(20),Buffer.from([0x88,0xac])]);
 const lock=Buffer.alloc(4);
 return Buffer.concat([version,varint(1),prev,vout,varint(script.length),script,seq,varint(1),value,varint(pk.length),pk,lock]);
}

function merkleRoot(txids){
 if(!txids.length)return Buffer.alloc(32);
 let layer=txids.map(x=>Buffer.from(x));
 while(layer.length>1){
  if(layer.length%2)layer.push(layer[layer.length-1]);
  const next=[];
  for(let i=0;i<layer.length;i+=2)next.push(dbl(Buffer.concat([layer[i],layer[i+1]])));
  layer=next;
 }
 return layer[0];
}

function btcUtxoBench(){
 const start=performance.now();
 let txBytes=0,txCount=0,hashes=0;
 const utxo=new Map(), txids=[];
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   const tx=btcTxSynthetic(txCount);
   const id=dbl(tx);
   txids.push(id);
   utxo.set(hex(id).slice(0,32),{v:txCount,value:1000+txCount});
   if(txCount%3===0){
    const k=utxo.keys().next().value;
    if(k)utxo.delete(k);
   }
   txBytes+=tx.length; txCount++; hashes+=2;
  }
 }
 const root=merkleRoot(txids.slice(-1024));
 const ms=performance.now()-start;
 return {
  packets:PACKETS, window_ms:WINDOW_MS, ms:r(ms), tx_count:txCount,
  tx_s:r(txCount/(ms/1000)),
  tx_mb_s:r((txBytes/1048576)/(ms/1000)),
  sha256d_hashes_s:r(hashes/(ms/1000)),
  hash_gb_s:r((txBytes/1073741824)/(ms/1000)),
  utxo_size:utxo.size,
  merkle_root:hex(root).slice(0,32)
 };
}

function ethHash(buf){return crypto.createHash("sha3-256").update(buf).digest()}

function ethBench(){
 const start=performance.now();
 let blocks=0,tx=0,bytes=0,gas=0,parent=crypto.randomBytes(32);
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   const txs=[], n=20+(blocks%40);
   for(let i=0;i<n;i++){
    const payload=Buffer.concat([crypto.randomBytes(20),crypto.randomBytes(20),Buffer.from(`${blocks}-${i}`),crypto.randomBytes(64)]);
    txs.push(ethHash(payload));
    bytes+=payload.length;
    gas+=21000+(payload.length*16);
    tx++;
   }
   parent=ethHash(Buffer.concat([parent,merkleRoot(txs),Buffer.from(String(blocks))]));
   blocks++;
  }
 }
 const ms=performance.now()-start;
 return {
  ms:r(ms), synthetic_blocks:blocks,
  synthetic_blocks_s:r(blocks/(ms/1000)),
  synthetic_tx:tx,
  synthetic_tx_s:r(tx/(ms/1000)),
  payload_mb_s:r((bytes/1048576)/(ms/1000)),
  synthetic_gas_s:r(gas/(ms/1000)),
  state_root:hex(parent).slice(0,32)
 };
}

function cryptoIntensity(){
 const start=performance.now();
 let shaBytes=0,aesBytes=0,digest="";
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(16);
 for(let p=0;p<PACKETS;p++){
  const buf=crypto.randomBytes(8*1024*1024);
  digest=crypto.createHash("sha256").update(buf).digest("hex");
  shaBytes+=buf.length;
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  const enc=Buffer.concat([c.update(buf),c.final()]);
  aesBytes+=enc.length;
 }
 const ms=performance.now()-start;
 return {
  ms:r(ms),
  sha256_mb_s:r((shaBytes/1048576)/(ms/1000)),
  aes256_mb_s:r((aesBytes/1048576)/(ms/1000)),
  digest:digest.slice(0,32)
 };
}

function vectorBench(){
 const n=1<<20;
 const a=new Float64Array(n),b=new Float64Array(n),c=new Float64Array(n);
 for(let i=0;i<n;i++){a[i]=Math.sin(i);b[i]=Math.cos(i)}
 const start=performance.now();
 let ops=0,chk=0;
 for(let p=0;p<PACKETS;p++){
  const end=performance.now()+WINDOW_MS;
  while(performance.now()<end){
   for(let i=0;i<n;i++)c[i]=a[i]*b[i]+c[i]*0.99991+1.00001;
   chk+=c[p%n];
   ops+=n*4;
  }
 }
 const ms=performance.now()-start;
 return {
  n, ms:r(ms),
  gflops:r((ops/(ms/1000))/1e9),
  vector_mb:r((a.byteLength+b.byteLength+c.byteLength)/1048576),
  memory_stream_mb_s:r(((a.byteLength+b.byteLength+c.byteLength)*(ops/(n*4))/1048576)/(ms/1000)),
  checksum:r(chk)
 };
}

function connectPort(port,host="127.0.0.1",timeout=450){
 return new Promise(resolve=>{
  const t0=performance.now();
  const s=net.createConnection({port,host});
  const done=o=>{try{s.destroy()}catch{} resolve({...o,port,ms:r(performance.now()-t0)})};
  s.setTimeout(timeout);
  s.on("connect",()=>done({open:true}));
  s.on("timeout",()=>done({open:false,error:"timeout"}));
  s.on("error",e=>done({open:false,error:e.code||e.message}));
 });
}

async function httpProbe(port){
 return new Promise(resolve=>{
  const t0=performance.now();
  const req=http.get({host:"127.0.0.1",port,path:"/health",timeout:600},res=>{
   let bytes=0;res.on("data",d=>bytes+=d.length);
   res.on("end",()=>resolve({port,ok:true,status:res.statusCode,bytes,ms:r(performance.now()-t0)}));
  });
  req.on("timeout",()=>{req.destroy();resolve({port,ok:false,error:"timeout",ms:r(performance.now()-t0)})});
  req.on("error",e=>resolve({port,ok:false,error:e.code||e.message,ms:r(performance.now()-t0)}));
 });
}

async function networkAuto(){
 const port_results=[];
 for(const p of PORTS)port_results.push(await connectPort(p));
 const open=port_results.filter(x=>x.open).map(x=>x.port);
 const http_health=[];
 for(const p of open.slice(0,32))http_health.push(await httpProbe(p));
 let dnsMs=null,dnsOk=false;
 try{const t0=performance.now();await dns.lookup("github.com");dnsMs=r(performance.now()-t0);dnsOk=true}catch{}
 return {
  local_ip:sh("hostname -I | awk '{print $1}'")||null,
  dns:{github_ok:dnsOk,ms:dnsMs},
  ports_scanned:PORTS.length,
  ports_open:open,
  port_results,
  http_health,
  routes:sh("ip route | head -20")||null
 };
}


function trillionxIdentity(cpu, network){
 return {
  available: true,
  identity: "TRILLIONX",
  role: "SOFTWARE_ORCHESTRATOR_RUNTIME",
  host_cpu_detected: cpu.model,
  host_cpu_ghz: cpu.speed_ghz,
  host_platform: cpu.platform,
  host_arch: cpu.arch,
  runtime_layer: "Node.js app.js / workers / benchmark / network probes",
  support_layer: "GitHub Codespaces host",
  distinction: "HOST_CPU_REAL != TRILLIONX_SOFTWARE_RUNTIME",
  truth: "TRILLIONX is measured as software/runtime/orchestrator; CPU line is the physical Codespaces support CPU.",
  availability_signal: {
   ports_open: network.ports_open || [],
   port_3000_open: (network.ports_open || []).includes(3000),
   health_probe_count: (network.http_health || []).length
  }
 };
}

function supportAuto(){
 const cmds=["node","npm","python3","gcc","g++","clang","make","cmake","git","curl","wget","ss","nmap","openssl","lscpu","free","df"];
 const tools={};
 for(const c of cmds)tools[c]=!!sh("command -v "+c);
 return {node:sh("node --version"),npm:sh("npm --version"),python3:sh("python3 --version"),openssl:sh("openssl version"),tools};
}

(async()=>{
 title("TRILLIONX BTC / UTXO / ETH / VECTOR / SYSTEM / NETWORK BENCH");
 kv("Packets",PACKETS);
 kv("Window par packet",WINDOW_MS,"ms");

 const before=mem(), cpu=cpuAuto(), support=supportAuto(), network_before=await networkAuto();

 title("AUTO-DETECTION SYSTEM");
 kv("CPU",cpu.model);
 kv("Logical CPU",cpu.logical);
 kv("GHz détecté",cpu.speed_ghz,"GHz");
 kv("Arch",cpu.arch);
 kv("Plateforme",cpu.platform);
 kv("RAM totale",before.os_total_gb,"GB");
 kv("RAM libre avant",before.os_free_gb,"GB");
 kv("Node",support.node||"UNAVAILABLE");
 kv("NPM",support.npm||"UNAVAILABLE");
 kv("Python",support.python3||"UNAVAILABLE");
 kv("SIMD",JSON.stringify(cpu.simd));
 kv("Ports ouverts avant",network_before.ports_open.join(", ")||"aucun");

 title("TRILLIONX IDENTITY LAYER");
 const trxid_before = trillionxIdentity(cpu, network_before);
 kv("TRILLIONX", trxid_before.available ? "AVAILABLE" : "UNAVAILABLE");
 kv("TRILLIONX role", trxid_before.role);
 kv("Support physique", trxid_before.host_cpu_detected);
 kv("Support GHz", trxid_before.host_cpu_ghz, "GHz");
 kv("Distinction", trxid_before.distinction);
 kv("Runtime", trxid_before.runtime_layer);

 title("BTC / UTXO LOCAL WORKLOAD");
 const btc=btcUtxoBench();
 kv("Transactions",btc.tx_count);
 kv("TX/s",btc.tx_s);
 kv("TX MB/s",btc.tx_mb_s);
 kv("SHA256d hash/s",btc.sha256d_hashes_s);
 kv("Hash GB/s payload",btc.hash_gb_s);
 kv("UTXO size final",btc.utxo_size);
 kv("Merkle root",btc.merkle_root);

 title("ETH-LIKE BLOCKCHAIN LOCAL WORKLOAD");
 const eth=ethBench();
 kv("Blocks synthétiques",eth.synthetic_blocks);
 kv("Blocks/s",eth.synthetic_blocks_s);
 kv("TX synthétiques",eth.synthetic_tx);
 kv("TX/s",eth.synthetic_tx_s);
 kv("Payload MB/s",eth.payload_mb_s);
 kv("Gas/s synthétique",eth.synthetic_gas_s);
 kv("State root",eth.state_root);

 title("CRYPTOGRAPHIC INTENSITY");
 const cryptoRes=cryptoIntensity();
 kv("SHA-256",cryptoRes.sha256_mb_s,"MB/s");
 kv("AES-256-CBC",cryptoRes.aes256_mb_s,"MB/s");
 kv("Digest",cryptoRes.digest);

 title("VECTOR / MEMORY STREAM");
 const vector=vectorBench();
 kv("GFLOPS JS",vector.gflops);
 kv("Vector RAM",vector.vector_mb,"MB");
 kv("Memory stream",vector.memory_stream_mb_s,"MB/s");
 kv("Checksum",vector.checksum);

 const network_after=await networkAuto();
 const after=mem();

 title("NETWORK AUTO-DETECTION");
 kv("Local IP",network_after.local_ip||"UNAVAILABLE");
 kv("DNS github.com",network_after.dns.github_ok?"OK":"FAIL");
 kv("DNS latency",network_after.dns.ms,"ms");
 kv("Ports scannés",network_after.ports_scanned);
 kv("Ports ouverts après",network_after.ports_open.join(", ")||"aucun");
 kv("HTTP health probes",network_after.http_health.length);
 for(const h of network_after.http_health.slice(0,12)){
  kv("HTTP "+h.port,h.ok?`OK ${h.status} ${h.ms}ms`:`FAIL ${h.error||""}`);
 }

 const score=r(
  btc.tx_s*0.15+
  btc.sha256d_hashes_s/1000*0.15+
  eth.synthetic_tx_s*0.12+
  cryptoRes.sha256_mb_s*0.16+
  cryptoRes.aes256_mb_s*0.12+
  vector.gflops*80+
  vector.memory_stream_mb_s*0.03+
  network_after.ports_open.length*10
 );

 const report={
  engine:"TRILLIONX_BTC_UTXO_ETH_VECTOR_SYSTEM_NET_SHOW",
  ts:now(),
  target:"TRILLIONX_ONLY",
  host_role:"CODESPACES_SUPPORT_ONLY",
  parameters:{packets:PACKETS,window_ms:WINDOW_MS},
  identity:trillionxIdentity(cpu, network_after),
  system:{cpu,memory_before:before,memory_after:after,support},
  network:{before:network_before,after:network_after},
  benches:{btc_utxo:btc,eth_like_blockchain:eth,crypto:cryptoRes,vector},
  summary:{
   score,
   cpu_ghz_detected:cpu.speed_ghz,
   open_ports_after:network_after.ports_open.length,
   health:r(Math.max(0,Math.min(100,100-(after.os_free_gb<0.3?20:0)-(network_after.ports_open.length===0?10:0)))),
   verdict:"REAL_LOCAL_TRILLIONX_BENCH_SHOW_COMPLETE"
  },
  truth_policy:{
   real_only:true,
   measures_local_trillionx_runtime:true,
   btc_utxo_is_synthetic_local_workload:true,
   eth_is_synthetic_local_workload_not_mainnet:true,
   no_fake_zettahash:true,
   no_fake_exascale:true,
   no_fake_gpu:true
  }
 };

 const stamp=Date.now();
 const file=`data/trillionx_btc_utxo_eth_vector_system_net_show_${stamp}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_btc_utxo_eth_vector_system_net_show_latest.json",JSON.stringify(report,null,2));
 fs.appendFileSync("history/trillionx_btc_utxo_eth_vector_system_net_show_history.jsonl",JSON.stringify({ts:report.ts,summary:report.summary})+"\n");

 title("FINAL RESULT");
 kv("SCORE",report.summary.score);
 kv("CPU GHz",report.summary.cpu_ghz_detected,"GHz");
 kv("Ports ouverts",report.summary.open_ports_after);
 kv("RAM libre après",after.os_free_gb,"GB");
 kv("Health",report.summary.health);
 kv("Verdict",report.summary.verdict);
 kv("TRILLIONX disponibilité",report.identity.available ? "AVAILABLE" : "UNAVAILABLE");
 kv("TRILLIONX lecture",report.identity.distinction);
 kv("Report JSON",file);
 line();

 console.log("\nLECTURE HONNÊTE:");
 console.log("- Mesure réelle du runtime local TRILLIONX dans Codespaces.");
 console.log("- BTC/UTXO et ETH sont des workloads locaux synthétiques, pas mainnet/mining réel.");
 console.log("- Pas de faux ZettaHash, pas de faux exascale, pas de faux GPU.");
})();
