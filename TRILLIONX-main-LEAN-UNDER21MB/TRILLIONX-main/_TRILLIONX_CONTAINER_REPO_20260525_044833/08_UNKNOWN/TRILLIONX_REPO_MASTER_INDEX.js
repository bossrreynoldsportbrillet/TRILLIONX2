const fs=require("fs");
const IN="data/trillionx_repo_total_autodetect_latest.json";
const OUT="data/trillionx_repo_master_index_latest.json";
if(!fs.existsSync(IN)){console.error("missing",IN);process.exit(1)}
const j=JSON.parse(fs.readFileSync(IN,"utf8"));
const arr=x=>Array.isArray(x)?x:[];
const countBy=(a,kfn)=>a.reduce((m,x)=>{let k=kfn(x)||"UNKNOWN";m[k]=(m[k]||0)+1;return m},{});
const top=(m,n=30)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({key:k,count:v}));
const routes=arr(j.routes), api=arr(j.api_strings), ws=arr(j.ws_events||j.ws);
const files=arr(j.catalog);
const routeByFile=countBy(routes,x=>x.file);
const apiByFile=countBy(api,x=>x.file);
const wsByFile=countBy(ws,x=>x.file);
const tags=countBy(files.flatMap(f=>(f.tags||[]).map(t=>({t}))),x=>x.t);
const keyFiles=[...new Set([
 ...top(routeByFile,20).map(x=>x.key),
 ...top(apiByFile,20).map(x=>x.key),
 ...top(wsByFile,20).map(x=>x.key),
 ...(j.bench_files||[]).slice(0,20),
 ...(j.registry_files||[]).slice(0,20),
 ...(j.worker_files||[]).slice(0,20),
 ...(j.native_files||[])
])];
const apiRoots=countBy(routes,x=>{
 let r=x.route||"";
 let p=r.split("/").filter(Boolean);
 return p.length?"/"+p[0]+(p[1]?"/"+p[1]:""):"/";
});
const modules=arr(j.modules).filter(Boolean).sort();
const score={
 architecture_surface:j.summary?.files||files.length,
 routes:routes.length,
 api_strings:api.length,
 ws_events:ws.length,
 modules:modules.length,
 key_files:keyFiles.length,
 gpu_exposed:!!j.backend?.gpu_exposed,
 openxr_exposed:!!j.backend?.openxr_exposed
};
let health=100;
if(!score.gpu_exposed)health-=10;
if(!score.openxr_exposed)health-=6;
if((j.summary?.errors||0)>0)health-=Math.min(25,j.summary.errors);
if(routes.length>5000)health-=5;
if(api.length>10000)health-=5;
health=Math.max(0,health);
const verdict=health>=85?"EXCELLENT_INDEXED":health>=70?"GOOD_INDEXED":"INDEXED_REVIEW_NEEDED";
const out={
 engine:"TRILLIONX_REPO_MASTER_INDEX",
 ts:new Date().toISOString(),
 input:IN,
 score,
 health,
 verdict,
 summary:j.summary,
 backend:j.backend,
 simd:j.simd,
 route_roots:top(apiRoots,50),
 top_route_files:top(routeByFile,50),
 top_api_string_files:top(apiByFile,50),
 top_ws_files:top(wsByFile,50),
 tags:top(tags,50),
 modules,
 key_files:keyFiles,
 humanity_reading:"Repo now has a navigable truth map: routes, APIs, workers, registries, benchmarks, native layer, backend exposure, and review load are separated instead of being hidden in raw code.",
 truth_policy:{real_only:true,gpu_not_claimed_if_not_exposed:true,openxr_not_claimed_if_not_exposed:true,index_is_static_map_not_performance_proof:true}
};
fs.writeFileSync(OUT,JSON.stringify(out,null,2));
console.log("=== TRILLIONX MASTER INDEX ===");
console.log("FILES:",score.architecture_surface,"ROUTES:",score.routes,"API:",score.api_strings,"WS:",score.ws_events);
console.log("KEY_FILES:",score.key_files,"MODULES:",score.modules);
console.log("GPU:",score.gpu_exposed?"EXPOSED":"NOT_EXPOSED","OPENXR:",score.openxr_exposed?"EXPOSED":"NOT_EXPOSED");
console.log("HEALTH:",health,verdict);
console.log("REPORT =",OUT);
