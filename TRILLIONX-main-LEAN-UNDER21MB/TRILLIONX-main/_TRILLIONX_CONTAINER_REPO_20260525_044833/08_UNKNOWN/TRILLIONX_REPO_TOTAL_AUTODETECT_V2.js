const fs=require("fs"),os=require("os"),path=require("path"),cp=require("child_process"),crypto=require("crypto");
fs.mkdirSync("data",{recursive:true});
const ROOT=process.cwd(),SKIP=new Set(["node_modules",".git",".cache","dist","build","coverage"]);
const EXTS=new Set([".js",".mjs",".cjs",".json",".c",".cc",".cpp",".h",".hpp",".ts",".tsx",".html",".css",".md",".sh",".yml",".yaml",".env",".txt"]);
const sh=c=>{try{return cp.execSync(c,{stdio:["ignore","pipe","ignore"],timeout:3000}).toString().trim()}catch{return""}};
const has=c=>!!sh(`command -v ${c} 2>/dev/null`);
const hash=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,16);
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){let p=path.join(d,e.name);if(e.isDirectory()){if(!SKIP.has(e.name))walk(p,a)}else{let x=path.extname(e.name).toLowerCase(),st=fs.statSync(p);if((EXTS.has(x)||e.name.includes("."))&&st.size<8*1024*1024)a.push({p,rel:path.relative(ROOT,p),ext:x||"NOEXT",size:st.size})}}return a}
function read(p){try{return fs.readFileSync(p,"utf8")}catch{return""}}
function add(map,k,v){if(!map[k])map[k]=[];map[k].push(v)}
const flags=sh("lscpu | sed -n 's/^Flags:[[:space:]]*//p'").split(/\s+/).filter(Boolean);
const flag=x=>flags.includes(x);
const files=walk(ROOT), out=[], idx={
routes:[],api_strings:[],ws:[],requires:[],imports:[],pkg_scripts:{},native:[],bench:[],registry:[],
workers:[],json:[],launch:[],env:[],errors:[],modules:new Set(),ext:{}
};
for(const f of files){
  idx.ext[f.ext]=(idx.ext[f.ext]||0)+1;
  const s=read(f.p), item={file:f.rel,ext:f.ext,size:f.size,hash:hash(s),lines:s.split(/\r?\n/).length,tags:[],routes:[],api_strings:[],ws:[],requires:[],imports:[],scripts:[]};
  if(/worker|thread/i.test(f.rel)){item.tags.push("WORKER");idx.workers.push(f.rel)}
  if(/bench|perf|speed|crypto|zetta|flops|hash|simd|avx|world|health|packet/i.test(f.rel)){item.tags.push("BENCH");idx.bench.push(f.rel)}
  if(/registry|catalog|detect|capability|backend|route|latest|data\//i.test(f.rel)){item.tags.push("REGISTRY");idx.registry.push(f.rel)}
  if([".c",".cc",".cpp",".h",".hpp"].includes(f.ext)){item.tags.push("NATIVE");idx.native.push(f.rel)}
  if(f.ext===".json"){idx.json.push(f.rel);try{let j=JSON.parse(s);if(path.basename(f.rel)==="package.json"&&j.scripts){idx.pkg_scripts=j.scripts;item.scripts=Object.keys(j.scripts)}}catch(e){idx.errors.push({file:f.rel,type:"JSON_PARSE",msg:e.message})}}
  if(/launch\.json$/i.test(f.rel))idx.launch.push(f.rel);
  if(/(^|\/)\.env/i.test(f.rel))idx.env.push(f.rel);

  let m,re;
  re=/\b(app|router)\.(get|post|put|delete|patch|use)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=re.exec(s))){let r={kind:m[1],method:m[2].toUpperCase(),route:m[3],file:f.rel};item.routes.push(r);idx.routes.push(r)}
  re=/(fetch|axios\.(get|post|put|delete|patch)|http\.request|https\.request)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=re.exec(s))){let r={call:m[1],url:m[3],file:f.rel};item.api_strings.push(r);idx.api_strings.push(r)}
  re=/["'`]([^"'`]*\/api\/[^"'`]*)["'`]/g;
  while((m=re.exec(s))){let r={api:m[1],file:f.rel};item.api_strings.push(r);idx.api_strings.push(r)}
  re=/\b(io|socket|server)\.(on|emit)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=re.exec(s))){let w={obj:m[1],op:m[2],event:m[3],file:f.rel};item.ws.push(w);idx.ws.push(w)}
  re=/require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  while((m=re.exec(s))){item.requires.push(m[1]);idx.requires.push({module:m[1],file:f.rel});idx.modules.add(m[1])}
  re=/import\s+.*?from\s+["'`]([^"'`]+)["'`]/g;
  while((m=re.exec(s))){item.imports.push(m[1]);idx.imports.push({module:m[1],file:f.rel});idx.modules.add(m[1])}
  if(/SyntaxError|TypeError|command not found|TODO|FIXME|throw new Error|process\.exit/i.test(s)){item.tags.push("REVIEW");idx.errors.push({file:f.rel,type:"REVIEW_PATTERN"})}
  out.push(item);
}
const unique=a=>[...new Map(a.map(x=>[JSON.stringify(x),x])).values()];
idx.routes=unique(idx.routes);idx.api_strings=unique(idx.api_strings);idx.ws=unique(idx.ws);
const gpu=has("nvidia-smi")||has("nvcc")||has("vulkaninfo")||!!process.env.WEBGPU_BACKEND||!!process.env.CUDA_VISIBLE_DEVICES;
const openxr=has("monado-service")||has("monado-cli")||!!process.env.XR_RUNTIME_JSON;
let health=100-Math.min(30,idx.errors.length*1.5); if(!gpu)health-=5;if(!openxr)health-=3;health=Math.max(0,+health.toFixed(2));
const report={
 engine:"TRILLIONX_REPO_TOTAL_AUTODETECT_V2",
 ts:new Date().toISOString(),
 host:{node:process.version,cpu:os.cpus()[0]?.model,cpus:os.cpus().length,ghz:+((os.cpus()[0]?.speed||0)/1000).toFixed(3),ram_gb:+(os.totalmem()/1024**3).toFixed(3)},
 simd:{sse:flag("sse"),sse2:flag("sse2"),sse4_1:flag("sse4_1"),sse4_2:flag("sse4_2"),avx:flag("avx"),avx2:flag("avx2"),avx512f:flag("avx512f"),fma:flag("fma"),aes:flag("aes"),sha_ni:flag("sha_ni")},
 backend:{gpu_exposed:gpu,openxr_exposed:openxr,webgpu_env:process.env.WEBGPU_BACKEND||null,cuda_visible:process.env.CUDA_VISIBLE_DEVICES||null,xr_runtime_json:process.env.XR_RUNTIME_JSON||null},
 summary:{files:files.length,ext:idx.ext,routes:idx.routes.length,api_strings:idx.api_strings.length,ws_events:idx.ws.length,native:idx.native.length,bench:idx.bench.length,registry:idx.registry.length,workers:idx.workers.length,json:idx.json.length,modules:idx.modules.size,errors:idx.errors.length,health,verdict:health>=90?"EXCELLENT":health>=75?"GOOD":"REVIEW_NEEDED"},
 package_scripts:idx.pkg_scripts,
 routes:idx.routes,api_strings:idx.api_strings,ws_events:idx.ws,
 native_files:idx.native,bench_files:idx.bench,registry_files:idx.registry,worker_files:idx.workers,json_files:idx.json,launch_files:idx.launch,env_files:idx.env,
 modules:[...idx.modules].sort(),errors:idx.errors,catalog:out,
 truth_policy:{real_only:true,scan_repo:true,no_fake_gpu:true,no_fake_vr:true,static_detection_plus_runtime_capability:true}
};
fs.writeFileSync("data/trillionx_repo_total_autodetect_latest.json",JSON.stringify(report,null,2));
fs.writeFileSync(`data/trillionx_repo_total_autodetect_v2_${Date.now()}.json`,JSON.stringify(report,null,2));
console.log("=== TRILLIONX REPO TOTAL AUTODETECT V2 ===");
console.log("FILES",report.summary.files,"ROUTES",report.summary.routes,"API_STRINGS",report.summary.api_strings,"WS",report.summary.ws_events);
console.log("NATIVE",report.summary.native,"BENCH",report.summary.bench,"REGISTRY",report.summary.registry,"WORKERS",report.summary.workers);
console.log("GPU",gpu?"EXPOSED":"UNAVAILABLE","OPENXR",openxr?"EXPOSED":"UNAVAILABLE","HEALTH",health,report.summary.verdict);
console.log("REPORT data/trillionx_repo_total_autodetect_latest.json");
