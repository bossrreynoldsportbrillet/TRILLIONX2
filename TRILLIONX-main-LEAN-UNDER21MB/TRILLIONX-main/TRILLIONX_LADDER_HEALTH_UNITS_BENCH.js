const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance,monitorEventLoopDelay}=require("perf_hooks");
const {execSync}=require("child_process");
fs.mkdirSync("data",{recursive:true});
const r2=x=>Number.isFinite(x)?+x.toFixed(2):null,r3=x=>Number.isFinite(x)?+x.toFixed(3):null,r6=x=>Number.isFinite(x)?+x.toFixed(6):null;
const MB=x=>r2(x/1048576),GB=x=>r3(x/1073741824),TB=x=>r6(x/1099511627776);
function sh(c){try{return execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2500}).trim()}catch(e){return""}}
if(!isMainThread){
 const {loops,cryptoMb}=workerData;let acc=0,t0=performance.now();
 for(let i=1;i<=loops;i++){acc+=Math.sqrt(i)*Math.sin(i%997)+Math.log1p(i%991);if((i&4095)===0)acc%=1e9+7}
 const h=crypto.createHash("sha256").update(crypto.randomBytes(cryptoMb*1048576)).digest("hex");
 const ms=performance.now()-t0;parentPort.postMessage({ok:true,ms:r2(ms),loops,loops_s:r2(loops/(ms/1000)),cryptoMb,checksum:r3(acc),hash:h.slice(0,16)});return;
}
function host(){
 let cpuinfo="";try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8")}catch(e){}
 const fl=((cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"").split(/\s+/),has=f=>fl.includes(f);
 let mhz=(os.cpus()[0]||{}).speed||0,ls=sh("lscpu"),m=(ls.match(/CPU max MHz:\s+([0-9.]+)/)||[])[1];if(m)mhz=parseFloat(m);
 const lc=os.cpus().length,ghz=mhz/1000,agg=ghz*lc;
 return {cpu_model:(os.cpus()[0]||{}).model||"UNKNOWN",logical_cpus:lc,speed_ghz:r3(ghz),aggregate_logical_ghz:r3(agg),aggregate_logical_thz:r6(agg/1000),ram_gb:GB(os.totalmem()),ram_tb:TB(os.totalmem()),free_ram_gb:GB(os.freemem()),node:process.version,platform:process.platform,arch:process.arch,codespaces:!!process.env.CODESPACES||!!process.env.CODESPACE_NAME,container:fs.existsSync("/.dockerenv"),simd:{avx:has("avx"),avx2:has("avx2"),avx512f:has("avx512f"),fma:has("fma"),aes:has("aes"),sha_ni:has("sha_ni")},truth:"THz logique = GHz cumulés threads/1000, pas fréquence physique d’un cœur"};
}
function mem(){const m=process.memoryUsage();return{rss_mb:MB(m.rss),rss_gb:GB(m.rss),heap_mb:MB(m.heapUsed),external_mb:MB(m.external),free_ram_gb:GB(os.freemem()),free_ram_tb:TB(os.freemem())}}
function matrix(n){
 const A=new Float64Array(n*n),B=new Float64Array(n*n),C=new Float64Array(n*n);
 for(let i=0;i<n*n;i++){A[i]=(i%97)/97;B[i]=(i%89)/89}
 let t0=performance.now();for(let i=0;i<n;i++)for(let k=0;k<n;k++){let aik=A[i*n+k];for(let j=0;j<n;j++)C[i*n+j]+=aik*B[k*n+j]}
 let ms=performance.now()-t0,ops=2*n*n*n,gops=ops/(ms/1000)/1e9;return{n,ms:r2(ms),gops:r3(gops),tops:r6(gops/1000)}
}
function memtest(sizeMb,rounds){
 const n=Math.floor(sizeMb*1048576/8),a=new Float64Array(n),b=new Float64Array(n);for(let i=0;i<n;i++)a[i]=i%997;
 let t0=performance.now();for(let r=0;r<rounds;r++)for(let i=0;i<n;i++)b[i]=a[i]*1.000001+b[i]*0.000001;
 let ms=performance.now()-t0,gbps=(sizeMb*1048576*rounds*2/(ms/1000))/1073741824;return{size_mb:sizeMb,size_gb:r3(sizeMb/1024),rounds,ms:r2(ms),gb_s:r3(gbps),tb_s:r6(gbps/1024)}
}
function hash(sizeMb,rounds){
 const buf=crypto.randomBytes(sizeMb*1048576);let t0=performance.now(),h="";
 for(let i=0;i<rounds;i++)h=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
 let ms=performance.now()-t0,mbps=sizeMb*rounds/(ms/1000);return{total_mb:sizeMb*rounds,total_gb:r3(sizeMb*rounds/1024),ms:r2(ms),mb_s:r2(mbps),gb_s:r3(mbps/1024),tb_s:r6(mbps/1048576),hash:h.slice(0,16)}
}
function comp(sizeMb){
 const b=crypto.randomBytes(sizeMb*1048576),t0=performance.now(),gz=zlib.gzipSync(b,{level:1}),out=zlib.gunzipSync(gz),ms=performance.now()-t0,mbps=sizeMb/(ms/1000);
 return{input_mb:sizeMb,input_gb:r3(sizeMb/1024),output_mb:MB(gz.length),ratio:r3(gz.length/b.length),integrity:out.length===b.length,ms:r2(ms),mb_s:r2(mbps),gb_s:r3(mbps/1024),tb_s:r6(mbps/1048576)}
}
async function workers(count,loops,cryptoMb,timeout){
 const t0=performance.now(),jobs=[];for(let i=0;i<count;i++)jobs.push(new Promise(res=>{const w=new Worker(__filename,{workerData:{loops,cryptoMb}});const tm=setTimeout(()=>{try{w.terminate()}catch(e){}res({ok:false,error:"timeout"})},timeout);w.on("message",m=>{clearTimeout(tm);res(m)});w.on("error",e=>{clearTimeout(tm);res({ok:false,error:e.message})});w.on("exit",c=>{if(c!==0){clearTimeout(tm);res({ok:false,error:"exit_"+c})}})}));
 const out=await Promise.all(jobs),ms=performance.now()-t0,ok=out.filter(x=>x.ok).length,tl=count*loops,ls=tl/(ms/1000);
 return{worker_count:count,ok_workers:ok,failed_workers:count-ok,total_loops:tl,ms:r2(ms),loops_s:r2(ls),mloops_s:r3(ls/1e6),gloops_s:r6(ls/1e9),results:out}
}
function cfgs(){let a=[];for(let l=1;l<=12;l++)a.push({level:l,matrixN:128+l*12,memMb:32+l*12,memRounds:2+Math.floor(l/3),hashMb:16+l*4,hashRounds:4+Math.floor(l/2),compMb:8+l*3,workers:Math.min(2+Math.floor(l/4),os.cpus().length,4),loops:700000+l*350000,workerCryptoMb:1+Math.floor(l/4),timeout:18000+l*2500});return a}
function score(it){let r=it.results;return r2(it.level*8+Math.min(25,r.matrix.gops*24)+Math.min(20,r.memory.gb_s*2.5)+Math.min(20,r.hash.mb_s/55)+Math.min(15,r.compression.mb_s/25)+Math.min(30,r.workers.loops_s/120000))}
function health(it){
 let f=[],r=it.results,a=it.after,p=it.event_loop_p95_ms;
 if(a.rss_mb>850)f.push("RSS_HIGH");if(a.free_ram_gb<0.35)f.push("FREE_RAM_LOW");if(p>120)f.push("EVENT_LOOP_WARN");if(p>350)f.push("EVENT_LOOP_CRITICAL");if(r.workers.failed_workers>0)f.push("WORKER_FAIL");if(it.ms>30000)f.push("LEVEL_SLOW");if(r.memory.gb_s<2)f.push("MEM_BW_LOW");if(r.hash.mb_s<250)f.push("HASH_LOW");
 let cpu=Math.min(100,55+r.matrix.gops*18+r.workers.mloops_s*6),memh=Math.min(100,45+r.memory.gb_s*6-Math.max(0,a.rss_mb-300)/25),ev=Math.max(0,100-p/4),wh=r.workers.failed_workers?40:100,stab=f.length?Math.max(45,100-f.length*18):100,overall=r2(cpu*.25+memh*.22+ev*.2+wh*.18+stab*.15);
 return{cpu_health:r2(cpu),memory_health:r2(memh),event_loop_health:r2(ev),worker_health:r2(wh),stability_health:r2(stab),overall_health:overall,status:overall>=90?"EXCELLENT":overall>=75?"GOOD":overall>=60?"WATCH":"PRESSURE",flags:f}
}
(async()=>{
 const h=host(),mon=monitorEventLoopDelay({resolution:20});mon.enable();
 const rep={name:"TRILLIONX_LADDER_HEALTH_UNITS_BENCH",version:"V2_FIX",time:new Date().toISOString(),executed_by:"TRILLIONX",executed_on:h.codespaces?"CODESPACES_VIRTUALIZED_HOST":"LOCAL_HOST",host:h,units:{frequency:"GHz + logical aggregate THz",memory:"GB/TB/GBps/TBps",compute:"GOPS/TOPS",latency:"ms"},levels:[],truth_policy:{real_only:true,no_fake_cpu:true,no_fake_thz:true,measures_current_host:true}};
 console.log("=== TRILLIONX LADDER HEALTH + UNITS BENCH V2 ===");console.log("HOST:",h.cpu_model);console.log("CPU GHz:",h.speed_ghz);console.log("AGG LOGICAL GHz:",h.aggregate_logical_ghz);console.log("AGG LOGICAL THz:",h.aggregate_logical_thz);console.log("RAM GB:",h.ram_gb,"RAM TB:",h.ram_tb);console.log("SIMD:",JSON.stringify(h.simd));
 for(const c of cfgs()){
  mon.reset();let before=mem(),t0=performance.now(),results;
  try{results={matrix:matrix(c.matrixN),memory:memtest(c.memMb,c.memRounds),hash:hash(c.hashMb,c.hashRounds),compression:comp(c.compMb),workers:await workers(c.workers,c.loops,c.workerCryptoMb,c.timeout)}}catch(e){rep.stop_reason="ERROR_"+e.message;rep.levels.push({level:c.level,config:c,before,error:e.message,after:mem()});break}
  let ms=performance.now()-t0,item={level:c.level,config:c,before,after:mem(),ms:r2(ms),event_loop_p95_ms:r2(mon.percentile(95)/1e6),results};item.score=score(item);item.health=health(item);rep.levels.push(item);
  console.log(`\n--- LEVEL ${c.level} ---`);console.log("GHz:",h.speed_ghz,"THz(logic):",h.aggregate_logical_thz);console.log("MATRIX:",results.matrix.gops,"GOPS /",results.matrix.tops,"TOPS");console.log("MEM:",results.memory.gb_s,"GB/s /",results.memory.tb_s,"TB/s");console.log("HASH:",results.hash.mb_s,"MB/s /",results.hash.gb_s,"GB/s");console.log("COMP:",results.compression.mb_s,"MB/s /",results.compression.gb_s,"GB/s");console.log("WORKERS:",results.workers.mloops_s,"Mloops/s");console.log("RSS:",item.after.rss_mb,"MB /",item.after.rss_gb,"GB");console.log("EVENT P95:",item.event_loop_p95_ms,"ms");console.log("SCORE:",item.score);console.log("HEALTH:",item.health.overall_health,item.health.status);console.log("FLAGS:",item.health.flags.join(",")||"NONE");
  if(item.health.flags.includes("EVENT_LOOP_CRITICAL")||item.health.flags.includes("WORKER_FAIL")||item.health.flags.includes("FREE_RAM_LOW")){rep.stop_reason="CONTROLLED_STOP_"+item.health.flags.join("_");break}
  await new Promise(r=>setTimeout(r,250));
 }
 mon.disable();let maxL=Math.max(...rep.levels.map(x=>x.level||0),0),maxS=Math.max(...rep.levels.map(x=>x.score||0),0),avg=r2(rep.levels.reduce((a,x)=>a+(x.health?.overall_health||0),0)/Math.max(1,rep.levels.length)),min=r2(Math.min(...rep.levels.map(x=>x.health?.overall_health||100)));
 rep.summary={max_level_reached:maxL,max_score:r2(maxS),average_health:avg,minimum_health:min,stop_reason:rep.stop_reason||"NO_SATURATION_IN_HEALTH_LADDER",verdict:rep.stop_reason?"LIMIT_FOUND":"TRILLIONX_STABLE_WITH_HEALTH_OK",diagnostic:min>=90?"EXCELLENT_HEALTH_ALL_LEVELS":min>=75?"GOOD_HEALTH_MINOR_PRESSURE":min>=60?"WATCH_PRESSURE_VISIBLE":"PRESSURE_OR_LIMIT",reading:"THz logique indicatif, pas horloge physique."};
 const file=`data/trillionx_ladder_health_units_${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(rep,null,2));fs.writeFileSync("data/trillionx_ladder_health_units_latest.json",JSON.stringify(rep,null,2));
 console.log("\n=== SUMMARY ===");console.log("MAX LEVEL:",rep.summary.max_level_reached);console.log("MAX SCORE:",rep.summary.max_score);console.log("AVG HEALTH:",rep.summary.average_health);console.log("MIN HEALTH:",rep.summary.minimum_health);console.log("STOP:",rep.summary.stop_reason);console.log("VERDICT:",rep.summary.verdict);console.log("DIAGNOSTIC:",rep.summary.diagnostic);console.log("REPORT =",file);
})();
