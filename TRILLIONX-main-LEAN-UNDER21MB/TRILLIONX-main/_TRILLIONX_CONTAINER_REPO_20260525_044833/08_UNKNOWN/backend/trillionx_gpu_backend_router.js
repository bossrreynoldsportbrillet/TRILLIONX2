const os=require("os"),cp=require("child_process"),fs=require("fs");
const sh=c=>{try{return cp.execSync(c,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return ""}};
const has=c=>!!sh("command -v "+c);
function detect(){
 const cpu=os.cpus()[0]?.model||"unknown";
 const out={
  time:new Date().toISOString(),
  host:{cpu,cpus:os.cpus().length,ram_gb:+(os.totalmem()/2**30).toFixed(3),node:process.version},
  backends:{
   cuda:{available:false,tooling:{nvidia_smi:has("nvidia-smi"),nvcc:has("nvcc")},detail:null},
   vulkan:{available:false,tooling:{vulkaninfo:has("vulkaninfo")},detail:null},
   webgpu:{available:false,env:{WEBGPU_BACKEND:process.env.WEBGPU_BACKEND||null,DAWN_BACKEND:process.env.DAWN_BACKEND||null}},
   openxr:{available:false,tooling:{monado:has("monado-service"),openxr_runtime_json:process.env.XR_RUNTIME_JSON||null}}
  },
  selected_backend:"ASTRAL_SOFTWARE_PROFILE",
  truth_policy:{real_only:true,no_fake_gpu:true,no_fake_vr:true}
 };
 if(out.backends.cuda.tooling.nvidia_smi){
  const q=sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader");
  if(q){out.backends.cuda.available=true;out.backends.cuda.detail=q}
 }
 if(out.backends.vulkan.tooling.vulkaninfo){
  const v=sh("vulkaninfo --summary | head -120");
  if(v){out.backends.vulkan.available=true;out.backends.vulkan.detail=v}
 }
 if(process.env.WEBGPU_BACKEND||process.env.DAWN_BACKEND) out.backends.webgpu.available=true;
 if(process.env.XR_RUNTIME_JSON||has("monado-service")) out.backends.openxr.available=true;
 if(out.backends.cuda.available) out.selected_backend="CUDA_REAL";
 else if(out.backends.vulkan.available) out.selected_backend="VULKAN_REAL";
 else if(out.backends.webgpu.available) out.selected_backend="WEBGPU_DECLARED";
 else out.selected_backend="ASTRAL_SOFTWARE_PROFILE";
 out.verdict=out.selected_backend==="ASTRAL_SOFTWARE_PROFILE"
  ?"GPU_BACKEND_NOT_EXPOSED_SOFTWARE_PROFILE_ONLY"
  :"REAL_OR_DECLARED_GPU_BACKEND_AVAILABLE";
 return out;
}
if(require.main===module){
 fs.mkdirSync("data",{recursive:true});
 const r=detect();
 const f=`data/trillionx_gpu_backend_router_${Date.now()}.json`;
 fs.writeFileSync(f,JSON.stringify(r,null,2));
 fs.writeFileSync("data/trillionx_gpu_backend_router_latest.json",JSON.stringify(r,null,2));
 console.log(JSON.stringify(r,null,2));
 console.log("REPORT =",f);
}
module.exports={detect};
