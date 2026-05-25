const fs=require("fs"),os=require("os"),path=require("path"),cp=require("child_process"),crypto=require("crypto");
fs.mkdirSync("data",{recursive:true});

const ROOT=process.cwd();
const SKIP=new Set(["node_modules",".git",".cache","dist","build","coverage"]);
const EXT_OK=new Set([".js",".mjs",".cjs",".json",".c",".cc",".cpp",".h",".hpp",".ts",".tsx",".html",".css",".md",".sh",".yml",".yaml",".txt"]);
const MAX_FILE_MB=5;

const sh=c=>{try{return cp.execSync(c,{stdio:["ignore","pipe","ignore"],timeout:3500}).toString().trim()}catch{return""}};
const has=c=>!!sh(`command -v ${c} 2>/dev/null`);
const sha=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,16);

function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()){
      if(!SKIP.has(ent.name)) walk(p,out);
    }else{
      const ext=path.extname(ent.name).toLowerCase();
      if(EXT_OK.has(ext)){
        const st=fs.statSync(p);
        if(st.size<=MAX_FILE_MB*1024*1024) out.push({p,rel:path.relative(ROOT,p),ext,size:st.size});
      }
    }
  }
  return out;
}

function readSafe(p){
  try{return fs.readFileSync(p,"utf8")}catch{return""}
}

function rxAll(s,re){
  const a=[]; let m;
  while((m=re.exec(s))) a.push(m[1]||m[0]);
  return [...new Set(a)];
}

const flags=sh("lscpu | sed -n 's/^Flags:[[:space:]]*//p'").split(/\s+/).filter(Boolean);
const flag=x=>flags.includes(x);
const cpu=os.cpus()[0]||{};

const detect={
  ts:new Date().toISOString(),
  root:ROOT,
  host:{
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    cpus:os.cpus().length,
    cpu_model:cpu.model||"unknown",
    cpu_ghz:+((cpu.speed||0)/1000).toFixed(3),
    ram_gb:+(os.totalmem()/1024**3).toFixed(3),
    free_gb:+(os.freemem()/1024**3).toFixed(3)
  },
  deps:{
    node:has("node"),npm:has("npm"),python3:has("python3"),gcc:has("gcc"),gpp:has("g++"),
    clang:has("clang"),make:has("make"),cmake:has("cmake"),git:has("git"),
    lscpu:has("lscpu"),nvidia_smi:has("nvidia-smi"),nvcc:has("nvcc"),
    vulkaninfo:has("vulkaninfo"),glxinfo:has("glxinfo"),monado:has("monado-service")||has("monado-cli")
  },
  simd:{
    sse:flag("sse"),sse2:flag("sse2"),sse4_1:flag("sse4_1"),sse4_2:flag("sse4_2"),
    avx:flag("avx"),avx2:flag("avx2"),avx512f:flag("avx512f"),
    avx512bw:flag("avx512bw"),avx512vl:flag("avx512vl"),
    avx512vnni:flag("avx512_vnni")||flag("avx512vnni"),
    fma:flag("fma"),aes:flag("aes"),sha_ni:flag("sha_ni")
  },
  backend:{
    gpu_exposed:false,
    vr_openxr_exposed:false,
    webgpu_env:!!process.env.WEBGPU_BACKEND,
    cuda_visible:!!process.env.CUDA_VISIBLE_DEVICES,
    xr_runtime_json:process.env.XR_RUNTIME_JSON||null
  }
};
detect.backend.gpu_exposed=detect.deps.nvidia_smi||detect.deps.nvcc||detect.deps.vulkaninfo||detect.backend.webgpu_env||detect.backend.cuda_visible;
detect.backend.vr_openxr_exposed=!!detect.backend.xr_runtime_json||detect.deps.monado;

const files=walk(ROOT);
const catalog=[];
const global={
  files_total:files.length,
  by_ext:{},
  api_routes:[],
  ws_events:[],
  requires:[],
  imports:[],
  scripts:[],
  json_files:[],
  native_files:[],
  benchmark_files:[],
  registry_files:[],
  suspicious:[],
  package_scripts:{},
  endpoints_by_file:{}
};

for(const f of files){
  global.by_ext[f.ext]=(global.by_ext[f.ext]||0)+1;
  const s=readSafe(f.p);
  const item={
    file:f.rel, ext:f.ext, size:f.size, hash:sha(s),
    lines:s.split(/\r?\n/).length,
    api_routes:[],
    ws_events:[],
    requires:[],
    imports:[],
    declares:[],
    tags:[]
  };

  if(f.ext===".json"){
    item.tags.push("JSON_REGISTRY");
    global.json_files.push(f.rel);
    try{
      const j=JSON.parse(s);
      if(f.rel==="package.json" && j.scripts) global.package_scripts=j.scripts;
    }catch(e){
      item.tags.push("JSON_PARSE_ERROR");
      global.suspicious.push({file:f.rel,type:"JSON_PARSE_ERROR",msg:e.message});
    }
  }

  if([".c",".cc",".cpp",".h",".hpp"].includes(f.ext)){
    item.tags.push("NATIVE_CPP_C");
    global.native_files.push(f.rel);
  }

  if(/bench|benchmark|perf|speed|crypto|zetta|flops|hash|simd|avx|world|health/i.test(f.rel)){
    item.tags.push("BENCHMARK_OR_PERF");
    global.benchmark_files.push(f.rel);
  }

  if(/registry|catalog|detect|capability|backend|route|data\/.*latest/i.test(f.rel)){
    item.tags.push("REGISTRY_OR_CATALOG");
    global.registry_files.push(f.rel);
  }

  item.api_routes=[
    ...rxAll(s,/\bapp\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g).map((_,i)=>""),
  ].filter(Boolean);

  const routeMatches=[]; let m;
  const routeRe=/\bapp\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=routeRe.exec(s))) routeMatches.push({method:m[1].toUpperCase(),route:m[2]});
  item.api_routes=routeMatches;

  const routerRe=/\brouter\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=routerRe.exec(s))) item.api_routes.push({method:m[1].toUpperCase(),route:m[2],router:true});

  const wsRe=/\b(socket|io)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=wsRe.exec(s))) item.ws_events.push(m[2]);

  const reqRe=/require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  while((m=reqRe.exec(s))) item.requires.push(m[1]);

  const impRe=/import\s+.*?from\s+["'`]([^"'`]+)["'`]/g;
  while((m=impRe.exec(s))) item.imports.push(m[1]);

  const declRe=/\b(function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g;
  while((m=declRe.exec(s))) item.declares.push(m[2]);

  if(/TODO|FIXME|throw new Error|process\.exit|command not found|SyntaxError|TypeError/i.test(s)){
    item.tags.push("NEEDS_REVIEW");
    global.suspicious.push({file:f.rel,type:"REVIEW_PATTERN"});
  }

  if(item.api_routes.length) {
    global.api_routes.push(...item.api_routes.map(r=>({...r,file:f.rel})));
    global.endpoints_by_file[f.rel]=item.api_routes;
  }
  if(item.ws_events.length) global.ws_events.push(...item.ws_events.map(e=>({event:e,file:f.rel})));
  if(item.requires.length) global.requires.push(...item.requires.map(r=>({module:r,file:f.rel})));
  if(item.imports.length) global.imports.push(...item.imports.map(r=>({module:r,file:f.rel})));

  catalog.push(item);
}

const uniqueRoutes=[...new Map(global.api_routes.map(r=>[r.method+" "+r.route,r])).values()];
const modules=[...new Set([...global.requires.map(x=>x.module),...global.imports.map(x=>x.module)])].sort();

const score={
  repo_surface:files.length,
  api_routes:uniqueRoutes.length,
  native_files:global.native_files.length,
  benchmark_files:global.benchmark_files.length,
  registry_files:global.registry_files.length,
  json_files:global.json_files.length,
  modules:modules.length,
  suspicious:global.suspicious.length
};

let health=100;
if(score.suspicious>0) health-=Math.min(25,score.suspicious*2);
if(!detect.deps.gcc && global.native_files.length) health-=10;
if(!detect.backend.gpu_exposed) health-=5;
if(!detect.backend.vr_openxr_exposed) health-=3;
health=Math.max(0,+health.toFixed(2));

const report={
  engine:"TRILLIONX_REPO_TOTAL_AUTODETECT",
  version:"V1_TOTAL_CONCEPTION_SCAN",
  detect,
  score,
  health,
  verdict: health>=90?"EXCELLENT_REPO_CONTROL":health>=75?"GOOD_REPO_CONTROL":"REPO_NEEDS_REVIEW",
  truth_policy:{
    real_only:true,
    no_fake_gpu:true,
    no_fake_vr:true,
    no_fake_world_claim:true,
    benchmark_requires_auto_detect:true,
    repo_scan_is_static_plus_runtime_detection:true
  },
  global:{
    ...global,
    api_routes_unique:uniqueRoutes,
    modules_unique:modules
  },
  catalog
};

const out="data/trillionx_repo_total_autodetect_latest.json";
const stamped=`data/trillionx_repo_total_autodetect_${Date.now()}.json`;
fs.writeFileSync(out,JSON.stringify(report,null,2));
fs.writeFileSync(stamped,JSON.stringify(report,null,2));

console.log("=== TRILLIONX REPO TOTAL AUTODETECT ===");
console.log("FILES:",score.repo_surface,"API:",score.api_routes,"NATIVE:",score.native_files,"BENCH:",score.benchmark_files,"REGISTRY:",score.registry_files);
console.log("MODULES:",score.modules,"SUSPICIOUS:",score.suspicious);
console.log("SIMD:",JSON.stringify(detect.simd));
console.log("GPU:",detect.backend.gpu_exposed?"EXPOSED":"UNAVAILABLE");
console.log("VR/OpenXR:",detect.backend.vr_openxr_exposed?"EXPOSED":"UNAVAILABLE");
console.log("HEALTH:",health);
console.log("VERDICT:",report.verdict);
console.log("REPORT =",out);
