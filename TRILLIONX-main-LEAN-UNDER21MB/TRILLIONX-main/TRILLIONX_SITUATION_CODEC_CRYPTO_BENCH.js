"use strict";
const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib"),http=require("http"),cp=require("child_process");
const {performance}=require("perf_hooks");

const ROOT=process.cwd();
const OUTDIR="reports/benchmarks";
fs.mkdirSync(OUTDIR,{recursive:true});
const now=new Date().toISOString().replace(/[:.]/g,"-");
const OUT=`${OUTDIR}/TRILLIONX_SITUATION_CODEC_CRYPTO_${now}.json`;
const latest=`${OUTDIR}/TRILLIONX_SITUATION_CODEC_CRYPTO_LATEST.json`;

const run=(cmd,timeout=3000)=>{
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch(e){return `UNAVAILABLE: ${String(e.message||e).slice(0,160)}`;}
};
const exists=p=>fs.existsSync(p);
const bytes=n=>{
  const u=["B","KB","MB","GB","TB"]; let i=0,x=n;
  while(x>=1024&&i<u.length-1){x/=1024;i++}
  return `${x.toFixed(i?2:0)} ${u[i]}`;
};
const pct=(a,b)=>b?+(a/b*100).toFixed(2):0;
const bench=(name,fn)=>{
  const t0=performance.now();
  try{
    const r=fn();
    return {name,ok:true,ms:+(performance.now()-t0).toFixed(3),...r};
  }catch(e){
    return {name,ok:false,ms:+(performance.now()-t0).toFixed(3),error:String(e.stack||e).slice(0,1200)};
  }
};

function hashBench(algo,sizeMB=32,rounds=4){
  const buf=crypto.randomBytes(sizeMB*1024*1024);
  const t0=performance.now();
  let digest="";
  for(let i=0;i<rounds;i++) digest=crypto.createHash(algo).update(buf).digest("hex");
  const sec=(performance.now()-t0)/1000;
  const mb=sizeMB*rounds;
  return {algo,sizeMB,rounds,MBps:+(mb/sec).toFixed(2),hashes_per_sec:+(rounds/sec).toFixed(2),digest:digest.slice(0,24)};
}
function hmacBench(rounds=200000){
  const key=crypto.randomBytes(32), msg=crypto.randomBytes(128);
  const t0=performance.now();
  let d="";
  for(let i=0;i<rounds;i++) d=crypto.createHmac("sha256",key).update(msg).digest("hex");
  const sec=(performance.now()-t0)/1000;
  return {algo:"hmac-sha256",rounds,ops_per_sec:+(rounds/sec).toFixed(2),digest:d.slice(0,24)};
}
function aesBench(sizeMB=32,rounds=3){
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(16),buf=crypto.randomBytes(sizeMB*1024*1024);
  const t0=performance.now(); let out;
  for(let i=0;i<rounds;i++){const c=crypto.createCipheriv("aes-256-cbc",key,iv); out=Buffer.concat([c.update(buf),c.final()]);}
  const sec=(performance.now()-t0)/1000;
  return {algo:"aes-256-cbc-encrypt",sizeMB,rounds,MBps:+((sizeMB*rounds)/sec).toFixed(2),out_bytes:out.length};
}
function codecBench(){
  const raw=Buffer.alloc(16*1024*1024);
  for(let i=0;i<raw.length;i++) raw[i]=(i*31+i%251)&255;
  const gz0=performance.now(); const gz=zlib.gzipSync(raw,{level:6}); const gzMs=performance.now()-gz0;
  const gun0=performance.now(); const ungz=zlib.gunzipSync(gz); const gunMs=performance.now()-gun0;
  const br0=performance.now(); const br=zlib.brotliCompressSync(raw); const brMs=performance.now()-br0;
  const ubr0=performance.now(); const unbr=zlib.brotliDecompressSync(br); const ubrMs=performance.now()-ubr0;
  return {
    raw_bytes:raw.length,
    gzip_bytes:gz.length,
    gzip_ratio:+(raw.length/gz.length).toFixed(3),
    gzip_MBps:+((raw.length/1024/1024)/(gzMs/1000)).toFixed(2),
    gunzip_MBps:+((raw.length/1024/1024)/(gunMs/1000)).toFixed(2),
    brotli_bytes:br.length,
    brotli_ratio:+(raw.length/br.length).toFixed(3),
    brotli_MBps:+((raw.length/1024/1024)/(brMs/1000)).toFixed(2),
    unbrotli_MBps:+((raw.length/1024/1024)/(ubrMs/1000)).toFixed(2),
    integrity:gzip_ok=ungz.equals(raw)&&unbr.equals(raw)
  };
}
function miningSha256(seconds=2){
  const targetPrefix="0000";
  let nonce=0,best=64,bestHash="";
  const tEnd=performance.now()+seconds*1000;
  while(performance.now()<tEnd){
    const h=crypto.createHash("sha256").update("TRILLIONX|"+nonce).digest("hex");
    const z=(h.match(/^0*/)||[""])[0].length;
    if(z>best){best=z;bestHash=h}
    nonce++;
  }
  return {mode:"CPU_SHA256_PROBE_NOT_REAL_MINING",seconds,hashes:nonce,hashes_per_sec:+(nonce/seconds).toFixed(0),best_leading_zeroes:best,best_hash:bestHash.slice(0,32),targetPrefix};
}
function diskBench(){
  const file=`${OUTDIR}/.disk_bench_${Date.now()}.bin`;
  const buf=crypto.randomBytes(32*1024*1024);
  let t0=performance.now(); fs.writeFileSync(file,buf); fs.fsyncSync(fs.openSync(file,"r")); let w=performance.now()-t0;
  t0=performance.now(); const r=fs.readFileSync(file); let rd=performance.now()-t0;
  try{fs.unlinkSync(file)}catch{}
  return {size_bytes:buf.length,write_MBps:+((buf.length/1024/1024)/(w/1000)).toFixed(2),read_MBps:+((r.length/1024/1024)/(rd/1000)).toFixed(2),integrity:r.length===buf.length};
}
function apiCheck(path="/"){
  return new Promise(resolve=>{
    const t0=performance.now();
    const req=http.request({hostname:"127.0.0.1",port:3000,path,method:"GET",timeout:2500},res=>{
      let n=0; res.on("data",d=>n+=d.length);
      res.on("end",()=>resolve({path,ok:true,status:res.statusCode,bytes:n,ms:+(performance.now()-t0).toFixed(2)}));
    });
    req.on("timeout",()=>{req.destroy();resolve({path,ok:false,error:"TIMEOUT"})});
    req.on("error",e=>resolve({path,ok:false,error:e.code||e.message}));
    req.end();
  });
}
function countFiles(dir){
  if(!exists(dir)) return {exists:false,count:0};
  const n=run(`find "${dir}" -type f 2>/dev/null | wc -l`);
  return {exists:true,count:Number(n)||0};
}
function detectRuntimeFiles(){
  const cats={
    api_routes:run(`grep -RInE "app\\.(get|post|put|delete)\\(" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`),
    crypto_refs:run(`grep -RInEi "sha256|sha512|crypto|hash|btc|bitcoin|eth|web3|blockchain|mining|stratum" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`),
    codec_refs:run(`grep -RInEi "codec|zlib|brotli|gzip|deflate|compress|decompress|encode|decode" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`),
    runtime_refs:run(`grep -RInEi "runtime|worker|thread|cluster|scheduler|queue|socket|websocket|pm2" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`),
    raid_mirror_refs:run(`grep -RInEi "raid60|mirror|stripe|mesh_nodes|vr_node|hyperfabric|memory_fabric" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`),
    registry_refs:run(`grep -RInEi "registry|catalog|manifest|classification|dict" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | wc -l`)
  };
  Object.keys(cats).forEach(k=>cats[k]=Number(String(cats[k]).trim())||0);
  return cats;
}

(async()=>{
  const report={
    title:"TRILLIONX SITUATION + CODEC + CRYPTO BENCH",
    doctrine:"REAL_ONLY_OR_UNAVAILABLE / NO_FAKE_HASHRATE / NO_FAKE_POWER",
    root:ROOT,
    time:new Date().toISOString(),
    system:{
      platform:process.platform,
      arch:process.arch,
      node:process.version,
      pid:process.pid,
      cpus:os.cpus().length,
      cpu_model:os.cpus()[0]?.model||"UNAVAILABLE",
      totalmem_bytes:os.totalmem(),
      freemem_bytes:os.freemem(),
      totalmem:bytes(os.totalmem()),
      freemem:bytes(os.freemem()),
      loadavg:os.loadavg(),
      uptime_sec:Math.round(os.uptime()),
      docker:exists("/.dockerenv")||run("test -f /.dockerenv && echo 1 || echo 0")==="1",
      git_branch:run("git branch --show-current"),
      git_head:run("git rev-parse --short HEAD"),
      disk_df:run("df -h . | tail -1")
    },
    inventory:{
      folders:{
        logs:countFiles("logs"),
        reports:countFiles("reports"),
        data:countFiles("data"),
        scripts:countFiles("scripts"),
        runtime_state:countFiles("runtime_state"),
        memory_fabric:countFiles("memory_fabric"),
        raid60_plus:countFiles("raid60_plus"),
        mesh_nodes:countFiles("mesh_nodes"),
        workers:countFiles("workers"),
        controllers:countFiles("controllers"),
        benchmarks:countFiles("benchmarks")
      },
      detection_counts:detectRuntimeFiles()
    },
    benchmarks:[
      bench("disk_io_32MB",diskBench),
      bench("codec_gzip_brotli_16MB",codecBench),
      bench("crypto_sha256_32MBx4",()=>hashBench("sha256",32,4)),
      bench("crypto_sha512_32MBx4",()=>hashBench("sha512",32,4)),
      bench("crypto_blake2b512_32MBx4",()=>hashBench("blake2b512",32,4)),
      bench("crypto_hmac_sha256_200k",()=>hmacBench(200000)),
      bench("crypto_aes_256_cbc_32MBx3",()=>aesBench(32,3)),
      bench("crypto_sha256_probe_2s",()=>miningSha256(2))
    ],
    api_3000:[
      await apiCheck("/"),
      await apiCheck("/api/system"),
      await apiCheck("/api/capacity"),
      await apiCheck("/api/network"),
      await apiCheck("/api/benchmark/flops-libre/report"),
      await apiCheck("/api/crypto"),
      await apiCheck("/api/blockchain")
    ],
    notes:[
      "hashes_per_sec ici = probe CPU local Node.js, pas un hashrate minier garanti.",
      "GPU/CUDA/OpenCL/WebGPU non exécutés sauf si vrais outils présents.",
      "Les compteurs grep indiquent présence de logique/code, pas validation fonctionnelle complète.",
      "Pour TRILLIONX, le verdict sérieux vient des mesures avant/après + endpoints 200 + logs propres."
    ]
  };
  fs.writeFileSync(OUT,JSON.stringify(report,null,2));
  fs.writeFileSync(latest,JSON.stringify(report,null,2));
  console.log("==================================================");
  console.log("TRILLIONX SITUATION CODEC CRYPTO BENCH COMPLETE");
  console.log("==================================================");
  console.log("ROOT      :",ROOT);
  console.log("NODE      :",report.system.node);
  console.log("CPU       :",report.system.cpus,report.system.cpu_model);
  console.log("RAM       :",report.system.totalmem,"free",report.system.freemem);
  console.log("GIT       :",report.system.git_branch,report.system.git_head);
  console.log("API 3000  :",report.api_3000.map(x=>`${x.path}:${x.status||x.error}`).join(" | "));
  for(const b of report.benchmarks) console.log(`${b.ok?"OK":"FAIL"} ${b.name} ${b.ms}ms`, b.MBps?`${b.MBps} MB/s`:b.hashes_per_sec?`${b.hashes_per_sec} H/s`:b.ops_per_sec?`${b.ops_per_sec} ops/s`:"");
  console.log("REPORT    :",OUT);
  console.log("LATEST    :",latest);
})();
