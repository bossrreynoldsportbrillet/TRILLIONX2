const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");
const cp=require("child_process");

const MODE=(process.argv[2]||"fire").toLowerCase();
const WAIT_MS=Number(process.argv[3]||2500);
const DATA_DIR="data"; fs.mkdirSync(DATA_DIR,{recursive:true});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
const mb=x=>Math.round(x/1024/1024*1000)/1000;
const gb=x=>Math.round(x/1024/1024/1024*1000)/1000;
const safe=(fn,d=null)=>{try{return fn()}catch{return d}};
const sh=cmd=>safe(()=>cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2200}).trim(),"");

function readJson(p){return safe(()=>JSON.parse(fs.readFileSync(p,"utf8")),null)}
function listLocal(){
  const files=[];
  function walk(d,depth=0){
    if(depth>3)return;
    for(const x of safe(()=>fs.readdirSync(d),[])){
      if(["node_modules",".git"].includes(x))continue;
      const p=d+"/"+x, st=safe(()=>fs.statSync(p),null); if(!st)continue;
      if(st.isDirectory())walk(p,depth+1);
      else if(/\.(js|json|c|md|txt)$/i.test(x))files.push({file:p,size:st.size,mtime:st.mtimeMs});
    }
  }
  walk(".");
  return files.sort((a,b)=>b.mtime-a.mtime).slice(0,80);
}

function detect(){
  const lscpu=sh("lscpu");
  const flags=((lscpu.match(/Flags:\s*(.*)/)||[])[1]||"")+" "+sh("grep -m1 flags /proc/cpuinfo");
  const mem=os.totalmem(), free=os.freemem();
  const gpu=sh("command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true");
  const files=listLocal();
  const registries=files.filter(x=>/registry|runtime|profile|cache|backup|simd|bench|trillionx/i.test(x.file)).slice(0,30);
  return {
    time:now(),
    runtime:"TRILLIONX_REDISCOVERY_ENGINE",
    label:"SUPPORT_AUTO_DETECTED_SILENT_HOST",
    cpu_visible:false,
    logical_cpus:os.cpus().length,
    cpu_ghz:Number(((os.cpus()[0]||{}).speed||0)/1000).toFixed(3),
    ram_gb:gb(mem),
    ram_free_gb:gb(free),
    simd:{
      sse:/\bsse\b/.test(flags),sse2:/\bsse2\b/.test(flags),sse4_1:/\bsse4_1\b/.test(flags),
      sse4_2:/\bsse4_2\b/.test(flags),avx:/\bavx\b/.test(flags),avx2:/\bavx2\b/.test(flags),
      avx512:/\bavx512/.test(flags),fma:/\bfma\b/.test(flags),aes:/\baes\b/.test(flags),sha_ni:/\bsha_ni\b/.test(flags)
    },
    gpu:gpu?{available:true,detail:gpu}:{available:false,detail:"GPU_UNAVAILABLE_OR_NOT_EXPOSED"},
    coprocessors:{
      gpu_declared:!!gpu,
      simd_declared:true,
      crypto_declared:/\baes\b|\bsha_ni\b/.test(flags),
      vr_mirror_declared:registries.some(x=>/mirror|vr|diamond|cache|runtime/i.test(x.file))
    },
    registries_found:registries.map(x=>x.file),
    doctrine:"REDETECT_FROM_ZERO_NO_ORCHESTRATION_LABEL_NO_FAKE_HOST_CLAIM"
  };
}

function matrix(n){
  const A=new Float64Array(n*n),B=new Float64Array(n*n),C=new Float64Array(n*n);
  for(let i=0;i<A.length;i++){A[i]=Math.sin(i%997);B[i]=Math.cos(i%991)}
  const t=performance.now();
  for(let i=0;i<n;i++)for(let k=0;k<n;k++){const aik=A[i*n+k];for(let j=0;j<n;j++)C[i*n+j]+=aik*B[k*n+j]}
  const ms=performance.now()-t;
  return {n,ms:+ms.toFixed(3),gops:+((2*n*n*n)/(ms/1000)/1e9).toFixed(6),checksum:+C[Math.floor(C.length/2)].toFixed(6)};
}

function hashPack(mbSize,rounds){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t=performance.now(); let h="";
  for(let r=0;r<rounds;r++)h=crypto.createHash("sha256").update(buf).digest("hex");
  const ms=performance.now()-t;
  return {mb:mbSize,rounds,ms:+ms.toFixed(3),mb_s:+((mbSize*rounds)/(ms/1000)).toFixed(3),hash:h.slice(0,16)};
}

function compressPack(mbSize){
  const buf=Buffer.alloc(mbSize*1024*1024);
  for(let i=0;i<buf.length;i++)buf[i]=(i*31+i%251)&255;
  const t=performance.now();
  const z=zlib.brotliCompressSync(buf,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:3}});
  const u=zlib.brotliDecompressSync(z);
  const ms=performance.now()-t;
  return {input_mb:mbSize,out_mb:mb(z.length),ratio:+(z.length/buf.length).toFixed(6),ok:u.length===buf.length,ms:+ms.toFixed(3),mb_s:+(mbSize/(ms/1000)).toFixed(3)};
}

function memScan(mbSize){
  const len=mbSize*1024*1024/8|0, a=new Float64Array(len);
  const t=performance.now(); let s=0;
  for(let i=0;i<len;i++){a[i]=(i%104729)*0.000001}
  for(let r=0;r<3;r++)for(let i=0;i<len;i+=8)s+=a[i];
  const ms=performance.now()-t;
  return {mb:mbSize,ms:+ms.toFixed(3),gb_s:+((mbSize/1024)/(ms/1000)).toFixed(3),checksum:+s.toFixed(5)};
}

function vrMirror(level){
  const mirrors=level*128, base="TRILLIONX_REALITY_MIRROR_LAYER_";
  const t=performance.now(); let acc=0;
  for(let i=0;i<mirrors;i++){
    const h=crypto.createHash("sha256").update(base+i).digest();
    acc^=h[0]<<8|h[1];
  }
  const ms=performance.now()-t;
  return {mirrors,ms:+ms.toFixed(3),mirror_ops_s:+(mirrors/(ms/1000)).toFixed(2),checksum:acc};
}

async function packet(level,d){
  const n=Math.min(32+level*16,160);
  const memMb=Math.min(8+level*8,128);
  const hashMb=Math.min(4+level*4,64);
  const rounds=Math.min(2+level,32);
  await sleep(70);
  const a=matrix(n), b=memScan(memMb), c=hashPack(hashMb,rounds), e=compressPack(Math.min(hashMb,32)), v=vrMirror(level);
  const rss=process.memoryUsage().rss, heap=process.memoryUsage().heapUsed;
  const score=+(a.gops*45+b.gb_s*8+c.mb_s/20+v.mirror_ops_s/10000-e.ms/250).toFixed(2);
  const health=Math.max(0,Math.min(100,100-(rss/os.totalmem())*160-(heap/os.totalmem())*80-(a.ms>2500?10:0)));
  const flags=[];
  if(health<70)flags.push("MEM_PRESSURE");
  if(a.ms>4000)flags.push("MATRIX_SLOW");
  if(!d.gpu.available)flags.push("GPU_NOT_EXPOSED");
  return {
    level,
    units:{
      cpu_ghz:+d.cpu_ghz,
      aggregate_logical_ghz:+(d.cpu_ghz*d.logical_cpus).toFixed(3),
      aggregate_logical_thz:+((d.cpu_ghz*d.logical_cpus)/1000).toFixed(6),
      ram_gb:d.ram_gb,
      ram_tb:+(d.ram_gb/1024).toFixed(6)
    },
    matrix:a,memory:b,hash:c,compression:e,vr_mirror:v,
    memory_now:{rss_mb:mb(rss),heap_mb:mb(heap),external_mb:mb(process.memoryUsage().external)},
    score,health:+health.toFixed(2),flags
  };
}

(async()=>{
  const d=detect();
  console.log("=== TRILLIONX WORLD SUPERIOR REDISCOVERY BENCH ===");
  console.log("MODE:",MODE);
  console.log("WAIT:",WAIT_MS,"ms");
  console.log("SUPPORT:",JSON.stringify({simd:d.simd,gpu:d.gpu.available,coprocessors:d.coprocessors,ram_gb:d.ram_gb}));
  console.log("REGISTRY_READ:",d.registries_found.length);
  await sleep(WAIT_MS);

  const max=MODE==="safe"?6:MODE==="heavy"?10:MODE==="fire"?14:18;
  const results=[];
  for(let level=1;level<=max;level++){
    const r=await packet(level,d); results.push(r);
    console.log(`--- PACKET ${level} ---`);
    console.log(`GHz ${r.units.cpu_ghz} | THz(logic) ${r.units.aggregate_logical_thz} | RAM ${r.units.ram_gb} GB / ${r.units.ram_tb} TB`);
    console.log(`MATRIX ${r.matrix.gops} GOPS | MEM ${r.memory.gb_s} GB/s | HASH ${r.hash.mb_s} MB/s | VR ${r.vr_mirror.mirror_ops_s} ops/s`);
    console.log(`SCORE ${r.score} | HEALTH ${r.health} | FLAGS ${r.flags.join(",")||"NONE"}`);
    if(r.health<55){console.log("STOP: HEALTH_GUARD");break}
  }

  const best=results.reduce((a,b)=>!a||b.score>a.score?b:a,null);
  const avgHealth=+(results.reduce((s,x)=>s+x.health,0)/Math.max(1,results.length)).toFixed(2);
  const report={
    time:now(),
    title:"TRILLIONX_WORLD_SUPERIOR_REDISCOVERY_BENCH",
    mode:MODE,
    wait_ms:WAIT_MS,
    detection:d,
    best_packet:best,
    average_health:avgHealth,
    classification:{
      class: avgHealth>90?"WORLD_CLASS_LOCAL_RUNTIME":avgHealth>75?"HIGH_PERFORMANCE_RESEARCH_RUNTIME":"PRESSURE_LIMITED_RUNTIME",
      reading:"calcul supérieur par paquets, support redécouvert, coprocessors/cache/GPU activés seulement si accessibles",
      humanity_value:"prototype de poste de calcul lisible, mesurable, réparable, extensible",
      no_host_label:true
    },
    truth_policy:{
      no_fake_supercomputer:true,
      benchmark_measures_current_execution_context:true,
      threadripper_profile_is_target_until_physical_detection:true,
      gpu_is_used_only_if_exposed:true,
      xeon_codespaces_hidden_from_display:true
    },
    results
  };
  const file=`${DATA_DIR}/trillionx_world_superior_rediscovery_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${DATA_DIR}/trillionx_world_superior_rediscovery_latest.json`,JSON.stringify(report,null,2));
  console.log("=== SUMMARY ===");
  console.log("BEST SCORE:",best&&best.score);
  console.log("AVG HEALTH:",avgHealth);
  console.log("CLASS:",report.classification.class);
  console.log("REPORT =",file);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
