const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");
const OUT="data"; fs.mkdirSync(OUT,{recursive:true});
const now=()=>Date.now();
const round=x=>Number.isFinite(x)?+x.toFixed(3):null;
const MB=x=>round(x/1048576),GB=x=>round(x/1073741824),TB=x=>round(x/1099511627776);
const mode=(process.argv[2]||"packet").toLowerCase();
const cpu=os.cpus()[0]||{};
const flags=(()=>{try{return fs.readFileSync("/proc/cpuinfo","utf8").toLowerCase()}catch{return""}})();
const simd={
  avx:/\bavx\b/.test(flags),avx2:/\bavx2\b/.test(flags),avx512:/avx512/.test(flags),
  fma:/\bfma\b/.test(flags),aes:/\baes\b/.test(flags),sha_ni:/sha_ni/.test(flags)
};
const PROFILE={
  runtime:"TRILLIONX_RUNTIME_ENGINE",
  support:"VIRTUALIZED_SUPPORT_NODE",
  target:"DUAL_THREADRIPPER_9000VW_3NM_266MB_3D_VCACHE_ECC",
  truth:"REAL_HOST_MEASURED + TRILLIONX_PROFILE_LAYER; NO_FAKE_FRONTIER_CLAIM"
};
const cfg={safe:{levels:4,mb:8},heavy:{levels:7,mb:16},fire:{levels:10,mb:24},packet:{levels:6,mb:12}}[mode]||{levels:6,mb:12};
function eventP95(){
  return new Promise(res=>{
    let arr=[],last=performance.now(),n=0;
    const id=setInterval(()=>{let t=performance.now();arr.push(t-last);last=t;if(++n>=40){clearInterval(id);arr.sort((a,b)=>a-b);res(round(arr[Math.floor(arr.length*.95)]));}},5);
  });
}
function matrix(n){
  const a=new Float64Array(n*n),b=new Float64Array(n*n),c=new Float64Array(n*n);
  for(let i=0;i<a.length;i++){a[i]=(i%97)/97;b[i]=(i%89)/89}
  const t=performance.now();
  for(let i=0;i<n;i++)for(let k=0;k<n;k++){const aik=a[i*n+k];for(let j=0;j<n;j++)c[i*n+j]+=aik*b[k*n+j]}
  const ms=performance.now()-t,ops=2*n*n*n;
  return {gops:round(ops/(ms/1000)/1e9),ms:round(ms),checksum:round(c[0]+c[c.length-1])};
}
function mem(mb){
  const n=mb*1048576,buf=Buffer.allocUnsafe(n);
  let t=performance.now(); for(let i=0;i<n;i+=4096)buf[i]=i&255;
  let write=performance.now()-t;
  t=performance.now(); let s=0; for(let i=0;i<n;i+=4096)s+=buf[i];
  let read=performance.now()-t;
  return {mb,gbps:round((mb/1024)/((write+read)/1000)),checksum:s};
}
function hash(mb){
  const buf=crypto.randomBytes(mb*1048576);
  const t=performance.now();
  const h=crypto.createHash("sha256").update(buf).digest("hex");
  const ms=performance.now()-t;
  return {mb,mbps:round(mb/(ms/1000)),ms:round(ms),hash:h.slice(0,16)};
}
function comp(mb){
  const buf=crypto.randomBytes(mb*1048576);
  let t=performance.now(); const z=zlib.brotliCompressSync(buf); let c=performance.now()-t;
  t=performance.now(); const u=zlib.brotliDecompressSync(z); let d=performance.now()-t;
  return {mb,ratio:round(z.length/buf.length),mbps:round((mb*2)/((c+d)/1000)),ok:u.length===buf.length};
}
function workerLoops(loops){
  let acc=0,t=performance.now();
  for(let i=1;i<=loops;i++){acc+=Math.sqrt(i%99991)*Math.sin(i%8191); if((i&8191)===0)acc%=1e9+7}
  const ms=performance.now()-t;
  return {loops,mloops_s:round((loops/(ms/1000))/1e6),ms:round(ms),checksum:round(acc)};
}
function health(row){
  let h=100,flags=[];
  if(row.event_p95_ms>50){h-=15;flags.push("EVENT_LOOP_PRESSURE")}
  if(row.rss_mb>512){h-=10;flags.push("RSS_HIGH")}
  if(row.mem_gbps<2){h-=10;flags.push("MEM_BW_LOW")}
  if(row.hash_mbps<200){h-=10;flags.push("HASH_LOW")}
  if(row.matrix_gops<0.1){h-=10;flags.push("MATRIX_LOW")}
  return {health:round(Math.max(0,h)),diag:h>=90?"EXCELLENT":h>=75?"GOOD":h>=60?"PRESSURE":"LIMIT",flags};
}
(async()=>{
  console.log("=== TRILLIONX FIRE PACKET EXTREME BENCH FIXED ===");
  console.log("RUNTIME:",PROFILE.runtime);
  console.log("SUPPORT:",PROFILE.support);
  console.log("TARGET:",PROFILE.target);
  console.log("GHz measured:",round((cpu.speed||0)/1000),"THz logic:",round(((cpu.speed||0)/1000)*(os.cpus().length||1)/1000));
  console.log("RAM:",GB(os.totalmem()),"GB /",TB(os.totalmem()),"TB");
  console.log("SIMD:",JSON.stringify(simd));
  let levels=[];
  for(let lv=1;lv<=cfg.levels;lv++){
    const n=64+lv*16,mb=cfg.mb+lv*4,loops=400000*lv;
    console.log("\n--- PACKET LEVEL",lv,"---");
    const m=matrix(n),mm=mem(mb),hh=hash(Math.min(64,mb)),cc=comp(Math.min(32,mb)),wl=workerLoops(loops),p95=await eventP95();
    const row={level:lv,ghz:round((cpu.speed||0)/1000),logical_thz:round(((cpu.speed||0)/1000)*(os.cpus().length||1)/1000),
      matrix_gops:m.gops,matrix_tops:round(m.gops/1000),mem_gbps:mm.gbps,mem_tbps:round(mm.gbps/1024),
      hash_mbps:hh.mbps,hash_gbps:round(hh.mbps/1024),comp_mbps:cc.mbps,comp_gbps:round(cc.mbps/1024),
      worker_mloops_s:wl.mloops_s,rss_mb:MB(process.memoryUsage().rss),rss_gb:GB(process.memoryUsage().rss),event_p95_ms:p95};
    Object.assign(row,health(row));
    console.log("MATRIX:",row.matrix_gops,"GOPS /",row.matrix_tops,"TOPS");
    console.log("MEM:",row.mem_gbps,"GB/s /",row.mem_tbps,"TB/s");
    console.log("HASH:",row.hash_mbps,"MB/s /",row.hash_gbps,"GB/s");
    console.log("COMP:",row.comp_mbps,"MB/s /",row.comp_gbps,"GB/s");
    console.log("WORKERS:",row.worker_mloops_s,"Mloops/s");
    console.log("RSS:",row.rss_mb,"MB /",row.rss_gb,"GB");
    console.log("EVENT P95:",row.event_p95_ms,"ms");
    console.log("HEALTH:",row.health,row.diag);
    console.log("FLAGS:",row.flags.join(",")||"NONE");
    levels.push(row);
  }
  const max=levels.reduce((a,b)=>b.health>a.health?b:a,levels[0]);
  const report={time:new Date().toISOString(),mode,profile:PROFILE,host:{platform:os.platform(),arch:os.arch(),cpus:os.cpus().length,ram_gb:GB(os.totalmem())},simd,levels,summary:{
    max_level:levels.length,best_health:max.health,best_level:max.level,
    verdict:levels.some(x=>x.diag==="LIMIT")?"SATURATION_OR_LIMIT_DETECTED":"TRILLIONX_STABLE_ON_PACKET_LEVELS",
    note:"Benchmark exécuté par TRILLIONX dans Codespaces. Le CPU physique reste le support hôte; le Threadripper 9000VW est un profil cible/projection jusqu'à détection matérielle réelle."
  }};
  const file=`${OUT}/trillionx_fire_packet_extreme_${now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync(`${OUT}/trillionx_fire_packet_extreme_latest.json`,JSON.stringify(report,null,2));
  console.log("\n=== SUMMARY ===");
  console.log("MAX LEVEL:",report.summary.max_level);
  console.log("BEST HEALTH:",report.summary.best_health);
  console.log("VERDICT:",report.summary.verdict);
  console.log("REPORT =",file);
})();
