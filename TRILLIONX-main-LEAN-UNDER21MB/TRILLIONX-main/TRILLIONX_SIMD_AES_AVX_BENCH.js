"use strict";
const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const cp=require("child_process");
const {performance}=require("perf_hooks");

const OUTDIR="reports/benchmarks";
fs.mkdirSync(OUTDIR,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const OUT=`${OUTDIR}/TRILLIONX_SIMD_AES_AVX_BENCH_${stamp}.json`;
const LATEST=`${OUTDIR}/TRILLIONX_SIMD_AES_AVX_BENCH_LATEST.json`;

function run(cmd,timeout=3000){
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function readCpuFlags(){
  let txt="";
  try{txt=fs.readFileSync("/proc/cpuinfo","utf8");}catch(e){}
  const m=txt.match(/^flags\s*:\s*(.+)$/m);
  const flags=new Set((m?m[1]:"").split(/\s+/).filter(Boolean));
  const has=x=>flags.has(x);
  return {
    source: txt?"/proc/cpuinfo":"UNAVAILABLE",
    model: os.cpus()[0]?.model || "UNAVAILABLE",
    cores: os.cpus().length,
    flags_count: flags.size,
    SIMD:{
      mmx:has("mmx"),
      sse:has("sse"),
      sse2:has("sse2"),
      sse3:has("pni")||has("sse3"),
      ssse3:has("ssse3"),
      sse4_1:has("sse4_1"),
      sse4_2:has("sse4_2"),
      avx:has("avx"),
      avx2:has("avx2"),
      avx512f:has("avx512f"),
      avx512dq:has("avx512dq"),
      avx512cd:has("avx512cd"),
      avx512bw:has("avx512bw"),
      avx512vl:has("avx512vl"),
      fma:has("fma"),
      bmi1:has("bmi1"),
      bmi2:has("bmi2"),
      popcnt:has("popcnt"),
      pclmulqdq:has("pclmulqdq")
    },
    CRYPTO:{
      aes_ni:has("aes"),
      sha_ni:has("sha_ni")||has("sha"),
      rdrand:has("rdrand"),
      rdseed:has("rdseed")
    }
  };
}
function bench(name,fn){
  const t0=performance.now();
  try{
    const r=fn();
    return {name,ok:true,ms:+(performance.now()-t0).toFixed(3),...r};
  }catch(e){
    return {name,ok:false,ms:+(performance.now()-t0).toFixed(3),error:String(e.stack||e).slice(0,1000)};
  }
}
function mbps(bytes,ms){return +((bytes/1024/1024)/(ms/1000)).toFixed(2);}
function opsps(n,ms){return +(n/(ms/1000)).toFixed(2);}
function hashBench(algo,mb=64,rounds=4){
  const buf=crypto.randomBytes(mb*1024*1024);
  const t0=performance.now();
  let d="";
  for(let i=0;i<rounds;i++) d=crypto.createHash(algo).update(buf).digest("hex");
  const ms=performance.now()-t0;
  return {algo,mb,rounds,total_mb:mb*rounds,MBps:mbps(buf.length*rounds,ms),digest:d.slice(0,32)};
}
function hmacBench(algo="sha256",rounds=250000){
  const key=crypto.randomBytes(32), msg=crypto.randomBytes(256);
  const t0=performance.now();
  let d="";
  for(let i=0;i<rounds;i++) d=crypto.createHmac(algo,key).update(msg).digest("hex");
  const ms=performance.now()-t0;
  return {algo:`hmac-${algo}`,rounds,ops_per_sec:opsps(rounds,ms),digest:d.slice(0,32)};
}
function cipherBench(cipher,mb=64,rounds=3){
  const keyLen=cipher.includes("256")?32:cipher.includes("192")?24:16;
  const ivLen=cipher.includes("gcm")?12:16;
  const key=crypto.randomBytes(keyLen), iv=crypto.randomBytes(ivLen);
  const buf=crypto.randomBytes(mb*1024*1024);
  let outBytes=0;
  const t0=performance.now();
  for(let i=0;i<rounds;i++){
    const c=crypto.createCipheriv(cipher,key,iv);
    const out=Buffer.concat([c.update(buf),c.final()]);
    outBytes+=out.length;
    if(cipher.includes("gcm")) c.getAuthTag();
  }
  const ms=performance.now()-t0;
  return {cipher,mb,rounds,total_mb:mb*rounds,MBps:mbps(buf.length*rounds,ms),outBytes};
}
function decipherBench(cipher,mb=32,rounds=2){
  const keyLen=cipher.includes("256")?32:cipher.includes("192")?24:16;
  const ivLen=cipher.includes("gcm")?12:16;
  const key=crypto.randomBytes(keyLen), iv=crypto.randomBytes(ivLen);
  const buf=crypto.randomBytes(mb*1024*1024);
  const c=crypto.createCipheriv(cipher,key,iv);
  const enc=Buffer.concat([c.update(buf),c.final()]);
  const tag=cipher.includes("gcm")?c.getAuthTag():null;
  const t0=performance.now();
  let outBytes=0;
  for(let i=0;i<rounds;i++){
    const d=crypto.createDecipheriv(cipher,key,iv);
    if(tag) d.setAuthTag(tag);
    const out=Buffer.concat([d.update(enc),d.final()]);
    outBytes+=out.length;
  }
  const ms=performance.now()-t0;
  return {cipher:`${cipher}-decrypt`,mb,rounds,total_mb:mb*rounds,MBps:mbps(buf.length*rounds,ms),outBytes};
}
function randomBench(mb=64,rounds=4){
  const t0=performance.now();
  let n=0;
  for(let i=0;i<rounds;i++) n+=crypto.randomBytes(mb*1024*1024).length;
  const ms=performance.now()-t0;
  return {source:"crypto.randomBytes",mb,rounds,total_mb:mb*rounds,MBps:mbps(n,ms)};
}
function memoryCopyBench(mb=256,rounds=4){
  const src=Buffer.alloc(mb*1024*1024,7);
  const dst=Buffer.alloc(src.length);
  const t0=performance.now();
  for(let i=0;i<rounds;i++) src.copy(dst);
  const ms=performance.now()-t0;
  return {mode:"Buffer.copy memory bandwidth proxy",mb,rounds,total_mb:mb*rounds,MBps:mbps(src.length*rounds,ms)};
}
function ecdhBench(rounds=2500){
  const t0=performance.now();
  let s="";
  for(let i=0;i<rounds;i++){
    const a=crypto.createECDH("prime256v1");
    const b=crypto.createECDH("prime256v1");
    a.generateKeys(); b.generateKeys();
    s=a.computeSecret(b.getPublicKey()).toString("hex");
  }
  const ms=performance.now()-t0;
  return {algo:"ECDH prime256v1",rounds,ops_per_sec:opsps(rounds,ms),secret:s.slice(0,32)};
}
function rsaBench(rounds=200){
  const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
  const msg=crypto.randomBytes(64);
  const enc=crypto.publicEncrypt(publicKey,msg);
  const t0=performance.now();
  let ok=0;
  for(let i=0;i<rounds;i++){
    const dec=crypto.privateDecrypt(privateKey,enc);
    if(dec.equals(msg)) ok++;
  }
  const ms=performance.now()-t0;
  return {algo:"RSA-2048 privateDecrypt",rounds,ok,ops_per_sec:opsps(rounds,ms)};
}
function opensslInfo(){
  return {
    node_openssl:process.versions.openssl || "UNAVAILABLE",
    openssl_version:run("openssl version -a 2>/dev/null | head -20"),
    lscpu_flags:run("lscpu 2>/dev/null | grep -Ei 'Model name|Flags|CPU\\(s\\)|Thread|Core|Vendor|MHz' | head -30")
  };
}

const cpu=readCpuFlags();
const report={
  title:"TRILLIONX SIMD / AVX / AES / SSE BENCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE ; flags détectés != preuve de gain ; Node/OpenSSL mesure les primitives natives disponibles",
  time:new Date().toISOString(),
  root:process.cwd(),
  system:{
    platform:process.platform,
    arch:process.arch,
    node:process.version,
    openssl:process.versions.openssl,
    cpu_model:cpu.model,
    cores:cpu.cores,
    total_ram_gb:+(os.totalmem()/1024/1024/1024).toFixed(2),
    free_ram_gb:+(os.freemem()/1024/1024/1024).toFixed(2),
    loadavg:os.loadavg()
  },
  detected_cpu_features:cpu,
  openssl:opensslInfo(),
  benchmarks:[
    bench("RNG_crypto_randomBytes",()=>randomBench(64,4)),
    bench("MEM_Buffer_copy_bandwidth",()=>memoryCopyBench(256,4)),
    bench("HASH_sha256",()=>hashBench("sha256",64,4)),
    bench("HASH_sha512",()=>hashBench("sha512",64,4)),
    bench("HASH_blake2b512",()=>hashBench("blake2b512",64,4)),
    bench("HMAC_sha256",()=>hmacBench("sha256",250000)),
    bench("AES_128_CBC_encrypt",()=>cipherBench("aes-128-cbc",64,3)),
    bench("AES_256_CBC_encrypt",()=>cipherBench("aes-256-cbc",64,3)),
    bench("AES_256_GCM_encrypt",()=>cipherBench("aes-256-gcm",64,3)),
    bench("AES_256_CBC_decrypt",()=>decipherBench("aes-256-cbc",32,2)),
    bench("AES_256_GCM_decrypt",()=>decipherBench("aes-256-gcm",32,2)),
    bench("ECDH_prime256v1",()=>ecdhBench(2500)),
    bench("RSA_2048_privateDecrypt",()=>rsaBench(200))
  ],
  interpretation:{
    sse_family_available:!!(cpu.SIMD.sse&&cpu.SIMD.sse2),
    sse4_available:!!(cpu.SIMD.sse4_1||cpu.SIMD.sse4_2),
    avx_available:!!cpu.SIMD.avx,
    avx2_available:!!cpu.SIMD.avx2,
    avx512_available:!!(cpu.SIMD.avx512f||cpu.SIMD.avx512bw||cpu.SIMD.avx512vl),
    aes_ni_available:!!cpu.CRYPTO.aes_ni,
    sha_ni_available:!!cpu.CRYPTO.sha_ni,
    note:"Les mesures AES/SHA passent par OpenSSL/Node natif. AVX/SSE sont détectés via flags CPU, mais Node ne permet pas d'isoler directement chaque instruction SIMD sans addon natif C/C++."
  }
};

fs.writeFileSync(OUT,JSON.stringify(report,null,2));
fs.writeFileSync(LATEST,JSON.stringify(report,null,2));

console.log("============================================================");
console.log("TRILLIONX SIMD / AVX / AVX2 / AVX512 / AES / SSE BENCH");
console.log("============================================================");
console.log("CPU       :",report.system.cpu_model);
console.log("CORES     :",report.system.cores);
console.log("NODE      :",report.system.node,"OPENSSL",report.system.openssl);
console.log("SSE       :",cpu.SIMD.sse,"SSE2",cpu.SIMD.sse2,"SSE4.1",cpu.SIMD.sse4_1,"SSE4.2",cpu.SIMD.sse4_2);
console.log("AVX       :",cpu.SIMD.avx,"AVX2",cpu.SIMD.avx2,"AVX512F",cpu.SIMD.avx512f,"AVX512BW",cpu.SIMD.avx512bw,"AVX512VL",cpu.SIMD.avx512vl);
console.log("AES-NI    :",cpu.CRYPTO.aes_ni,"SHA-NI",cpu.CRYPTO.sha_ni,"PCLMUL",cpu.SIMD.pclmulqdq);
console.log("------------------------------------------------------------");
for(const b of report.benchmarks){
  const metric=b.MBps?`${b.MBps} MB/s`:b.ops_per_sec?`${b.ops_per_sec} ops/s`:b.error||"";
  console.log(`${b.ok?"OK  ":"FAIL"} ${b.name.padEnd(28)} ${String(b.ms).padStart(9)} ms   ${metric}`);
}
console.log("------------------------------------------------------------");
console.log("REPORT :",OUT);
console.log("LATEST :",LATEST);
