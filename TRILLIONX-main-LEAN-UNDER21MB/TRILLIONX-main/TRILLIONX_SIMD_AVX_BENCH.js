const os=require("os");
const fs=require("fs");
const crypto=require("crypto");
const {performance}=require("perf_hooks");
const {execSync}=require("child_process");

const OUTDIR="data";
fs.mkdirSync(OUTDIR,{recursive:true});

function sh(cmd){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:6000}).trim();}
  catch(e){return "UNAVAILABLE";}
}
function mb(x){return +(x/1048576).toFixed(2);}
function gb(x){return +(x/1073741824).toFixed(2);}

function detectSIMD(){
  const cpuinfo=fs.existsSync("/proc/cpuinfo") ? fs.readFileSync("/proc/cpuinfo","utf8") : "";
  const flagsLine=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const flags=flagsLine.split(/\s+/).filter(Boolean);
  const has=f=>flags.includes(f);

  const simd={
    sse:has("sse"),
    sse2:has("sse2"),
    sse3:has("pni")||has("sse3"),
    ssse3:has("ssse3"),
    sse4_1:has("sse4_1"),
    sse4_2:has("sse4_2"),
    avx:has("avx"),
    avx2:has("avx2"),
    fma:has("fma"),
    avx512f:has("avx512f"),
    avx512dq:has("avx512dq"),
    avx512cd:has("avx512cd"),
    avx512bw:has("avx512bw"),
    avx512vl:has("avx512vl"),
    avx512vnni:has("avx512_vnni"),
    aes:has("aes"),
    sha_ni:has("sha_ni")
  };

  const tier =
    simd.avx512f ? "AVX512_DETECTED_NATIVE_SUPPORT" :
    simd.avx2 ? "AVX2_DETECTED_NATIVE_SUPPORT" :
    simd.avx ? "AVX_DETECTED_NATIVE_SUPPORT" :
    simd.sse4_2 ? "SSE4_DETECTED_NATIVE_SUPPORT" :
    "BASIC_CPU_SUPPORT";

  return {
    cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    ram_gb:gb(os.totalmem()),
    platform:process.platform,
    arch:process.arch,
    node:process.version,
    codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
    container:fs.existsSync("/.dockerenv"),
    simd,
    tier,
    lscpu:sh("lscpu 2>/dev/null | egrep 'Model name|CPU\\(s\\)|Thread|Core|Socket|Flags|Virtualization|Hypervisor|MHz' | head -80"),
    doctrine:"SIMD flags are detected from host CPU. JS/V8 may use optimized machine code, but manual AVX512 execution requires native addon/WASM/C/C++."
  };
}

function wasmSIMDProbe(){
  // Minimal probe: checks if WebAssembly exists. True SIMD bytecode probe is runtime-sensitive.
  return {
    webassembly_available: typeof WebAssembly !== "undefined",
    note:"For direct portable SIMD, add a WASM SIMD module later. This benchmark currently uses JS typed arrays + V8 JIT."
  };
}

function benchFloat64Vector(size=4_000_000, rounds=8){
  const a=new Float64Array(size);
  const b=new Float64Array(size);
  const c=new Float64Array(size);
  for(let i=0;i<size;i++){a[i]=(i%1000)*0.001;b[i]=((i*7)%1000)*0.001;}
  const t0=performance.now();
  let checksum=0;
  for(let r=0;r<rounds;r++){
    for(let i=0;i<size;i++){
      c[i]=a[i]*1.0000001+b[i]*0.9999999+c[i]*0.000001;
    }
  }
  for(let i=0;i<size;i+=4096) checksum+=c[i];
  const ms=performance.now()-t0;
  const ops=size*rounds*5;
  return {
    name:"typedarray_float64_vector_pressure",
    size,
    rounds,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(6)
  };
}

function benchFloat32Vector(size=8_000_000, rounds=8){
  const a=new Float32Array(size);
  const b=new Float32Array(size);
  const c=new Float32Array(size);
  for(let i=0;i<size;i++){a[i]=(i%997)*0.001;b[i]=((i*13)%991)*0.001;}
  const t0=performance.now();
  let checksum=0;
  for(let r=0;r<rounds;r++){
    for(let i=0;i<size;i++){
      c[i]=Math.fround(Math.fround(a[i]*1.0001)+Math.fround(b[i]*0.9999));
    }
  }
  for(let i=0;i<size;i+=8192) checksum+=c[i];
  const ms=performance.now()-t0;
  const ops=size*rounds*3;
  return {
    name:"typedarray_float32_vector_pressure",
    size,
    rounds,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(6)
  };
}

function benchInt32Vector(size=8_000_000, rounds=10){
  const a=new Int32Array(size);
  const b=new Int32Array(size);
  const c=new Int32Array(size);
  for(let i=0;i<size;i++){a[i]=i|0;b[i]=(i*2654435761)|0;}
  const t0=performance.now();
  let checksum=0;
  for(let r=0;r<rounds;r++){
    for(let i=0;i<size;i++){
      c[i]=((a[i]^b[i]) + ((a[i]<<5) | (b[i]>>>3)))|0;
    }
  }
  for(let i=0;i<size;i+=8192) checksum=(checksum+c[i])|0;
  const ms=performance.now()-t0;
  const ops=size*rounds*5;
  return {
    name:"int32_bitwise_vector_pressure",
    size,
    rounds,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum
  };
}

function benchCrypto(mbSize=64, rounds=24){
  const buf=crypto.randomBytes(mbSize*1024*1024);
  const t0=performance.now();
  let digest="";
  for(let i=0;i<rounds;i++){
    digest=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
  }
  const ms=performance.now()-t0;
  const totalMB=mbSize*rounds;
  return {
    name:"sha256_crypto_pressure",
    mb_per_round:mbSize,
    rounds,
    total_mb:totalMB,
    ms:+ms.toFixed(2),
    mb_per_sec:+(totalMB/(ms/1000)).toFixed(2),
    digest:digest.slice(0,32)
  };
}

function benchMatrix(n=192){
  const A=new Float64Array(n*n);
  const B=new Float64Array(n*n);
  const C=new Float64Array(n*n);
  for(let i=0;i<n*n;i++){A[i]=(i%97)/97;B[i]=(i%89)/89;}
  const t0=performance.now();
  for(let i=0;i<n;i++){
    for(let k=0;k<n;k++){
      const aik=A[i*n+k];
      for(let j=0;j<n;j++) C[i*n+j]+=aik*B[k*n+j];
    }
  }
  let checksum=0;
  for(let i=0;i<C.length;i+=Math.max(1,Math.floor(C.length/1024))) checksum+=C[i];
  const ms=performance.now()-t0;
  const ops=2*n*n*n;
  return {
    name:"dense_matrix_float64",
    n,
    approx_ops:ops,
    ms:+ms.toFixed(2),
    approx_gops:+(ops/(ms/1000)/1e9).toFixed(4),
    checksum:+checksum.toFixed(6)
  };
}

function run(){
  const level=(process.argv[2]||"extreme").toLowerCase();
  const cfg = level==="fire" ? {
    f64Size:8_000_000,f64Rounds:10,
    f32Size:16_000_000,f32Rounds:10,
    i32Size:16_000_000,i32Rounds:12,
    cryptoMB:96,cryptoRounds:32,
    matrixN:256
  } : {
    f64Size:4_000_000,f64Rounds:8,
    f32Size:8_000_000,f32Rounds:8,
    i32Size:8_000_000,i32Rounds:10,
    cryptoMB:64,cryptoRounds:24,
    matrixN:192
  };

  const support=detectSIMD();
  const cpu0=process.cpuUsage();
  const tAll=performance.now();

  const tests=[
    benchFloat64Vector(cfg.f64Size,cfg.f64Rounds),
    benchFloat32Vector(cfg.f32Size,cfg.f32Rounds),
    benchInt32Vector(cfg.i32Size,cfg.i32Rounds),
    benchCrypto(cfg.cryptoMB,cfg.cryptoRounds),
    benchMatrix(cfg.matrixN)
  ];

  const totalMs=performance.now()-tAll;
  const cpu=process.cpuUsage(cpu0);
  const mem=process.memoryUsage();

  const report={
    name:"TRILLIONX_SIMD_AVX_BENCH",
    version:"V1",
    level,
    time:new Date().toISOString(),
    support,
    wasm:wasmSIMDProbe(),
    tests,
    summary:{
      total_ms:+totalMs.toFixed(2),
      cpu_user_ms:+(cpu.user/1000).toFixed(2),
      cpu_system_ms:+(cpu.system/1000).toFixed(2),
      rss_mb:mb(mem.rss),
      heap_used_mb:mb(mem.heapUsed),
      external_mb:mb(mem.external),
      detected_tier:support.tier,
      real_compute_base:"CPU_NODEJS_REAL_HOST",
      manual_avx_execution:"UNAVAILABLE_IN_PURE_JS",
      verdict:"SIMD_SUPPORT_DETECTED_BENCHMARK_REAL_HOST_ONLY"
    }
  };

  const file=`${OUTDIR}/trillionx_simd_avx_bench_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUTDIR}/trillionx_simd_avx_bench_latest.json`,JSON.stringify(report,null,2));

  console.log("=== TRILLIONX SIMD / AVX / AVX2 / AVX512 BENCH ===");
  console.log("CPU:",support.cpu_model);
  console.log("TIER:",support.tier);
  console.log("REAL COMPUTE:",report.summary.real_compute_base);
  console.log("MANUAL AVX:",report.summary.manual_avx_execution);
  console.log("");
  for(const t of tests) console.log(`${t.name}: ${t.ms} ms`, t.approx_gops ? `~${t.approx_gops} GOPS` : "", t.mb_per_sec ? `${t.mb_per_sec} MB/s` : "");
  console.log("");
  console.log("SUMMARY:",JSON.stringify(report.summary,null,2));
  console.log("REPORT =",file);
}

run();
