const fs=require("fs"),os=require("os"),cp=require("child_process"),http=require("http"),https=require("https"),dns=require("dns").promises;
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const MODE=process.argv[2]||"full";
const ROUNDS=Math.max(2,Math.min(Number(process.argv[3]||6),20));
const CONC=Math.max(1,Math.min(Number(process.argv[4]||16),80));
const TIMEOUT=Math.max(800,Math.min(Number(process.argv[5]||3500),10000));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=(c,t=5000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch{return""}};
const sleep=ms=>new Promise(a=>setTimeout(a,ms));

function req(url){
 return new Promise(res=>{
  const lib=url.startsWith("https")?https:http,t0=performance.now();
  const q=lib.get(url,{timeout:TIMEOUT,headers:{"user-agent":"TRILLIONX-network-full-auto-bench"}},rsp=>{
   let n=0;
   rsp.on("data",d=>{n+=d.length;if(n>512000)q.destroy()});
   rsp.on("end",()=>res({url,ok:rsp.statusCode<500,status:rsp.statusCode,ms:r(performance.now()-t0),bytes:n}));
  });
  q.on("timeout",()=>{q.destroy();res({url,ok:false,status:0,ms:r(performance.now()-t0),bytes:0,error:"timeout"})});
  q.on("error",e=>res({url,ok:false,status:0,ms:r(performance.now()-t0),bytes:0,error:e.code||e.message}));
 });
}

function interfaces(){
 const out=[];
 for(const [name,arr] of Object.entries(os.networkInterfaces())){
  for(const x of arr||[])out.push({name,family:x.family,address:x.address,internal:x.internal,cidr:x.cidr,mac:x.mac});
 }
 return out;
}

function parsePorts(raw){
 const out=[];
 for(const line of raw.split("\n").filter(Boolean)){
  let m=line.match(/(?:LISTEN|UNCONN).*?[:.]([0-9]{2,5})\b/)||line.match(/[:.]([0-9]{2,5})\s/);
  if(m)out.push({port:Number(m[1]),line});
 }
 return [...new Map(out.filter(x=>x.port).map(x=>[x.port,x])).values()].sort((a,b)=>a.port-b.port);
}

function runtimeNet(){
 const listening=sh("ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || lsof -i -P -n 2>/dev/null",7000);
 const active=sh("ss -tunap 2>/dev/null | head -300 || netstat -tunap 2>/dev/null | head -300 || lsof -i -P -n 2>/dev/null | head -300",7000);
 return {
  ip_addr:sh("ip addr 2>/dev/null || ifconfig 2>/dev/null",7000),
  ip_route:sh("ip route 2>/dev/null || route -n 2>/dev/null",4000),
  resolv_conf:fs.existsSync("/etc/resolv.conf")?fs.readFileSync("/etc/resolv.conf","utf8").slice(0,2000):"",
  listening_raw:listening.split("\n").slice(0,250),
  active_raw:active.split("\n").slice(0,300),
  listening_ports:parsePorts(listening)
 };
}

function repoScan(){
 const files=[],routes=[],api=[],sockets=[],urls=[],ports=[];
 function walk(d,depth=0){
  if(depth>6)return;
  let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return}
  for(const e of ents){
   if([".git","node_modules","_TRILLIONX_SNAPSHOT_KEEP","raid60_plus"].includes(e.name))continue;
   const p=d+"/"+e.name;
   if(e.isDirectory())walk(p,depth+1);
   else if(/\.(js|json|html|md|txt|sh|env|yml|yaml)$/i.test(e.name))files.push(p);
  }
 }
 walk(".");
 for(const f of files){
  let s="";try{s=fs.readFileSync(f,"utf8").slice(0,1200000)}catch{}
  let m,re=/\b(app|router)\.(get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)/g;
  while((m=re.exec(s)))routes.push({kind:m[1],method:m[2].toUpperCase(),route:m[3],file:f});
  re=/\/api\/[A-Za-z0-9_\-./:]+/g;while((m=re.exec(s)))api.push({api:m[0],file:f});
  re=/(io|socket|ws|server)\.(on|emit)\s*\(\s*['"`]([^'"`]+)/g;while((m=re.exec(s)))sockets.push({obj:m[1],op:m[2],event:m[3],file:f});
  re=/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g;while((m=re.exec(s)))urls.push({url:m[0].slice(0,220),file:f});
  re=/\b(PORT|port)\b\s*[:=]\s*([0-9]{2,5})|\blisten\s*\(\s*([0-9]{2,5})/g;while((m=re.exec(s)))ports.push({port:Number(m[2]||m[3]),file:f,match:m[0]});
 }
 const apiRoots={};for(const a of api){const k=a.api.split("/").slice(0,3).join("/");apiRoots[k]=(apiRoots[k]||0)+1}
 return {
  files:files.length,routes:routes.length,api_strings:api.length,socket_events:sockets.length,urls:urls.length,
  declared_ports:[...new Map(ports.filter(x=>x.port).map(x=>[x.port+"|"+x.file,x])).values()].slice(0,200),
  top_api_roots:Object.entries(apiRoots).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([key,count])=>({key,count})),
  sample_routes:routes.slice(0,120),
  sample_sockets:sockets.slice(0,120)
 };
}

async function dnsProbe(){
 const hosts=["github.com","api.github.com","registry.npmjs.org","mempool.space","blockstream.info","blockchain.info","cloudflare.com","google.com","time.cloudflare.com"];
 const out=[];
 for(const h of hosts){
  const t0=performance.now();
  try{const a=await dns.lookup(h);out.push({host:h,ok:true,ms:r(performance.now()-t0),address:a.address,family:a.family})}
  catch(e){out.push({host:h,ok:false,ms:r(performance.now()-t0),error:e.code||e.message})}
 }
 return out;
}

function percentile(a,p){
 const b=a.filter(Number.isFinite).sort((x,y)=>x-y);
 if(!b.length)return null;
 return b[Math.min(b.length-1,Math.floor(b.length*p))];
}

async function batch(urls,conc){
 const out=[];
 let i=0;
 async function worker(){
  while(i<urls.length){
   const u=urls[i++];
   out.push(await req(u));
  }
 }
 await Promise.all(Array.from({length:conc},worker));
 return out;
}

async function fullLoad(localUrls,publicUrls){
 const rounds=[];
 for(let round=1;round<=ROUNDS;round++){
  const t0=performance.now();
  const localList=[];
  const publicList=[];
  const localRepeat=MODE==="max"?12:MODE==="full"?8:4;
  const publicRepeat=MODE==="max"?3:MODE==="full"?2:1;

  for(let k=0;k<localRepeat;k++)localList.push(...localUrls);
  for(let k=0;k<publicRepeat;k++)publicList.push(...publicUrls);

  const local=await batch(localList,CONC);
  const pub=await batch(publicList,Math.min(8,CONC));
  const all=[...local,...pub];
  const ok=all.filter(x=>x.ok).length;
  const bytes=all.reduce((a,x)=>a+(x.bytes||0),0);
  const lats=all.map(x=>x.ms).filter(Number.isFinite);
  const ms=performance.now()-t0;
  const row={
   round,
   requests:all.length,
   ok,
   fail:all.length-ok,
   bytes,
   total_ms:r(ms),
   req_s:r(all.length/(ms/1000)),
   mb_s:r((bytes/1048576)/(ms/1000)),
   p50_ms:r(percentile(lats,0.50)),
   p95_ms:r(percentile(lats,0.95)),
   p99_ms:r(percentile(lats,0.99)),
   local_ok:`${local.filter(x=>x.ok).length}/${local.length}`,
   public_ok:`${pub.filter(x=>x.ok).length}/${pub.length}`
  };
  rounds.push(row);
  console.log(`ROUND ${round} | REQ ${row.requests} | OK ${row.ok} | REQ/S ${row.req_s} | MB/S ${row.mb_s} | P95 ${row.p95_ms}ms | LOCAL ${row.local_ok} | PUBLIC ${row.public_ok}`);
  await sleep(250);
 }
 return rounds;
}

(async()=>{
 console.log("=== TRILLIONX NETWORK FULL AUTO BENCH ===");
 console.log("MODE:",MODE,"ROUNDS:",ROUNDS,"CONC:",CONC,"TIMEOUT:",TIMEOUT);

 const ifs=interfaces();
 const net=runtimeNet();
 const repo=repoScan();
 const declared=repo.declared_ports.map(x=>x.port).filter(Boolean);
 const listening=net.listening_ports.map(x=>x.port);
 const ports=[...new Set([3000,8080,8000,5000,5173,...declared,...listening])].filter(Boolean).sort((a,b)=>a-b);

 const paths=["/","/api/ping","/api/health","/api/full","/api/mobile-health","/api/snapshot-lite","/api/runtime/status","/api/reconnect"];
 const localUrls=[];
 for(const p of ports.slice(0,20))for(const path of paths)localUrls.push(`http://127.0.0.1:${p}${path}`);

 const publicUrls=[
  "https://api.github.com",
  "https://registry.npmjs.org",
  "https://mempool.space/api/blocks/tip/height",
  "https://blockstream.info/api/blocks/tip/height",
  "https://blockchain.info/q/getblockcount",
  "https://cloudflare.com/cdn-cgi/trace"
 ];

 const dns=await dnsProbe();
 const load=await fullLoad(localUrls,publicUrls);

 const totalReq=load.reduce((a,x)=>a+x.requests,0);
 const totalOk=load.reduce((a,x)=>a+x.ok,0);
 const totalBytes=load.reduce((a,x)=>a+x.bytes,0);
 const avgReqS=r(load.reduce((a,x)=>a+x.req_s,0)/Math.max(1,load.length));
 const avgMbS=r(load.reduce((a,x)=>a+x.mb_s,0)/Math.max(1,load.length));
 const worstP95=Math.max(...load.map(x=>x.p95_ms||0));
 const dnsOk=dns.filter(x=>x.ok).length;
 let health=100;
 health-=(totalReq-totalOk)*0.5;
 health-=(dns.length-dnsOk)*3;
 if(worstP95>1500)health-=10;
 if(!ports.includes(3000))health-=15;
 health=Math.max(0,r(health));

 const report={
  engine:"TRILLIONX_NETWORK_FULL_AUTO_BENCH",
  ts:new Date().toISOString(),
  policy:{
   target:"TRILLIONX",
   host:"CODESPACES_SUPPORT_ONLY",
   automatic_detection_required:true,
   full_speed_network_bench:true,
   passive_public_probe_only:true,
   no_external_port_scan:true,
   real_only:true
  },
  system:{node:process.version,platform:os.platform(),arch:os.arch(),hostname:os.hostname(),cpus:os.cpus().length,ram_gb:r(os.totalmem()/2**30),free_gb:r(os.freemem()/2**30)},
  autodetect:{
   interfaces:ifs,
   runtime_network:net,
   repo_network_surface:repo,
   detected_ports:ports,
   dns
  },
  bench:{mode:MODE,rounds:ROUNDS,concurrency:CONC,timeout_ms:TIMEOUT,load_rounds:load},
  summary:{
   interfaces:ifs.length,
   ports_detected:ports.length,
   listening_ports:listening,
   repo_routes:repo.routes,
   repo_api_strings:repo.api_strings,
   repo_socket_events:repo.socket_events,
   dns_ok:`${dnsOk}/${dns.length}`,
   total_requests:totalReq,
   total_ok:totalOk,
   total_fail:totalReq-totalOk,
   total_mb:r(totalBytes/1048576),
   avg_req_s:avgReqS,
   avg_mb_s:avgMbS,
   worst_p95_ms:r(worstP95),
   health,
   verdict:health>=85?"NETWORK_FULL_AUTO_BENCH_GOOD":health>=65?"NETWORK_FULL_AUTO_BENCH_PARTIAL":"NETWORK_FULL_AUTO_BENCH_REVIEW"
  }
 };

 const file=`data/trillionx_network_full_auto_bench_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_network_full_auto_bench_latest.json",JSON.stringify(report,null,2));

 console.log("=== SUMMARY ===");
 console.log("PORTS:",ports.join(",")||"none");
 console.log("REPO ROUTES:",repo.routes,"API:",repo.api_strings,"SOCKETS:",repo.socket_events);
 console.log("TOTAL REQ:",totalReq,"OK:",totalOk,"FAIL:",totalReq-totalOk);
 console.log("AVG REQ/S:",avgReqS,"AVG MB/S:",avgMbS,"WORST P95:",r(worstP95));
 console.log("HEALTH:",health);
 console.log("VERDICT:",report.summary.verdict);
 console.log("REPORT =",file);
})();
