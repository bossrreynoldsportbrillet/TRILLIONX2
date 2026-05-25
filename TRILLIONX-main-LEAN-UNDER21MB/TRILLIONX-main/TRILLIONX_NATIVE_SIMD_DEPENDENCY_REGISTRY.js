const fs=require("fs"), os=require("os"), cp=require("child_process");
fs.mkdirSync("data",{recursive:true});

const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:4000}).trim()}catch{return ""}};
const has=c=>!!sh(`command -v ${c}`);
const low=s=>(s||"").toLowerCase();

const lscpu=sh("lscpu 2>/dev/null");
const cpuinfo=sh("cat /proc/cpuinfo 2>/dev/null");
const flags=low(lscpu+"\n"+cpuinfo);
const f=x=>flags.includes(x.toLowerCase());

const cpu=os.cpus();
const deps={
  gcc:has("gcc"),
  gpp:has("g++"),
  clang:has("clang"),
  make:has("make"),
  cmake:has("cmake"),
  python3:has("python3"),
  node:true,
  lscpu:!!lscpu,
  proc_cpuinfo:!!cpuinfo
};

const simd={
  x86_base:f("x86_64"),
  mmx:f("mmx"),
  sse:f(" sse ")||f(" sse\n"),
  sse2:f("sse2"),
  sse3:f("sse3")||f("pni"),
  ssse3:f("ssse3"),
  sse4_1:f("sse4_1"),
  sse4_2:f("sse4_2"),
  avx:f(" avx "),
  avx2:f("avx2"),
  avx256:f(" avx ") && f("avx2"),
  fma:f("fma"),
  f16c:f("f16c"),
  aes:f(" aes "),
  sha_ni:f("sha_ni"),
  pclmulqdq:f("pclmulqdq"),
  bmi1:f("bmi1"),
  bmi2:f("bmi2"),
  popcnt:f("popcnt"),
  rdrand:f("rdrand"),
  rdseed:f("rdseed"),
  avx512:f("avx512"),
  avx512f:f("avx512f"),
  avx512dq:f("avx512dq"),
  avx512cd:f("avx512cd"),
  avx512bw:f("avx512bw"),
  avx512vl:f("avx512vl"),
  avx512ifma:f("avx512ifma"),
  avx512vbmi:f("avx512vbmi"),
  avx512vbmi2:f("avx512_vbmi2")||f("avx512vbmi2"),
  avx512vnni:f("avx512_vnni")||f("avx512vnni"),
  avx512bitalg:f("avx512_bitalg")||f("avx512bitalg"),
  avx512vpopcntdq:f("avx512_vpopcntdq")||f("avx512vpopcntdq"),
  avx_vnni:f(" avx_vnni ")||f("avx_vnni")
};

const native_compile_ready = (deps.gcc||deps.clang) && deps.make;
const vector_tiers={
  SIMD_128_READY: simd.sse && simd.sse2 && simd.sse4_1 && simd.sse4_2,
  SIMD_256_READY: simd.avx && simd.avx2 && simd.fma,
  SIMD_512_READY: simd.avx512 && simd.avx512f,
  CRYPTO_ACCEL_READY: simd.aes && simd.sha_ni && simd.pclmulqdq,
  BITOPS_READY: simd.bmi1 && simd.bmi2 && simd.popcnt
};

const native_flags=[];
if(vector_tiers.SIMD_128_READY) native_flags.push("-msse4.2");
if(vector_tiers.SIMD_256_READY) native_flags.push("-mavx2","-mfma");
if(vector_tiers.SIMD_512_READY) native_flags.push("-mavx512f");
if(simd.avx512bw) native_flags.push("-mavx512bw");
if(simd.avx512vl) native_flags.push("-mavx512vl");
if(simd.avx512vnni) native_flags.push("-mavx512vnni");
if(simd.aes) native_flags.push("-maes");
if(simd.sha_ni) native_flags.push("-msha");
if(simd.pclmulqdq) native_flags.push("-mpclmul");

const report={
  time:new Date().toISOString(),
  host:{
    cpu_model:cpu[0]?.model||"unknown",
    logical_cpus:cpu.length,
    cpu_ghz:+((cpu[0]?.speed||0)/1000).toFixed(3),
    ram_gb:+(os.totalmem()/2**30).toFixed(3),
    node:process.version,
    platform:os.platform(),
    arch:os.arch()
  },
  dependencies:deps,
  simd,
  vector_tiers,
  native_compile_ready,
  recommended_native_compile_flags:[...new Set(native_flags)],
  execution_policy:{
    native:true,
    js_only:false,
    compile_required_for_real_intrinsics:true,
    avx256_alias:"AVX_256 means AVX/AVX2 256-bit vector path, not a separate CPU flag",
    no_fake_simd:true
  },
  verdict: native_compile_ready && vector_tiers.SIMD_512_READY
    ? "NATIVE_SIMD_STACK_READY_AVX_AVX2_AVX256_AVX512"
    : native_compile_ready && vector_tiers.SIMD_256_READY
    ? "NATIVE_SIMD_STACK_READY_AVX_AVX2_AVX256_NO_AVX512"
    : "SIMD_FLAGS_DETECTED_BUT_NATIVE_COMPILE_STACK_INCOMPLETE"
};

const file=`data/trillionx_native_simd_dependency_registry_${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify(report,null,2));
fs.writeFileSync("data/trillionx_native_simd_dependency_registry_latest.json",JSON.stringify(report,null,2));

console.log("=== TRILLIONX NATIVE SIMD DEPENDENCY REGISTRY ===");
console.log("CPU:",report.host.cpu_model);
console.log("GHz:",report.host.cpu_ghz,"RAM GB:",report.host.ram_gb);
console.log("DEPS:",deps);
console.log("SIMD_TIERS:",vector_tiers);
console.log("FLAGS:",report.recommended_native_compile_flags.join(" "));
console.log("VERDICT:",report.verdict);
console.log("REPORT =",file);
