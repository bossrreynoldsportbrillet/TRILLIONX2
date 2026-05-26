const fs=require("fs"),os=require("os"),http=require("http"),https=require("https"),dns=require("dns").promises,cp=require("child_process");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});
const TARGET="TRILLIONX_NETWORK_RUNTIME";
const MODE=process.argv[2]||"world";
const TIMEOUT=Number(process.argv[3]||3500);
const CONCURRENCY=Number(process.argv[4]||8);
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=c=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2500}).trim()}catch{return""}};
function read(p){try{return fs.readFileSync(p,"utf8")}catch{return""}}

function request(url){
 return new Promise(res=>{
  const t=performance.now(), lib=url.startsWith("https")?https:http;
  const req=lib.get(url,{timeout:TIMEOUT,headers:{"user-agent":"TRILLIONX-network-bench"}},rsp=>{
   let n=0; rsp.on("data",d=>{n+=d.length;if(n>256000)req.destroy()});
   rsp.on("end",()=>res({url,ok:rsp.statusCode<500,status:rsp.statusCode,ms:r(performance.now()-t),bytes:n}));
  });
  req.on("timeout",()=>{req.destroy();res({url,ok:false,status:0,ms:r(performance.now()-t),error:"timeout"})});
  req.on("error",e=>res({url,ok:false,status:0,ms:r(performance.now()-t),error:e.code||e.message}));
 });
}

async function parallel(items, fn, limit){
 const out=new Array(items.length); let i=0;
 async function worker(){ while(i<items.length){ const k=i++; out[k]=await fn(items[k]); } }
 await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
 return out;
}

async function dnsProbe(hosts){
 return parallel(hosts, async h=>{
  const t=performance.now();
  try{const a=await dns.lookup(h);return {host:h,ok:true,ms:r(performance.now()-t),address:a.address,family:a.family}}
  catch(e){return {host:h,ok:false,ms:r(performance.now()-t),error:e.code||e.message}}
 }, CONCURRENCY);
}

function interfaces(){
 const n=os.networkInterfaces(), out=[];
 for(const [name,arr] of Object.entries(n)) for(const x of arr||[]) out.push({name,family:x.family,address:x.address,internal:x.internal,mac:x.mac,cidr:x.cidr});
 return out;
}

function repoApiScan(){
 const files=[];
 function walk(d,depth=0){
  if(depth>4)return;
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
   if([".git","node_modules","_TRILLIONX_SNAPSHOT_KEEP"].includes(e.name))continue;
   const p=d+"/"+e.name;
   if(e.isDirectory())walk(p,depth+1);
   else if(/\.(js|json|txt|md|html)$/i.test(e.name))files.push(p);
  }
 }
 walk(".");
 const routes=[], apiStrings=[], sockets=[];
 for(const f of files){
  let s=read(f); if(s.length>800000)s=s.slice(0,800000);
  let m, re=/app\.(get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)/g;
  while((m=re.exec(s)))routes.push({method:m[1].toUpperCase(),route:m[2],file:f});
  re=/\/api\/[A-Za-z0-9_\-./:]+/g; while((m=re.exec(s)))apiStrings.push({api:m[0],file:f});
  re=/(io|socket|ws)\.(on|emit)\s*\(\s*['"`]([^'"`]+)/g; while((m=re.exec(s)))sockets.push({obj:m[1],op:m[2],event:m[3],file:f});
 }
 const rootCount={}; for(const a of apiStrings){const k=a.api.split("/").slice(0,3).join("/");rootCount[k]=(rootCount[k]||0)+1}
 return {files:files.length,routes:routes.length,api_strings:apiStrings.length,sockets:sockets.length,
   top_api_roots:Object.entries(rootCount).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([key,count])=>({key,count})),
   sample_routes:routes.slice(0,80), sample_sockets:sockets.slice(0,80)};
}

async function localApiProbe(){
 const paths=["/","/api/ping","/api/full","/api/health","/api/runtime/status","/api/reconnect","/api/ai-chat","/api/hardware/9000vw","/api/mobile-health","/api/snapshot-lite"];
 return parallel(paths, p=>request("http://127.0.0.1:3000"+p), CONCURRENCY);
}

// ~15 DNS hosts (passive resolution only)
const DNS_HOSTS=[
 "github.com","api.github.com","gitlab.com","codeberg.org",
 "mempool.space","blockstream.info","blockchain.info","blockchair.com",
 "api.coingecko.com","api.coincap.io",
 "registry.npmjs.org","pypi.org","crates.io",
 "cloudflare.com","one.one.one.one","dns.google",
 "huggingface.co","anthropic.com","docs.anthropic.com"
];

// ~50 public passive endpoints (no auth, read-only)
const PUBLIC_URLS=[
 // Blockchain / Bitcoin (10)
 "https://mempool.space/api/blocks/tip/height",
 "https://mempool.space/api/v1/fees/recommended",
 "https://mempool.space/api/v1/difficulty-adjustment",
 "https://blockstream.info/api/blocks/tip/height",
 "https://blockstream.info/api/fee-estimates",
 "https://blockchain.info/q/getblockcount",
 "https://blockchain.info/q/hashrate",
 "https://blockchain.info/ticker",
 "https://api.blockchair.com/bitcoin/stats",
 "https://api.blockchair.com/ethereum/stats",
 // Crypto markets (8)
 "https://api.coingecko.com/api/v3/ping",
 "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,monero&vs_currencies=usd,eur",
 "https://api.coingecko.com/api/v3/global",
 "https://api.coincap.io/v2/assets/bitcoin",
 "https://api.coincap.io/v2/assets/ethereum",
 "https://api.kraken.com/0/public/Time",
 "https://api.kraken.com/0/public/SystemStatus",
 "https://www.bitstamp.net/api/v2/ticker/btcusd/",
 // Code hosting (6)
 "https://api.github.com",
 "https://api.github.com/zen",
 "https://api.github.com/rate_limit",
 "https://api.github.com/meta",
 "https://gitlab.com/api/v4/version",
 "https://codeberg.org/api/v1/version",
 // Package registries (5)
 "https://registry.npmjs.org/-/ping?write=true",
 "https://registry.npmjs.org/express",
 "https://pypi.org/pypi/pip/json",
 "https://crates.io/api/v1/summary",
 "https://rubygems.org/api/v1/versions/rails.json",
 // Network / CDN / DNS-over-HTTPS (7)
 "https://cloudflare.com/cdn-cgi/trace",
 "https://1.1.1.1/cdn-cgi/trace",
 "https://cloudflare-dns.com/dns-query?name=example.com&type=A",
 "https://dns.google/resolve?name=example.com&type=A",
 "https://api.ipify.org?format=json",
 "https://ipapi.co/json/",
 "https://httpbin.org/get",
 // Time / Reference (4)
 "https://worldtimeapi.org/api/timezone/Europe/Paris",
 "https://worldtimeapi.org/api/ip",
 "https://en.wikipedia.org/api/rest_v1/page/summary/Bitcoin",
 "https://api.publicapis.org/entries",
 // AI / HuggingFace / Anthropic public (4)
 "https://huggingface.co/api/models?limit=1",
 "https://huggingface.co/api/datasets?limit=1",
 "https://docs.anthropic.com/",
 "https://www.anthropic.com/",
 // Status pages (6)
 "https://www.githubstatus.com/api/v2/status.json",
 "https://www.cloudflarestatus.com/api/v2/status.json",
 "https://status.npmjs.org/api/v2/status.json",
 "https://status.openai.com/api/v2/status.json",
 "https://status.anthropic.com/api/v2/status.json",
 "https://status.python.org/api/v2/status.json"
];

async function main(){
 console.log("=== TRILLIONX WORLD NETWORK AUTODETECT BENCH ===");
 console.log("TARGET:",TARGET,"MODE:",MODE,"TIMEOUT:",TIMEOUT,"CONCURRENCY:",CONCURRENCY);
 console.log("DNS_HOSTS:",DNS_HOSTS.length,"PUBLIC_URLS:",PUBLIC_URLS.length);

 const repo=repoApiScan();
 const netIf=interfaces();
 const local=await localApiProbe();
 const dnsr=await dnsProbe(DNS_HOSTS);
 const ext=await parallel(PUBLIC_URLS, request, CONCURRENCY);

 const okLocal=local.filter(x=>x.ok).length;
 const okExt=ext.filter(x=>x.ok).length;
 const okDns=dnsr.filter(x=>x.ok).length;
 const lat=[...local,...ext].filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 const p50=lat.length?lat[Math.floor(lat.length*.5)]:null;
 const p95=lat.length?lat[Math.floor(lat.length*.95)]||lat.at(-1):null;

 const extPct=ext.length?okExt/ext.length:0;
 const dnsPct=dnsr.length?okDns/dnsr.length:0;
 const health=r(Math.max(0, Math.min(100,
   60*extPct + 25*dnsPct + 15*(okLocal/Math.max(1,local.length)) - (p95&&p95>2000?10:0)
 )));

 const byCategory={};
 for(const e of ext){
  const host=new URL(e.url).hostname;
  byCategory[host]=byCategory[host]||{ok:0,fail:0,avg_ms:0,n:0};
  const b=byCategory[host];
  if(e.ok){b.ok++} else {b.fail++}
  b.n++; b.avg_ms=r(((b.avg_ms*(b.n-1))+e.ms)/b.n);
 }

 const report={
  engine:"TRILLIONX_WORLD_NETWORK_AUTODETECT_BENCH",
  version:"2.0-50nets",
  ts:new Date().toISOString(),
  policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",real_only:true,
    passive_public_network_only:true,no_port_attack:true,no_fake_world_network:true,
    no_auth_endpoints:true,read_only:true},
  config:{dns_hosts:DNS_HOSTS.length,public_urls:PUBLIC_URLS.length,timeout_ms:TIMEOUT,concurrency:CONCURRENCY},
  system:{node:process.version,platform:os.platform(),arch:os.arch(),hostname:os.hostname(),
    cpus:os.cpus().length,ram_gb:r(os.totalmem()/(2**30))},
  network:{interfaces:netIf,
    ip_route:sh("ip route 2>/dev/null || route -n 2>/dev/null"),
    listening:sh("ss -lntup 2>/dev/null | head -80 || netstat -lntup 2>/dev/null | head -80")},
  repo, local_api:local, dns:dnsr, external_public:ext,
  by_host:byCategory,
  summary:{
    local_ok:`${okLocal}/${local.length}`,
    dns_ok:`${okDns}/${dnsr.length}`,
    external_ok:`${okExt}/${ext.length}`,
    p50_ms:p50, p95_ms:p95, health,
    verdict: health>=85?"NETWORK_WORLD_DETECTION_GOOD"
           : health>=65?"NETWORK_PARTIAL_BUT_USABLE"
           : "NETWORK_REVIEW_NEEDED",
    reading:"Mesure la portée réseau de TRILLIONX et la surface API du repo. Codespaces est uniquement le porteur ; les endpoints publics sont des sondes passives."
  }
 };

 const file=`data/trillionx_world_network_autodetect_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_world_network_autodetect_latest.json",JSON.stringify(report,null,2));
 console.log("REPO ROUTES:",repo.routes,"API_STRINGS:",repo.api_strings,"SOCKETS:",repo.sockets);
 console.log("LOCAL:",report.summary.local_ok,"DNS:",report.summary.dns_ok,"EXTERNAL:",report.summary.external_ok);
 console.log("P50:",p50,"ms P95:",p95,"ms HEALTH:",health);
 console.log("VERDICT:",report.summary.verdict);
 console.log("REPORT =",file);
}
main().catch(e=>{console.error(e);process.exit(1)});
