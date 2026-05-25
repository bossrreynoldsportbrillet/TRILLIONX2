const os=require("os"),fs=require("fs"),crypto=require("crypto"),cp=require("child_process");
const {performance}=require("perf_hooks");
const OUT="data"; fs.mkdirSync(OUT,{recursive:true});
const now=()=>new Date().toISOString();
const sh=(c)=>{try{return cp.execSync(c,{stdio:["ignore","pipe","ignore"],timeout:2500}).toString().trim()}catch{return ""}};
const has=(c)=>!!sh("command -v "+c);
const flags=(()=>{let s=(sh("lscpu")+"\n"+sh("cat /proc/cpuinfo")).toLowerCase();let k=["sse","sse2","sse4_1","sse4_2","avx","avx2","avx512f","avx512bw","avx512vl","avx512vnni","fma","aes","sha_ni"];let o={};for(const x of k)o[x]=s.includes(x);return o})();
const gpu={
 nvidia_smi:has("nvidia-smi"), nvcc:has("nvcc"), vulkaninfo:has("vulkaninfo"),
 glxinfo:has("glxinfo"), clinfo:has("clinfo"),
 cuda_visible:!!process.env.CUDA_VISIBLE_DEVICES,
 webgpu_node:!!process.env.WEBGPU_BACKEND||!!process.env.DAWN_BACKEND,
 real_cuda:false, real_vulkan:false, real_webgpu:false
};
if(gpu.nvidia_smi){let q=sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader");gpu.nvidia_query=q;gpu.real_cuda=!!q}
if(gpu.vulkaninfo){let v=sh("vulkaninfo --summary | head -80");gpu.vulkan_summary=v;gpu.real_vulkan=!!v}
gpu.real_webgpu=gpu.webgpu_node;

const PROFILE={
 name:"TRILLIONX_RTX4090_ASTRAL_VIRTUAL_PROFILE",
 target:"RTX_4090_ASTRAL_VIRTUALIZED",
 vram_gb_profile:24,
 cuda_cores_profile:16384,
 tensor_cores_profile:512,
 rt_cores_profile:128,
 bus_profile:"PCIe_4.0_x16_profile",
 truth:"profile_or_emulation_until_real_gpu_backend_detected",
 no_fake_gpu:true
};

function hashMB(mb,rounds){
 let b=crypto.randomBytes(mb*1024*1024),t=performance.now(),h="";
 for(let i=0;i<rounds;i++)h=crypto.createHash("sha256").update(b).digest("hex");
 let ms=performance.now()-t; return {input_mb:mb,rounds,ms:+ms.toFixed(3),mb_s:+(mb*rounds/(ms/1000)).toFixed(3),hash:h.slice(0,16)};
}
function matrix(n,it){
 let a=new Float64Array(n),b=new Float64Array(n);for(let i=0;i<n;i++){a[i]=Math.sin(i);b[i]=Math.cos(i)}
 let t=performance.now(),s=0;for(let k=0;k<it;k++){for(let i=0;i<n;i++)s+=a[i]*b[i]+Math.sqrt((i%97)+1)}
 let ms=performance.now()-t,ops=n*it*4;return {n,it,ms:+ms.toFixed(3),gops:+(ops/(ms/1000)/1e9).toFixed(6),checksum:+s.toFixed(3)};
}
function vrMirror(mirrors){
 let t=performance.now(),x=0;for(let i=0;i<mirrors;i++){x^=((i*2654435761)>>>0);x=(x+((x<<7)>>>0))>>>0}
 let ms=performance.now()-t;return {mirrors,ms:+ms.toFixed(3),mirror_ops_s:+(mirrors/(ms/1000)).toFixed(2),checksum:x};
}
function memStream(mb){
 let n=mb*1024*1024/8,a=new Float64Array(n);let t=performance.now();
 for(let i=0;i<n;i++)a[i]=i%1024; let s=0; for(let i=0;i<n;i++)s+=a[i];
 let ms=performance.now()-t; return {mb,ms:+ms.toFixed(3),gb_s:+((mb*2/1024)/(ms/1000)).toFixed(3),checksum:+s.toFixed(1)};
}
async function wait(ms){return new Promise(r=>setTimeout(r,ms))}
(async()=>{
 let mode=process.argv[2]||"safe";
 let waitms=Number(process.argv[3]||1200);
 let level=mode==="fire"?8:mode==="heavy"?6:4;
 console.log("=== TRILLIONX RTX4090 ASTRAL PROFILE BENCH ===");
 console.log("MODE:",mode,"WAIT:",waitms+"ms");
 console.log("PROFILE:",PROFILE.target);
 console.log("GPU REAL CUDA:",gpu.real_cuda,"VULKAN:",gpu.real_vulkan,"WEBGPU:",gpu.real_webgpu);
 console.log("SIMD:",JSON.stringify(flags));
 let packets=[];
 for(let i=1;i<=level;i++){
   await wait(waitms);
   let matrixRes=matrix(12000*i,2+i);
   let memRes=memStream(Math.min(16+i*8,96));
   let hashRes=hashMB(Math.min(8+i*4,64),2+i);
   let vrRes=vrMirror(250000*i);
   let realBackend=gpu.real_cuda||gpu.real_vulkan||gpu.real_webgpu;
   let score=matrixRes.gops*80+memRes.gb_s*4+hashRes.mb_s/25+vrRes.mirror_ops_s/1e6;
   let health=100;
   let f=[];
   if(!gpu.real_cuda&&!gpu.real_vulkan&&!gpu.real_webgpu){f.push("GPU_BACKEND_NOT_EXPOSED");health-=12}
   if(os.freemem()/1024/1024/1024<1){f.push("LOW_FREE_RAM");health-=8}
   if(matrixRes.gops<0.05){f.push("LOW_MATRIX_GOPS");health-=5}
   let p={packet:i,backend:realBackend?"REAL_GPU_BACKEND":"ASTRAL_SOFTWARE_PROFILE",
     matrix_gops:matrixRes.gops,mem_gb_s:memRes.gb_s,hash_mb_s:hashRes.mb_s,
     vr_mirror_ops_s:vrRes.mirror_ops_s,score:+score.toFixed(3),health:Math.max(0,+health.toFixed(2)),flags:f};
   packets.push({summary:p,matrix:matrixRes,mem:memRes,hash:hashRes,vr:vrRes});
   console.log(`--- RTX4090 ASTRAL PACKET ${i} ---`);
   console.log(`BACKEND ${p.backend} | MATRIX ${p.matrix_gops} GOPS | MEM ${p.mem_gb_s} GB/s | HASH ${p.hash_mb_s} MB/s | VR ${p.vr_mirror_ops_s} ops/s`);
   console.log(`SCORE ${p.score} | HEALTH ${p.health} | FLAGS ${f.join(",")||"NONE"}`);
 }
 let best=packets.map(x=>x.summary).sort((a,b)=>b.score-a.score)[0];
 let report={
   time:now(), engine:"TRILLIONX", module:"RTX4090_ASTRAL_VIRTUAL_PROFILE_BENCH",
   profile:PROFILE, host:{platform:os.platform(),release:os.release(),cpus:os.cpus().length,cpu_model:os.cpus()[0]?.model,ram_gb:+(os.totalmem()/2**30).toFixed(3),node:process.version},
   simd:flags, gpu, packets,
   summary:{
     best_score:best.score,best_packet:best.packet,best_backend:best.backend,
     avg_health:+(packets.reduce((a,b)=>a+b.summary.health,0)/packets.length).toFixed(2),
     verdict: gpu.real_cuda||gpu.real_vulkan||gpu.real_webgpu ? "REAL_GPU_BACKEND_AVAILABLE" : "RTX4090_ASTRAL_PROFILE_READY_GPU_NOT_EXPOSED",
     humanity_reading:"Useful as a truthful measurement framework: it separates real backend, software profile, VR mirrors, memory pressure and health without fake GPU claims."
   },
   truth_policy:{real_only:true,no_fake_gpu:true,no_fake_vr:true,codespaces_can_prepare_backend:true,physical_rtx4090_requires_real_host:true}
 };
 let file=`${OUT}/trillionx_rtx4090_astral_profile_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync(`${OUT}/trillionx_rtx4090_astral_profile_latest.json`,JSON.stringify(report,null,2));
 console.log("=== SUMMARY ===");
 console.log("BEST SCORE:",report.summary.best_score);
 console.log("BEST PACKET:",report.summary.best_packet);
 console.log("AVG HEALTH:",report.summary.avg_health);
 console.log("VERDICT:",report.summary.verdict);
 console.log("REPORT =",file);
})();
