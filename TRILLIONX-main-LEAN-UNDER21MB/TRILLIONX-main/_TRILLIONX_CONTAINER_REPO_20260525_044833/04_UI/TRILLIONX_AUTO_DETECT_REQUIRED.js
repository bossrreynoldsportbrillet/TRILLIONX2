const fs=require("fs"),os=require("os"),cp=require("child_process"),crypto=require("crypto");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const sh=c=>{try{return cp.execSync(c,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return""}};
const has=c=>!!sh(`command -v ${c} 2>/dev/null`);
const cpu=os.cpus()[0]||{};
const flags=sh("lscpu | sed -n 's/^Flags:[[:space:]]*//p'").split(/\s+/).filter(Boolean);
const flag=x=>flags.includes(x);
const ramGB=os.totalmem()/1024**3;
const freeGB=os.freemem()/1024**3;

const detect={
  ts:new Date().toISOString(),
  host:{
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    cpus:os.cpus().length,
    cpu_model:cpu.model||"unknown",
    cpu_ghz:+((cpu.speed||0)/1000).toFixed(3),
    ram_gb:+ramGB.toFixed(3),
    free_gb:+freeGB.toFixed(3)
  },
  simd:{
    sse:flag("sse"),sse2:flag("sse2"),sse4_1:flag("sse4_1"),sse4_2:flag("sse4_2"),
    avx:flag("avx"),avx2:flag("avx2"),avx512f:flag("avx512f"),
    avx512bw:flag("avx512bw"),avx512vl:flag("avx512vl"),avx512vnni:flag("avx512_vnni")||flag("avx512vnni"),
    fma:flag("fma"),aes:flag("aes"),sha_ni:flag("sha_ni")
  },
  deps:{
    gcc:has("gcc"),gpp:has("g++"),clang:has("clang"),make:has("make"),cmake:has("cmake"),
    python3:has("python3"),node:has("node"),lscpu:has("lscpu")
  },
  gpu:{
    nvidia_smi:has("nvidia-smi"),
    nvcc:has("nvcc"),
    vulkaninfo:has("vulkaninfo"),
    glxinfo:has("glxinfo"),
    webgpu_node:!!process.env.WEBGPU_BACKEND,
    cuda_visible:!!process.env.CUDA_VISIBLE_DEVICES,
    exposed:false
  },
  vr:{
    openxr_runtime:!!process.env.XR_RUNTIME_JSON,
    monado:has("monado-service")||has("monado-cli"),
    exposed:false
  }
};

detect.gpu.exposed=detect.gpu.nvidia_smi||detect.gpu.nvcc||detect.gpu.vulkaninfo||detect.gpu.webgpu_node||detect.gpu.cuda_visible;
detect.vr.exposed=detect.vr.openxr_runtime||detect.vr.monado;

detect.route=detect.gpu.exposed?"GPU_REAL_BACKEND":
  detect.simd.avx512f?"CPU_NATIVE_AVX512":
  detect.simd.avx2?"CPU_NATIVE_AVX2":
  detect.simd.avx?"CPU_NATIVE_AVX":
  "CPU_NATIVE_SCALAR";

detect.truth_policy={
  auto_detection_required:true,
  no_fake_gpu:true,
  no_fake_vr:true,
  no_fake_zettahash:true,
  no_fake_zettaflops:true,
  zetta_units_scientific_only:true,
  gpu_status:detect.gpu.exposed?"REAL_EXPOSED":"UNAVAILABLE",
  vr_status:detect.vr.exposed?"REAL_EXPOSED":"SOFTWARE_PROFILE_ONLY",
  benchmark_host_is_current_runtime:true
};

const out="data/trillionx_auto_detect_required_latest.json";
fs.writeFileSync(out,JSON.stringify(detect,null,2));
console.log("=== TRILLIONX AUTO DETECT REQUIRED ===");
console.log("CPU:",detect.host.cpu_model);
console.log("GHz:",detect.host.cpu_ghz,"RAM GB:",detect.host.ram_gb,"FREE GB:",detect.host.free_gb);
console.log("SIMD:",JSON.stringify(detect.simd));
console.log("GPU:",detect.truth_policy.gpu_status);
console.log("VR:",detect.truth_policy.vr_status);
console.log("ROUTE:",detect.route);
console.log("REPORT =",out);
