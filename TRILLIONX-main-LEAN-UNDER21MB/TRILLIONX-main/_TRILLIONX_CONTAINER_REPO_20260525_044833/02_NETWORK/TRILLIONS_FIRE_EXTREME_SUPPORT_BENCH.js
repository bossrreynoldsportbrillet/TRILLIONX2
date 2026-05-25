const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const zlib=require("zlib");
const {execSync}=require("child_process");
const {performance}=require("perf_hooks");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function sh(cmd){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5000}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function gb(x){return +(x/1073741824).toFixed(2);}
function mb(x){return +(x/1048576).toFixed(2);}

function detectSupport(){
  const cpus=os.cpus();
  const cpu0=cpus[0]||{};
  const cpuinfo=fs.existsSync("/proc/cpuinfo") ? fs.readFileSync("/proc/cpuinfo","utf8") : "";
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/).filter(Boolean);
  const has=f=>flags.includes(f);

  const support={
    time:new Date().toISOString(),
    runtime:{
      node:process.version,
      platform:process.platform,
      arch:process.arch,
      pid:process.pid,
      container:fs.existsSync("/.dockerenv"),
      codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
      hostname:os.hostname()
    },
    cpu:{
      model:cpu0.model||"UNKNOWN",
      logical_cpus:cpus.length,
      speed_mhz_reported:cpu0.speed||null,
      endian:os.endianness(),
      flags:{
        sse:has("sse"),
        sse2:has("sse2"),
        sse3:has("pni")||has("sse3"),
        ssse3:has("ssse3"),
        sse4_1:has("sse4_1"),
        sse4_2:has("sse4_2"),
        avx:has("avx"),
        avx2:has("avx2"),
        avx512f:has("avx512f"),
        fma:has("fma"),
        aes:has("aes"),
        sha_ni:has("sha_ni")
      },
      raw_lscpu:sh("lscpu 2>/dev/null | head -80")
    },
    memory:{
      total_gb:gb(os.totalmem()),
      free_gb:gb(os.freemem()),
      node_heap_limit_hint:"V8 heap is separate; use --max-old-space-size for larger Node heap"
    },
    gpu:{
      nvidia_smi:sh("nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null"),
      cuda_nvcc:sh("nvcc --version 2>/dev/null | tail -5"),
      verdict:"REAL_GPU_ONLY_IF_NVIDIA_SMI_OR_CUDA_PRESENT"
    },
    io:{
      cwd:process.cwd(),
      disk:sh("df -h . 2>/dev/null | tail -1"),
      limits:sh("ulimit -a 2>/dev/null")
    },
    doctrine:"REAL_SUPPORT_DETECTION_FIRST_NO_FAKE_CPU_NO_FAKE_GPU_NO_FAKE_RAM"
  };

  support.classification = support.runtime.codespaces
    ? "CODESPACES_VIRTUALIZED_SUPPORT"
    : support.runtime.container
      ? "CONTAINERIZED_LOCAL_OR_REMOTE_SUPPORT"
      : "LOCAL_HOST_SUPPORT";

  support.compute_base = {
    primary:"CPU_NODEJS_REAL_HOST",
    gpu: support.gpu.nvidia_smi.includes("UNAVAILABLE") ? "GPU_UNAVAILABLE" : "GPU_DETECTED_EXTERNAL_TO_NODE",
    simd: support.cpu.flags.avx512f ? "AVX512_AVAILABLE_TO_NATIVE_CODE_NOT_DIRECT_JS"
        : support.cpu.flags.avx2 ? "AVX2_AVAILABLE_TO_NATIVE_CODE_NOT_DIRECT_JS"
        : support.cpu.flags.sse4_2 ? "SSE4_AVAILABLE_TO_NATIVE_CODE_NOT_DIRECT_JS"
        : "BASIC_CPU_FLAGS",
    note:"JavaScript uses V8/JIT. SIMD flags are detected support, not direct manual AVX execution unless native addon/WASM is used."
  };

  return support;
}

function fireExtremeBench(level="extreme"){
  const cfg={
    light:{loops:1_000_000, hashMB:8, matrixN:64, compressMB:8},
    extreme:{loops:6_000_000, hashMB:32, matrixN:128, compressMB:32},
    fire:{loops:14_000_000, hashMB:64, matrixN:192, compressMB:64}
  }[level] || {loops:6_000_000, hashMB:32, matrixN:128, compressMB:32};

  const tAll=performance.now();
  const cpu0=process.cpuUsage();

  const steps=[];

  let t=performance.now();
  let acc=0;
  for(let i=1;i<=cfg.loops;i++){
    acc += Math.sqrt(i) * Math.sin(i%1000) + Math.log1p(i%999);
    if((i&1023)===0) acc = acc % 1000000007;
  }
  steps.push({name:"chaotic_float_math",loops:cfg.loops,ms:+(performance.now()-t).toFixed(2),checksum:+acc.toFixed(5)});

  t=performance.now();
  const buf=crypto.randomBytes(cfg.hashMB*1024*1024);
  let digest="";
  for(let i=0;i<16;i++){
    digest=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
  }
  steps.push({name:"sha256_pressure",mb:cfg.hashMB,rounds:16,ms:+(performance.now()-t).toFixed(2),digest:digest.slice(0,32)});

  t=performance.now();
  const compressed=zlib.brotliCompressSync(buf);
  const decompressed=zlib.brotliDecompressSync(compressed);
  steps.push({
    name:"brotli_compress_decompress",
    input_mb:cfg.hashMB,
    compressed_mb:mb(compressed.length),
    ratio:+(compressed.length/buf.length).toFixed(4),
    integrity:decompressed.length===buf.length,
    ms:+(performance.now()-t).toFixed(2)
  });

  t=performance.now();
  const n=cfg.matrixN;
  const A=new Float64Array(n*n);
  const B=new Float64Array(n*n);
  const C=new Float64Array(n*n);
  for(let i=0;i<n*n;i++){A[i]=(i%97)/97;B[i]=(i%89)/89;}
  for(let i=0;i<n;i++){
    for(let k=0;k<n;k++){
      const aik=A[i*n+k];
      for(let j=0;j<n;j++) C[i*n+j]+=aik*B[k*n+j];
    }
  }
  let cs=0; for(let i=0;i<C.length;i+=Math.max(1,Math.floor(C.length/1024))) cs+=C[i];
  const matrixOps=2*n*n*n;
  const matrixMs=performance.now()-t;
  steps.push({
    name:"dense_matrix_multiply_float64",
    n,
    approx_ops:matrixOps,
    ms:+matrixMs.toFixed(2),
    approx_gops:+(matrixOps/(matrixMs/1000)/1e9).toFixed(4),
    checksum:+cs.toFixed(5)
  });

  const totalMs=performance.now()-tAll;
  const cpu=process.cpuUsage(cpu0);
  return {
    level,
    type:"REAL_MEASURED_FIRE_EXTREME_NODE",
    total_ms:+totalMs.toFixed(2),
    cpu_user_ms:+(cpu.user/1000).toFixed(2),
    cpu_system_ms:+(cpu.system/1000).toFixed(2),
    rss_mb:mb(process.memoryUsage().rss),
    heap_used_mb:mb(process.memoryUsage().heapUsed),
    external_mb:mb(process.memoryUsage().external),
    steps,
    verdict:"REAL_LOCAL_NODE_BENCHMARK_NOT_SUPERCOMPUTER_CLAIM"
  };
}

const level=(process.argv[2]||"extreme").toLowerCase();
const support=detectSupport();
const bench=fireExtremeBench(level);

const report={
  name:"TRILLIONS_FIRE_EXTREME_SUPPORT_BENCH",
  time:new Date().toISOString(),
  support,
  bench,
  classification:{
    runtime_base:support.classification,
    compute_base:support.compute_base.primary,
    gpu_base:support.compute_base.gpu,
    simd_base:support.compute_base.simd,
    health:
      bench.total_ms<3000 ? "A_FAST_FOR_THIS_HOST" :
      bench.total_ms<10000 ? "B_NORMAL_FOR_CODESPACES_OR_SMALL_NODE" :
      bench.total_ms<30000 ? "C_HEAVY_PRESSURE" :
      "D_TOO_SLOW_OR_THROTTLED",
    honest_reading:"Ce benchmark dit sur quelle base réelle TRILLIONS calcule maintenant. Le profil Threadripper reste cible tant qu'il n'est pas détecté physiquement."
  }
};

const file=`${OUTDIR}/trillions_fire_extreme_support_${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify(report,null,2));
fs.writeFileSync(`${OUTDIR}/trillions_fire_extreme_support_latest.json`,JSON.stringify(report,null,2));

console.log("=== TRILLIONS FIRE EXTREME SUPPORT BENCH ===");
console.log("RUNTIME BASE:",report.classification.runtime_base);
console.log("COMPUTE BASE:",report.classification.compute_base);
console.log("GPU BASE:",report.classification.gpu_base);
console.log("SIMD BASE:",report.classification.simd_base);
console.log("HEALTH:",report.classification.health);
console.log("");
console.log("=== CPU ===");
console.log(`${support.cpu.model} | logical=${support.cpu.logical_cpus} | RAM=${support.memory.total_gb}GB`);
console.log("");
console.log("=== BENCH ===");
console.log(JSON.stringify(bench,null,2));
console.log("");
console.log("REPORT =",file);
