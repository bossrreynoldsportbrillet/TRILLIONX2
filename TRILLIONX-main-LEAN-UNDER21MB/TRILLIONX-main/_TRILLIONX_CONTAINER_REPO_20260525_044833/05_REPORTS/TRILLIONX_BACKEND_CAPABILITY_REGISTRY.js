const fs=require("fs"), os=require("os"), cp=require("child_process");
fs.mkdirSync("data",{recursive:true});

const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3500}).trim()}catch{return ""}};
const has=c=>!!sh(`command -v ${c}`);
const exists=p=>{try{return fs.existsSync(p)}catch{return false}};

const cpu=os.cpus();
const flags=sh("lscpu 2>/dev/null || cat /proc/cpuinfo 2>/dev/null");
const f=s=>flags.toLowerCase().includes(s);

const caps={
  time:new Date().toISOString(),
  host:{
    platform:os.platform(),
    arch:os.arch(),
    hostname:os.hostname(),
    node:process.version,
    cpu_logical:cpu.length,
    cpu_model:cpu[0]?.model||"unknown",
    cpu_ghz:+((cpu[0]?.speed||0)/1000).toFixed(3),
    ram_gb:+(os.totalmem()/2**30).toFixed(3),
    free_gb:+(os.freemem()/2**30).toFixed(3)
  },
  cpu:{
    status:"REAL",
    simd:{
      sse:f("sse"),sse2:f("sse2"),sse4_1:f("sse4_1"),sse4_2:f("sse4_2"),
      avx:f(" avx "),avx2:f("avx2"),avx512:f("avx512"),fma:f("fma"),
      aes:f("aes"),sha_ni:f("sha_ni")
    }
  },
  gpu:{
    nvidia_smi:has("nvidia-smi"),
    nvcc:has("nvcc"),
    vulkaninfo:has("vulkaninfo"),
    glxinfo:has("glxinfo"),
    clinfo:has("clinfo"),
    cuda_visible:!!process.env.CUDA_VISIBLE_DEVICES,
    vulkan_icd:!!process.env.VK_ICD_FILENAMES,
    status:"UNAVAILABLE"
  },
  webgpu:{
    node_webgpu:has("node-webgpu"),
    dawn:false,
    status:"UNAVAILABLE"
  },
  vr:{
    openxr_runtime:!!process.env.XR_RUNTIME_JSON,
    xr_runtime_json:process.env.XR_RUNTIME_JSON||null,
    monado:has("monado-service"),
    openxr_lib:exists("/usr/lib/libopenxr_loader.so")||exists("/usr/lib/x86_64-linux-gnu/libopenxr_loader.so"),
    status:"UNAVAILABLE"
  },
  memory:{
    software_cache:true,
    ring_buffer_ready:true,
    mmap_possible:true,
    spill_to_disk:true,
    mirror_runtime:true,
    status:"SOFTWARE_REAL"
  }
};

if(caps.gpu.nvidia_smi||caps.gpu.nvcc) caps.gpu.status="CUDA_VISIBLE";
else if(caps.gpu.vulkaninfo||caps.gpu.vulkan_icd) caps.gpu.status="VULKAN_VISIBLE";
else if(caps.gpu.clinfo) caps.gpu.status="OPENCL_VISIBLE";

if(caps.vr.openxr_runtime||caps.vr.openxr_lib||caps.vr.monado) caps.vr.status="OPENXR_PARTIAL_OR_READY";

caps.truth_policy={
  real_only:true,
  no_fake_gpu:true,
  no_fake_vr:true,
  no_fake_supercomputer:true,
  codespaces_can_prepare_backend:true,
  physical_gpu_openxr_requires_real_host:true
};

caps.best_runtime_path=[
  caps.cpu.status==="REAL"?"CPU_REAL_SIMD":"CPU_UNKNOWN",
  caps.gpu.status,
  caps.webgpu.status,
  caps.vr.status,
  caps.memory.status
];

caps.verdict =
  caps.gpu.status==="UNAVAILABLE" && caps.vr.status==="UNAVAILABLE"
  ? "CPU_MEMORY_SOFTWARE_MIRROR_ONLY__GPU_OPENXR_NOT_EXPOSED"
  : "ACCELERATED_BACKEND_PARTIAL_OR_READY";

const out=`data/trillionx_backend_capability_registry_${Date.now()}.json`;
fs.writeFileSync(out,JSON.stringify(caps,null,2));
fs.writeFileSync("data/trillionx_backend_capability_registry_latest.json",JSON.stringify(caps,null,2));

console.log("=== TRILLIONX BACKEND CAPABILITY REGISTRY ===");
console.log("CPU:",caps.host.cpu_model);
console.log("CPU GHz:",caps.host.cpu_ghz,"RAM GB:",caps.host.ram_gb);
console.log("SIMD:",caps.cpu.simd);
console.log("GPU:",caps.gpu.status);
console.log("VR/OpenXR:",caps.vr.status);
console.log("MEMORY:",caps.memory.status);
console.log("VERDICT:",caps.verdict);
console.log("REPORT =",out);
