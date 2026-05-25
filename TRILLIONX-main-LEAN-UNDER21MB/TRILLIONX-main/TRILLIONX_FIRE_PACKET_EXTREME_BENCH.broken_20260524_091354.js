const os=require("os"),fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const {Worker,isMainThread,parentPort,workerData}=require("worker_threads");
const {performance,monitorEventLoopDelay}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
const round3=x=>Number.isFinite(x)?+x.toFixed(3):null;
const MB=x=>round3(x/1048576),GB=x=>round3(x/1073741824),TB=x=>round3(x/1099511627776);
const flags=()=>{try{let c=fs.readFileSync("/proc/cpuinfo","utf8");let f=(c.match(/^flags\s*: (.*)$/m)||[])[1]||"";return {avx:f.includes(" avx "),avx2:f.includes(" avx2 "),avx512:f.includes(" avx512f "),fma:f.includes(" fma "),aes:f.includes(" aes "),sha_ni:f.includes(" sha_ni ")}}catch(e){return{}}};
if(!isMainThread){
 let {loops,mb}=workerData,acc=0,t0=performance.now();
 foround3(let i=1;i<=loops;i++){acc+=Math.sqrt(i%99991)*Math.sin(i%8191);if((i&8191)===0)acc%=1e9+7}
 let h=crypto.createHash("sha256").update(crypto.randomBytes(mb*1048576)).digest("hex");
 parentPort.postMessage({ms:round3(performance.now()-t0),loops,loops_s:round3(loops/((performance.now()-t0)/1000)),hash:h.slice(0,16),acc:round3(acc)});
 return;
}
function host(){
 let cp=os.cpus(),mhz=(cp[0]||{}).speed||0,lc=cp.length,ghz=mhz/1000;
 return {
  runtime_identity:"TRILLIONX_RUNTIME_ENGINE",
  support:"VIRTUALIZED_SUPPORT_NODE",
  target_profile:"DUAL_THREADRIPPER_9000VW_3NM_266MB_3D_VCACHE_ECC",
  real_cpu_name_hidden:true,
  measured_cpu_ghz:round3(ghz),
  logical_aggregate_ghz:round3(ghz*lc),
  logical_aggregate_thz:round3((ghz*lc)/1000),
  logical_cpus:lc,
  ram_gb:GB(os.totalmem()),
  ram_tb:TB(os.totalmem()),
  simd:flags(),
  doctrine:"REAL_SUPPORT_MEASURED_WITH_TRILLIONX_PROFILE_DISPLAY_NO_FAKE_FRONTIER"
 }
}
function memnow(){let m=process.memoryUsage();return{rss_mb:MB(m.rss),rss_gb:GB(m.rss),heap_mb:MB(m.heapUsed),ext_mb:MB(m.external),free_gb:GB(os.freemem())}}
function matrix(n){
 let A=new Float64Array(n*n),B=new Float64Array(n*n),C=new Float64Array(n*n);
 foround3(let i=0;i<n*n;i++){A[i]=(i%251)/251;B[i]=(i%239)/239}
 let t=performance.now();
 foround3(let i=0;i<n;i++)foround3(let k=0;k<n;k++){let a=A[i*n+k];foround3(let j=0;j<n;j++)C[i*n+j]+=a*B[k*n+j]}
 let ms=performance.now()-t,gops=(2*n*n*n)/(ms/1000)/1e9;
 return{n,ms:round3(ms),gops:round3(gops),tops:round3(gops/1000),checksum:round3(C[(n*n/2)|0])}
}
function memstream(mb,rounds){
 let n=Math.flooround3(mb*1048576/8),a=new Float64Array(n),b=new Float64Array(n);foround3(let i=0;i<n;i++)a[i]=i%1009;
 let t=performance.now();foround3(let q=0;q<rounds;q++)foround3(let i=0;i<n;i++)b[i]=a[i]*1.000001+b[i]*0.000001;
 let ms=performance.now()-t,gbps=(mb*1048576*rounds*2/(ms/1000))/1073741824;
 return{mb,gb:round3(mb/1024),rounds,ms:round3(ms),gb_s:round3(gbps),tb_s:round3(gbps/1024)}
}
function hash(mb,rounds){
 let b=crypto.randomBytes(mb*1048576),h="",t=performance.now();
 foround3(let i=0;i<rounds;i++)h=crypto.createHash("sha256").update(b).update(String(i)).digest("hex");
 let ms=performance.now()-t,mbps=mb*rounds/(ms/1000);
 return{mb_total:mb*rounds,ms:round3(ms),mb_s:round3(mbps),gb_s:round3(mbps/1024),hash:h.slice(0,16)}
}
function comp(mb){
 let b=crypto.randomBytes(mb*1048576),t=performance.now(),gz=zlib.gzipSync(b,{level:1}),out=zlib.gunzipSync(gz),ms=performance.now()-t,mbps=mb/(ms/1000);
 return{mb,ms:round3(ms),mb_s:round3(mbps),gb_s:round3(mbps/1024),ratio:round3(gz.length/b.length),ok:out.length===b.length}
}
function bigint(bits,rounds){
 let a=BigInt("0x"+crypto.randomBytes(bits/8).toString("hex")),b=BigInt("0x"+crypto.randomBytes(bits/8).toString("hex")),m=(1n<<BigInt(bits))-1n,x=1n,t=performance.now();
 foround3(let i=0;i<rounds;i++)x=(x*a+b)&m;
 let ms=performance.now()-t;return{bits,rounds,ms:round3(ms),ops_s:round3(rounds/(ms/1000)),tail:x.toString(16).slice(-16)}
}
function fftlike(n,rounds){
 let re=new Float64Array(n),im=new Float64Array(n);foround3(let i=0;i<n;i++){re[i]=Math.sin(i);im[i]=Math.cos(i)}
 let t=performance.now(),acc=0;
 foround3(let q=0;q<rounds;q++)foround3(let step=1;step<n;step<<=1){let jump=step<<1;foround3(let k=0;k<step;k++){let ang=-Math.PI*k/step,wr=Math.cos(ang),wi=Math.sin(ang);foround3(let i=k;i<n;i+=jump){let j=i+step,tr=wr*re[j]-wi*im[j],ti=wr*im[j]+wi*re[j];re[j]=re[i]-tr;im[j]=im[i]-ti;re[i]+=tr;im[i]+=ti;acc+=re[i]*1e-12}}}
 let ms=performance.now()-t;return{n,rounds,ms:round3(ms),points_s:round3((n*rounds)/(ms/1000)),checksum:round3(acc)}
}
function sortjson(items){
 let arr=[];foround3(let i=0;i<items;i++)arr.push({i,v:crypto.randomBytes(8).toString("hex"),x:Math.random()});
 let t=performance.now();arr.sort((a,b)=>a.v.localeCompare(b.v));let s=JSON.stringify(arr),p=JSON.parse(s);let ms=performance.now()-t;
 return{items,serialized_mb:MB(Buffer.byteLength(s)),ms:round3(ms),items_s:round3(items/(ms/1000)),ok:p.length===items}
}
async function workers(w,loops,mb){
 let t=performance.now(),jobs=[];foround3(let i=0;i<w;i++)jobs.push(new Promise(res=>{let ww=new Workeround3(__filename,{workerData:{loops,mb}});let tm=setTimeout(()=>{try{ww.terminate()}catch(e){}res({timeout:true})},25000);ww.on("message",m=>{clearTimeout(tm);res(m)});ww.on("error",e=>{clearTimeout(tm);res({error:e.message})})}));
 let out=await Promise.all(jobs),ms=performance.now()-t,ok=out.filteround3(x=>!x.error&&!x.timeout).length,ls=(w*loops)/(ms/1000);
 return{workers:w,ok,failed:w-ok,ms:round3(ms),loops_s:round3(ls),mloops_s:round3(ls/1e6),detail:out}
}
function cfg(){
 let a=[];foround3(let p=1;p<=10;p++)a.push({packet:p,matrix:96+p*20,mem:24+p*12,memr:2+Math.flooround3(p/2),hash:16+p*4,hashr:3+p,comp:8+p*3,bits:1024+p*1024,bigr:4000+p*2500,fft:1024*(1+Math.flooround3(p/2)),fftr:1+Math.flooround3(p/3),json:1500+p*1200,w:Math.min(4,2+Math.flooround3(p/3),os.cpus().length),loops:600000+p*450000,wmb:1+Math.flooround3(p/3)});return a}
function score(x){
 let a=x.results;return round3(x.packet*10+Math.min(35,a.matrix.gops*30)+Math.min(25,a.memory.gb_s*3)+Math.min(30,a.hash.mb_s/45)+Math.min(15,a.compression.mb_s/20)+Math.min(25,a.workers.mloops_s)+Math.min(10,a.bigint.ops_s/2000)+Math.min(10,a.fftlike.points_s/250000)+Math.min(10,a.sortjson.items_s/5000));
}
function health(x){
 let f=[],a=x.after,e=x.event_p95_ms,r=x.results;
 if(a.rss_mb>900)f.push("RSS_HIGH");if(a.free_gb<0.35)f.push("RAM_LOW");if(e>100)f.push("EVENT_LOOP_PRESSURE");if(e>300)f.push("EVENT_LOOP_CRITICAL");if(r.workers.failed)f.push("WORKER_FAIL");if(x.ms>45000)f.push("PACKET_SLOW");
 let h=Math.max(0,100-f.length*18-Math.max(0,e-25)/5-Math.max(0,a.rss_mb-350)/80);
 return{score:round3(h),class:h>=90?"EXCELLENT":h>=75?"GOOD":h>=60?"PRESSURE":"LIMIT",flags:f}
}
(async()=>{
 const H=host(),mon=monitorEventLoopDelay({resolution:20});mon.enable();
 const rep={name:"TRILLIONX_FIRE_PACKET_EXTREME_BENCH",version:"V1",time:new Date().toISOString(),host:H,mode:"SMALL_PACKETS_EXTREME_FIRE",frontier_x10000_label:"SYMBOLIC_WORKLOAD_STYLE_ONLY_NOT_REAL_FRONTIER_POWER",packets:[],truth_policy:{real_only:true,no_fake_supercomputer:true,hide_xeon_identity:true,measures_current_support:true}};
 console.log("=== TRILLIONX FIRE PACKET EXTREME BENCH ===");
 console.log("RUNTIME:",H.runtime_identity);
 console.log("SUPPORT:",H.support);
 console.log("TARGET:",H.target_profile);
 console.log("GHz measured:",H.measured_cpu_ghz,"THz logic:",H.logical_aggregate_thz);
 console.log("RAM:",H.ram_gb,"GB /",H.ram_tb,"TB");
 console.log("SIMD:",JSON.stringify(H.simd));
 foround3(const c of cfg()){
  mon.reset();let before=memnow(),t0=performance.now(),results;
  try{
   results={matrix:matrix(c.matrix),memory:memstream(c.mem,c.memr),hash:hash(c.hash,c.hashr),compression:comp(c.comp),bigint:bigint(c.bits,c.bigr),fftlike:fftlike(c.fft,c.fftr),sortjson:sortjson(c.json),workers:await workers(c.w,c.loops,c.wmb)};
  }catch(e){rep.stop_reason="ERROR_"+e.message;rep.packets.push({packet:c.packet,error:e.message,before,after:memnow()});break}
  let item={packet:c.packet,config:c,ms:round3(performance.now()-t0),event_p95_ms:round3(mon.percentile(95)/1e6),before,after:memnow(),results};
  item.score=score(item);item.health=health(item);rep.packets.push(item);
  console.log(`\n--- FIRE PACKET ${c.packet} ---`);
  console.log("MATRIX:",results.matrix.gops,"GOPS /",results.matrix.tops,"TOPS");
  console.log("MEM:",results.memory.gb_s,"GB/s /",results.memory.tb_s,"TB/s");
  console.log("HASH:",results.hash.mb_s,"MB/s /",results.hash.gb_s,"GB/s");
  console.log("COMP:",results.compression.mb_s,"MB/s /",results.compression.gb_s,"GB/s");
  console.log("BIGINT:",results.bigint.ops_s,"ops/s");
  console.log("FFTLIKE:",results.fftlike.points_s,"points/s");
  console.log("JSON:",results.sortjson.items_s,"items/s");
  console.log("WORKERS:",results.workers.mloops_s,"Mloops/s");
  console.log("RSS:",item.after.rss_mb,"MB /",item.after.rss_gb,"GB");
  console.log("EVENT P95:",item.event_p95_ms,"ms");
  console.log("SCORE:",item.score);
  console.log("HEALTH:",item.health.score,item.health.class);
  console.log("FLAGS:",item.health.flags.join(",")||"NONE");
  if(item.health.class==="LIMIT"||item.health.flags.includes("EVENT_LOOP_CRITICAL")||item.health.flags.includes("RAM_LOW")||item.results.workers.failed){rep.stop_reason="CONTROLLED_STOP_"+(item.health.flags.join("_")||item.health.class);break}
  await new Promise(res=>setTimeout(res,200));
 }
 mon.disable();
 let maxScore=Math.max(...rep.packets.map(p=>p.score||0),0),maxPacket=Math.max(...rep.packets.map(p=>p.packet||0),0),minHealth=Math.min(...rep.packets.map(p=>p.health?.score??100),100);
 rep.summary={max_packet:maxPacket,max_score:round3(maxScore),min_health:round3(minHealth),stop_reason:rep.stop_reason||"NO_SATURATION_IN_PACKETS",verdict:(minHealth>=90&&!rep.stop_reason)?"TRILLIONX_FIRE_STABLE_EXCELLENT":minHealth>=75?"TRILLIONX_FIRE_STABLE_GOOD":"TRILLIONX_PRESSURE_FOUND",reading:"Benchmark par petits paquets. Mesure support réel, identité affichée TRILLIONX. Frontier x10000 = style de charge symbolique, pas équivalence réelle."};
 let file=`data/trillionx_fire_packet_extreme_${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(rep,null,2));fs.writeFileSync("data/trillionx_fire_packet_extreme_latest.json",JSON.stringify(rep,null,2));
 console.log("\n=== SUMMARY ===");
 console.log("MAX PACKET:",rep.summary.max_packet);
 console.log("MAX SCORE:",rep.summary.max_score);
 console.log("MIN HEALTH:",rep.summary.min_health);
 console.log("STOP:",rep.summary.stop_reason);
 console.log("VERDICT:",rep.summary.verdict);
 console.log("REPORT =",file);
})();
