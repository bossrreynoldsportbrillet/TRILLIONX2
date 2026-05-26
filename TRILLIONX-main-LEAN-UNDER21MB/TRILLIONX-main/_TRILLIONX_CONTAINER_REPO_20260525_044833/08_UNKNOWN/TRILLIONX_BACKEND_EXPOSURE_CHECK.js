const fs=require("fs"),os=require("os"),cp=require("child_process");
fs.mkdirSync("data",{recursive:true});
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim()}catch{return ""}};
const has=c=>!!sh(`command -v ${c}`);
const gpu={
  nvidia_smi:has("nvidia-smi"),
  vulkaninfo:has("vulkaninfo"),
  glxinfo:has("glxinfo"),
  clinfo:has("clinfo"),
  nvcc:has("nvcc"),
  webgpu_node:false,
  cuda_visible:!!process.env.CUDA_VISIBLE_DEVICES,
  vulkan_icd:!!process.env.VK_ICD_FILENAMES,
};
const openxr={
  openxr_runtime:!!process.env.XR_RUNTIME_JSON,
  monado:has("monado-service"),
  xr_runtime_json:process.env.XR_RUNTIME_JSON||null
};
const runtime={
  host:os.hostname(),
  platform:os.platform(),
  arch:os.arch(),
  cpus:os.cpus().length,
  cpu_model:os.cpus()[0]?.model,
  ram_gb:+(os.totalmem()/2**30).toFixed(3),
  free_gb:+(os.freemem()/2**30).toFixed(3),
  node:process.version
};
const verdict =
  (gpu.nvidia_smi||gpu.vulkaninfo||gpu.nvcc) && openxr.openxr_runtime
  ? "REAL_GPU_OPENXR_BACKEND_EXPOSED"
  : (gpu.nvidia_smi||gpu.vulkaninfo||gpu.nvcc)
  ? "GPU_EXPOSED_OPENXR_NOT_EXPOSED"
  : "SOFTWARE_ONLY_GPU_OPENXR_NOT_EXPOSED";
const report={time:new Date().toISOString(),runtime,gpu,openxr,verdict,
truth_policy:{
 real_only:true,
 no_fake_gpu:true,
 no_fake_vr:true,
 codespaces_can_prepare_backend:true,
 physical_gpu_openxr_requires_real_host:true
}};
const f=`data/trillionx_backend_exposure_${Date.now()}.json`;
fs.writeFileSync(f,JSON.stringify(report,null,2));
fs.writeFileSync("data/trillionx_backend_exposure_latest.json",JSON.stringify(report,null,2));
console.log("=== TRILLIONX BACKEND EXPOSURE CHECK ===");
console.log(JSON.stringify(report,null,2));
console.log("REPORT =",f);
