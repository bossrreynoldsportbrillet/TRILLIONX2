const fs=require("fs"),os=require("os"),cp=require("child_process"),http=require("http"),https=require("https"),dns=require("dns").promises;
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=(c,t=4000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch{return""}};
const sleep=ms=>new Promise(a=>setTimeout(a,ms));
const req=url=>new Promise(res=>{
 const lib=url.startsWith("https")?https:http,t0=performance.now();
 const q=lib.get(url,{timeout:3500,headers:{"user-agent":"TRILLIONX-network-port-autodetect"}},r0=>{
  let n=0;r0.on("data",d=>{n+=d.length;if(n>256000)q.destroy()});
  r0.on("end",()=>res({url,ok:r0.statusCode<500,status:r0.statusCode,ms:r(performance.now()-t0),bytes:n}));
 });
 q.on("timeout",()=>{q.destroy();res({url,ok:false,status:0,ms:r(performance.now()-t0),error:"timeout"})});
 q.on("error",e=>res({url,ok:false,status:0,ms:r(performance.now()-t0),error:e.code||e.message}));
});
function netIf(){
 const n=os.networkInterfaces(),out=[];
 for(const [name,a] of Object.entries(n))for(const x of a||[])out.push({name,family:x.family,address:x.address,internal:x.internal,mac:x.mac,cidr:x.cidr});
 return out;
}
function listening(){
 const raw=sh("ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || lsof -i -P -n 2>/dev/null",6000);
 const lines=raw.split("\n").filter(Boolean);
 const ports=[];
 for(const line of lines){
  const m=line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::1|\*):([0-9]+)/)||line.match(/:([0-9]+)\s/);
  if(m)ports.push({port:Number(m[1]),line});
 }
 return {raw:lines.slice(0,200),ports:[...new Map(ports.map(x=>[x.port,x])).values()].sort((a,b)=>a.port-b.port)};
}
function repoScan(){
 const routes=[],api=[],ports=[],files=[];
 function walk(d,depth=0){
  if(depth>5)return;
  let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return}
  for(const e of ents){
   if([".git","node_modules","_TRILLIONX_SNAPSHOT_KEEP"].includes(e.name))continue;
   const p=d+"/"+e.name;
   if(e.isDirectory())walk(p,depth+1);
   else if(/\.(js|json|html|md|txt|sh|env)$/i.test(e.name))files.push(p);
  }
 }
 walk(".");
 for(const f of files){
  let s="";try{s=fs.readFileSync(f,"utf8").slice(0,1200000)}catch{}
  let m,re=/app\.(get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)/g;
  while((m=re.exec(s)))routes.push({method:m[1].toUpperCase(),route:m[2],file:f});
  re=/\/api\/[A-Za-z0-9_\-./:]+/g;while((m=re.exec(s)))api.push({api:m[0],file:f});
  re=/(PORT|port)\s*[:=]\s*process\.env\.PORT|listen\s*\(\s*([0-9]+)|PORT\s*=\s*([0-9]+)/g;
  while((m=re.exec(s)))ports.push({file:f,match:m[0],port:Number(m[2]||m[3]||0)||null});
 }
 const roots={};for(const x of api){const k=x.api.split("/").slice(0,3).join("/");roots[k]=(roots[k]||0)+1}
 return {files:files.length,routes:routes.length,api_strings:api.length,declared_ports:ports.filter(x=>x.port),top_api_roots:Object.entries(roots).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([key,count])=>({key,count})),sample_routes:routes.slice(0,120)};
}
async function probeLocalPorts(ports){
 const out=[];
 for(const p of ports){
  for(const path of ["/","/api/ping","/api/health","/api/mobile-health","/api/snapshot-lite"]){
   out.push(await req(`http://127.0.0.1:${p}${path}`));
  }
 }
 return out;
}
async function dnsProbe(){
 const hosts=["github.com","api.github.com","mempool.space","blockstream.info","blockchain.info","cloudflare.com","google.com","npmjs.com"];
 const out=[];
 for(const h of hosts){
  const t=performance.now();
  try{const a=await dns.lookup(h);out.push({host:h,ok:true,ms:r(performance.now()-t),address:a.address,family:a.family})}
  catch(e){out.push({host:h,ok:false,ms:r(performance.now()-t),error:e.code||e.message})}
 }
 return out;
}
(async()=>{
 console.log("=== TRILLIONX NETWORK + PORTS TOTAL AUTODETECT ===");
 const interfaces=netIf(), listen=listening(), repo=repoScan();
 const detectedPorts=[...new Set([3000,8080,5173,8000,5000,...listen.ports.map(x=>x.port),...repo.declared_ports.map(x=>x.port).filter(Boolean)])].filter(Boolean).sort((a,b)=>a-b);
 const local=await probeLocalPorts(detectedPorts.slice(0,20));
 const dns=await dnsProbe();
 const external=[];
 for(const u of ["https://api.github.com","https://mempool.space/api/blocks/tip/height","https://blockstream.info/api/blocks/tip/height","https://blockchain.info/q/getblockcount","https://cloudflare.com/cdn-cgi/trace"]) external.push(await req(u));
 const okLocal=local.filter(x=>x.ok).length, okDns=dns.filter(x=>x.ok).length, okExt=external.filter(x=>x.ok).length;
 const lat=[...local,...external].filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 const p50=lat.length?lat[Math.floor(lat.length*.5)]:null, p95=lat.length?lat[Math.floor(lat.length*.95)]||lat.at(-1):null;
 const health=Math.max(0,100-(local.length-okLocal)*2-(dns.length-okDns)*3-(external.length-okExt)*5-(p95&&p95>1800?10:0));
 const report={
  engine:"TRILLIONX_NETWORK_PORTS_TOTAL_AUTODETECT",
  ts:new Date().toISOString(),
  policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",auto_detect_networks:true,auto_detect_ports:true,passive_public_probe_only:true,no_external_port_scan:true,real_only:true},
  system:{node:process.version,platform:os.platform(),arch:os.arch(),hostname:os.hostname(),cpus:os.cpus().length,ram_gb:r(os.totalmem()/2**30)},
  interfaces,
  ip_route:sh("ip route 2>/dev/null || route -n 2>/dev/null"),
  listening:listen,
  repo,
  detected_ports:detectedPorts,
  local_port_probes:local,
  dns,
  external_public_probes:external,
  summary:{ports_detected:detectedPorts.length,local_ok:`${okLocal}/${local.length}`,dns_ok:`${okDns}/${dns.length}`,external_ok:`${okExt}/${external.length}`,p50_ms:p50,p95_ms:p95,health:r(health),verdict:health>=85?"NETWORK_PORT_AUTODETECT_GOOD":health>=65?"NETWORK_PORT_AUTODETECT_PARTIAL":"NETWORK_PORT_AUTODETECT_REVIEW"}
 };
 const f=`data/trillionx_network_ports_total_autodetect_${Date.now()}.json`;
 fs.writeFileSync(f,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_network_ports_total_autodetect_latest.json",JSON.stringify(report,null,2));
 console.log("INTERFACES:",interfaces.length);
 console.log("LISTEN PORTS:",listen.ports.map(x=>x.port).join(",")||"none");
 console.log("DETECTED PORTS:",detectedPorts.join(","));
 console.log("REPO ROUTES:",repo.routes,"API_STRINGS:",repo.api_strings);
 console.log("LOCAL:",report.summary.local_ok,"DNS:",report.summary.dns_ok,"EXTERNAL:",report.summary.external_ok);
 console.log("P50:",p50,"P95:",p95,"HEALTH:",report.summary.health);
 console.log("VERDICT:",report.summary.verdict);
 console.log("REPORT =",f);
})();
