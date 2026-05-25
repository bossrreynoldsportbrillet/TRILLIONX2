const fs=require("fs");
const IN="data/trillionx_repo_master_index_latest.json";
const OUT="data/trillionx_activation_registry_latest.json";

if(!fs.existsSync(IN)){
  console.error("MISSING",IN);
  process.exit(1);
}

const j=JSON.parse(fs.readFileSync(IN,"utf8"));
const has=(x)=>!!x;
const arr=(x)=>Array.isArray(x)?x:[];

const routeRoots=arr(j.route_roots).map(x=>x.key);
const keyFiles=arr(j.key_files);
const mods=arr(j.modules);

function active(name, ok, detail){
  return {
    name,
    status: ok ? "ACTIVE" : "WAIT_REAL_BACKEND",
    detail,
    truth: ok ? "available_in_codespaces_runtime" : "not_exposed_by_codespaces"
  };
}

const gpu=has(j.core?.gpu_exposed)||has(j.backend?.gpu_exposed);
const openxr=has(j.core?.openxr_exposed)||has(j.backend?.openxr_exposed);

const domains=[
  active("CPU_RUNTIME", true, "Node.js CPU runtime active"),
  active("SIMD_NATIVE_FLAGS", !!j.simd, "SSE/AVX/AVX2/AVX512/FMA/AES/SHA_NI detected if present"),
  active("MEMORY_SOFTWARE_CACHE", true, "RAM + heap + external memory + software mirrors"),
  active("WORKERS", (j.score?.key_files||0)>0 || keyFiles.length>0, "worker files indexed and activable"),
  active("API_ROUTES", (j.score?.routes||0)>0, `${j.score?.routes||0} route entries indexed`),
  active("WEBSOCKET_EVENTS", (j.score?.ws_events||0)>0, `${j.score?.ws_events||0} websocket events indexed`),
  active("BENCHMARKS", (j.summary?.bench||0)>0, `${j.summary?.bench||0} benchmark files indexed`),
  active("REGISTRIES", (j.summary?.registry||0)>0, `${j.summary?.registry||0} registry files indexed`),
  active("JSON_CATALOG", (j.summary?.json||0)>0, `${j.summary?.json||0} json files indexed`),
  active("REPO_MASTER_INDEX", true, "repo map active"),
  active("GPU_CUDA_VULKAN_WEBGPU", gpu, "requires real host GPU exposure"),
  active("VR_OPENXR", openxr, "requires OpenXR runtime + real compatible host/headset")
];

const activated=domains.filter(x=>x.status==="ACTIVE").length;
const waiting=domains.filter(x=>x.status!=="ACTIVE").length;

const routeActivation=routeRoots.slice(0,80).map(r=>({
  route_root:r,
  status:"INDEXED_ACTIVE",
  mode:"discoverable_route_family"
}));

let health=70;
health += Math.min(15, activated);
health -= waiting*6;
if((j.summary?.errors||0)>0) health -= Math.min(20,j.summary.errors);
health=Math.max(0,Math.min(100,health));

const out={
  engine:"TRILLIONX_ACTIVATION_REGISTRY",
  ts:new Date().toISOString(),
  source:IN,
  activation:{
    activated,
    waiting,
    health,
    verdict: health>=85?"ACTIVATED_EXCELLENT":health>=70?"ACTIVATED_GOOD":"ACTIVATED_WITH_REVIEW",
    gpu_truth: gpu ? "REAL_GPU_EXPOSED" : "GPU_NOT_EXPOSED_SOFTWARE_PROFILE_ONLY",
    vr_truth: openxr ? "REAL_OPENXR_EXPOSED" : "OPENXR_NOT_EXPOSED_SOFTWARE_MIRROR_ONLY"
  },
  domains,
  route_activation:routeActivation,
  key_files:keyFiles,
  modules:mods,
  humanity_reading:"The system is now treated as an activable map: every real CPU/API/worker/cache/benchmark component is enabled by registry; unavailable GPU/VR backends are preserved as future physical upgrades, not faked.",
  truth_policy:{
    real_only:true,
    no_fake_gpu:true,
    no_fake_vr:true,
    codespaces_can_prepare_backend:true,
    physical_gpu_or_openxr_requires_real_host:true
  }
};

fs.mkdirSync("data",{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(out,null,2));

console.log("=== TRILLIONX ACTIVATION REGISTRY ===");
console.log("ACTIVE:",activated,"WAIT:",waiting);
console.log("HEALTH:",health,out.activation.verdict);
console.log("GPU:",out.activation.gpu_truth);
console.log("VR:",out.activation.vr_truth);
console.log("REPORT =",OUT);
