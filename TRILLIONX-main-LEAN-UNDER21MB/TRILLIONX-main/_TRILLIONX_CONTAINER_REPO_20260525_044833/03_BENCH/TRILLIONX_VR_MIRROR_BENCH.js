const os=require("os"),fs=require("fs"),cp=require("child_process"),zlib=require("zlib");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const r=(x,n=3)=>Number(x.toFixed(n));
const sleep=ms=>new Promise(a=>setTimeout(a,ms));
function sh(c){try{return cp.execSync(c,{stdio:["ignore","pipe","pipe"],timeout:2500}).toString().trim()}catch(e){return ""}}
function has(c){return !!sh("command -v "+c+" 2>/dev/null")}
function detect(){
  const vulkan=has("vulkaninfo")?sh("vulkaninfo --summary 2>/dev/null | head -30"):"";
  const openxr=has("xrinfo")?sh("xrinfo 2>/dev/null | head -30"):"";
  const cuda=has("nvidia-smi")?sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null"):"";
  return {
    cuda_exposed:!!cuda,
    vulkan_exposed:!!vulkan,
    openxr_exposed:!!openxr,
    real_vr_runtime:!!openxr,
    real_gpu_runtime:!!(cuda||vulkan),
    cuda,cuda_note:cuda?"CUDA_VISIBLE":"CUDA_NOT_EXPOSED",
    vulkan_note:vulkan?"VULKAN_VISIBLE":"VULKAN_NOT_EXPOSED",
    openxr_note:openxr?"OPENXR_VISIBLE":"OPENXR_NOT_EXPOSED"
  };
}
function mirrorPacket(level){
  const mirrors=level*65536;
  const bytes=mirrors*4;
  const arr=new Uint32Array(mirrors);
  let chk=0;
  const t0=performance.now();
  for(let i=0;i<mirrors;i++){
    const v=((i*2654435761)^(level*97531))>>>0;
    arr[i]=v; chk^=v;
  }
  for(let i=0;i<mirrors;i+=3) chk^=(arr[i]>>>((i+level)&7));
  const t1=performance.now();
  const raw=Buffer.from(arr.buffer);
  const c0=performance.now();
  const zip=zlib.deflateSync(raw,{level:1});
  const c1=performance.now();
  return {
    level,mirrors,mb:r(bytes/1024/1024),
    write_read_ms:r(t1-t0),
    mirror_ops_s:r((mirrors+Math.ceil(mirrors/3))/((t1-t0)/1000)),
    bandwidth_gb_s:r((bytes/1024**3)/((t1-t0)/1000)),
    compress_ms:r(c1-c0),
    compressed_mb:r(zip.length/1024/1024),
    compression_ratio:r(zip.length/raw.length,6),
    checksum:chk>>>0
  };
}
(async()=>{
  const mode=process.argv[2]||"safe";
  const max=mode==="fire"?14:mode==="heavy"?10:6;
  const wait=Number(process.argv[3]||1200);
  console.log("=== TRILLIONX VR MIRROR BENCH ===");
  console.log("MODE:",mode,"WAIT:",wait,"ms");
  await sleep(wait);

  const cpu=os.cpus()[0]||{};
  const support=detect();
  const packets=[];
  for(let l=1;l<=max;l++){
    const p=mirrorPacket(l);
    const rss=process.memoryUsage().rss/1024/1024;
    const health=Math.max(60,Math.min(100,100-(p.write_read_ms/30)-(rss/900)));
    p.rss_mb=r(rss);
    p.health=r(health,2);
    p.flags=[];
    if(!support.openxr_exposed)p.flags.push("OPENXR_NOT_EXPOSED");
    if(!support.cuda_exposed&&!support.vulkan_exposed)p.flags.push("GPU_BACKEND_NOT_EXPOSED");
    console.log(`--- VR MIRROR LEVEL ${l} ---`);
    console.log(`MIRRORS ${p.mirrors} | BW ${p.bandwidth_gb_s} GB/s | OPS ${p.mirror_ops_s}/s | ZIP ${p.compression_ratio} | HEALTH ${p.health}`);
    packets.push(p);
  }
  const best=packets.reduce((a,b)=>b.mirror_ops_s>a.mirror_ops_s?b:a,packets[0]);
  const avgHealth=r(packets.reduce((s,p)=>s+p.health,0)/packets.length,2);
  const report={
    time:new Date().toISOString(),
    engine:"TRILLIONX",
    bench:"VR_MIRROR_MEMORY_REAL_HOST",
    mode,wait_ms:wait,
    cpu_profile:{model:cpu.model,logical:os.cpus().length,ghz:r((cpu.speed||0)/1000),ram_gb:r(os.totalmem()/1024**3)},
    support,
    packets,
    summary:{
      best_level:best.level,
      best_mirror_ops_s:best.mirror_ops_s,
      best_bandwidth_gb_s:best.bandwidth_gb_s,
      avg_health:avgHealth,
      diagnostic:avgHealth>=90?"EXCELLENT":avgHealth>=75?"GOOD":"PRESSURE",
      verdict:support.real_vr_runtime
        ?"REAL_OPENXR_VR_MIRROR_RUNTIME_EXPOSED"
        :"VR_MIRROR_SOFTWARE_READY_OPENXR_NOT_EXPOSED"
    },
    truth_policy:{
      real_only:true,
      no_fake_vr:true,
      mirror_vr_is_memory_runtime:true,
      real_headset_requires_openxr:true,
      gpu_backend_required_for_real_rendering:true
    }
  };
  const file="data/trillionx_vr_mirror_"+Date.now()+".json";
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_vr_mirror_latest.json",JSON.stringify(report,null,2));
  console.log("=== SUMMARY ===");
  console.log("BEST LEVEL:",report.summary.best_level);
  console.log("BEST MIRROR OPS/S:",report.summary.best_mirror_ops_s);
  console.log("BEST BW GB/S:",report.summary.best_bandwidth_gb_s);
  console.log("AVG HEALTH:",report.summary.avg_health,report.summary.diagnostic);
  console.log("VERDICT:",report.summary.verdict);
  console.log("REPORT =",file);
})();
