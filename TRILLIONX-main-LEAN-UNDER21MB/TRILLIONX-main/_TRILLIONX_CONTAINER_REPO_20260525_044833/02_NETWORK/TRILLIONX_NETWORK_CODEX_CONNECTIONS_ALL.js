const fs=require("fs"),os=require("os"),cp=require("child_process"),http=require("http"),https=require("https"),dns=require("dns").promises;
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const TIMEOUT=Number(process.argv[2]||3500);
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=(c,t=5000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch{return""}};

const NETWORK_CODEX={
  layer2:["ethernet","wifi_catalog","loopback","vlan_catalog","bridge_catalog"],
  layer3:["IPv4","IPv6","ICMP","ICMPv6","IGMP","GRE","ESP","AH"],
  layer4:["TCP","UDP","SCTP","UDPLite"],
  app:["HTTP","HTTPS","WebSocket","Socket.io","SSE","REST","RPC","gRPC_catalog","DNS","NTP","SSH","Git","NPM"],
  crypto:["TLS","OpenSSL","AES","SHA","HMAC","ECDH_catalog","RSA_catalog"],
  btc_crypto:["Bitcoin_RPC_catalog","mempool_public_api","blockstream_public_api","blockchain_public_api","UTXO_index_catalog","SHA256d"],
  satellite:["SCPS","CCSDS_TM_TC","DVB-S","DVB-S2","DVB-S2X","GNSS","NTP_sat_time","PTP_IEEE1588","Starlink_like_IP_backhaul_catalog"],
  truth:"Catalog + passive detection. No fake satellite link, no external port scan."
};

function interfaces(){
  const out=[];
  for(const [name,arr] of Object.entries(os.networkInterfaces())){
    for(const x of arr||[])out.push({name,family:x.family,address:x.address,internal:x.internal,cidr:x.cidr,mac:x.mac,netmask:x.netmask});
  }
  return out;
}
function request(url){
  return new Promise(res=>{
    const lib=url.startsWith("https")?https:http,t0=performance.now();
    const q=lib.get(url,{timeout:TIMEOUT,headers:{"user-agent":"TRILLIONX-network-codex"}},rsp=>{
      let n=0;
      rsp.on("data",d=>{n+=d.length;if(n>256000)q.destroy()});
      rsp.on("end",()=>res({url,ok:rsp.statusCode<500,status:rsp.statusCode,ms:r(performance.now()-t0),bytes:n}));
    });
    q.on("timeout",()=>{q.destroy();res({url,ok:false,status:0,ms:r(performance.now()-t0),error:"timeout"})});
    q.on("error",e=>res({url,ok:false,status:0,ms:r(performance.now()-t0),error:e.code||e.message}));
  });
}
function parsePorts(raw){
  const ports=[];
  for(const line of raw.split("\n").filter(Boolean)){
    let m=line.match(/(?:LISTEN|UNCONN).*?[:.]([0-9]{2,5})\b/) || line.match(/[:.]([0-9]{2,5})\s/);
    if(m)ports.push({port:Number(m[1]),line});
  }
  return [...new Map(ports.filter(x=>x.port).map(x=>[x.port,x])).values()].sort((a,b)=>a.port-b.port);
}
function runtimeNetwork(){
  const listening=sh("ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || lsof -i -P -n 2>/dev/null",7000);
  const active=sh("ss -tunap 2>/dev/null | head -250 || netstat -tunap 2>/dev/null | head -250 || lsof -i -P -n 2>/dev/null | head -250",7000);
  return {
    ip_addr:sh("ip addr 2>/dev/null || ifconfig 2>/dev/null",7000),
    ip_route:sh("ip route 2>/dev/null || route -n 2>/dev/null",4000),
    resolv_conf:fs.existsSync("/etc/resolv.conf")?fs.readFileSync("/etc/resolv.conf","utf8").slice(0,2000):"",
    hosts_file:fs.existsSync("/etc/hosts")?fs.readFileSync("/etc/hosts","utf8").slice(0,2000):"",
    listening_raw:listening.split("\n").slice(0,250),
    active_raw:active.split("\n").slice(0,250),
    listening_ports:parsePorts(listening)
  };
}
function repoScan(){
  const files=[],routes=[],apis=[],sockets=[],urls=[],ports=[],networkMentions={};
  const words=["tcp","udp","http","https","websocket","socket.io","dns","btc","bitcoin","mempool","blockstream","satellite","scps","ccsds","starlink","ntp","ptp","grpc","rpc","port","network"];
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
    re=/\/api\/[A-Za-z0-9_\-./:]+/g;while((m=re.exec(s)))apis.push({api:m[0],file:f});
    re=/(io|socket|ws|server)\.(on|emit)\s*\(\s*['"`]([^'"`]+)/g;while((m=re.exec(s)))sockets.push({obj:m[1],op:m[2],event:m[3],file:f});
    re=/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g;while((m=re.exec(s)))urls.push({url:m[0].slice(0,220),file:f});
    re=/\b(PORT|port)\b\s*[:=]\s*([0-9]{2,5})|\blisten\s*\(\s*([0-9]{2,5})/g;while((m=re.exec(s)))ports.push({port:Number(m[2]||m[3]),file:f,match:m[0]});
    const low=s.toLowerCase();
    for(const w of words)if(low.includes(w))networkMentions[w]=(networkMentions[w]||0)+1;
  }
  const apiRoots={}; for(const a of apis){const k=a.api.split("/").slice(0,3).join("/");apiRoots[k]=(apiRoots[k]||0)+1}
  const urlHosts={}; for(const u of urls){try{const h=new URL(u.url).hostname;urlHosts[h]=(urlHosts[h]||0)+1}catch{}}
  return {
    files:files.length,routes:routes.length,api_strings:apis.length,socket_events:sockets.length,urls:urls.length,
    declared_ports:[...new Map(ports.filter(x=>x.port).map(x=>[x.port+"|"+x.file,x])).values()].slice(0,200),
    top_api_roots:Object.entries(apiRoots).sort((a,b)=>b[1]-a[1]).slice(0,60).map(([key,count])=>({key,count})),
    top_url_hosts:Object.entries(urlHosts).sort((a,b)=>b[1]-a[1]).slice(0,60).map(([host,count])=>({host,count})),
    network_mentions:networkMentions,
    sample_routes:routes.slice(0,120),
    sample_sockets:sockets.slice(0,120),
    sample_urls:urls.slice(0,120)
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
async function localProbe(ports){
  const paths=["/","/api/ping","/api/health","/api/full","/api/mobile-health","/api/snapshot-lite","/api/runtime/status","/api/reconnect"];
  const out=[];
  for(const p of ports.slice(0,30))for(const path of paths)out.push(await request(`http://127.0.0.1:${p}${path}`));
  return out;
}
async function externalProbe(){
  const urls=[
    "https://api.github.com",
    "https://registry.npmjs.org",
    "https://mempool.space/api/blocks/tip/height",
    "https://blockstream.info/api/blocks/tip/height",
    "https://blockchain.info/q/getblockcount",
    "https://cloudflare.com/cdn-cgi/trace"
  ];
  const out=[]; for(const u of urls)out.push(await request(u)); return out;
}
(async()=>{
  console.log("=== TRILLIONX NETWORK CODEX CONNECTIONS ALL ===");
  const net=runtimeNetwork(), repo=repoScan(), ifs=interfaces();
  const declared=repo.declared_ports.map(x=>x.port).filter(Boolean);
  const listening=net.listening_ports.map(x=>x.port);
  const ports=[...new Set([3000,8080,8000,5000,5173,...declared,...listening])].filter(Boolean).sort((a,b)=>a-b);
  const dns=await dnsProbe();
  const local=await localProbe(ports);
  const external=await externalProbe();
  const okLocal=local.filter(x=>x.ok).length, okDns=dns.filter(x=>x.ok).length, okExt=external.filter(x=>x.ok).length;
  const lat=[...local,...external].filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
  const p50=lat.length?lat[Math.floor(lat.length*.5)]:null, p95=lat.length?lat[Math.floor(lat.length*.95)]||lat.at(-1):null;
  let health=100-(local.length-okLocal)*1.5-(dns.length-okDns)*3-(external.length-okExt)*4;
  if(p95&&p95>1500)health-=10;
  if(!ports.includes(3000))health-=15;
  health=Math.max(0,r(health));
  const report={
    engine:"TRILLIONX_NETWORK_CODEX_CONNECTIONS_ALL",
    ts:new Date().toISOString(),
    policy:{target:"TRILLIONX",host:"CODESPACES_SUPPORT_ONLY",auto_detect_all_connections:true,network_codex:true,passive_public_probe_only:true,no_external_port_scan:true,real_only:true},
    network_codex:NETWORK_CODEX,
    system:{node:process.version,platform:os.platform(),arch:os.arch(),hostname:os.hostname(),cpus:os.cpus().length,ram_gb:r(os.totalmem()/2**30),free_gb:r(os.freemem()/2**30)},
    interfaces:ifs,
    runtime_network:net,
    repo_network_surface:repo,
    detected_ports:ports,
    local_port_probes:local,
    dns,
    external_public_probes:external,
    summary:{
      interfaces:ifs.length,
      ports_detected:ports.length,
      listening_ports:listening,
      repo_routes:repo.routes,
      repo_api_strings:repo.api_strings,
      repo_socket_events:repo.socket_events,
      local_ok:`${okLocal}/${local.length}`,
      dns_ok:`${okDns}/${dns.length}`,
      external_ok:`${okExt}/${external.length}`,
      p50_ms:p50,p95_ms:p95,health,
      verdict:health>=85?"NETWORK_CODEX_CONNECTIONS_GOOD":health>=65?"NETWORK_CODEX_CONNECTIONS_PARTIAL":"NETWORK_CODEX_CONNECTIONS_REVIEW"
    },
    truth_policy:{no_fake_satellite:true,no_fake_external_network:true,catalog_is_not_physical_link:true}
  };
  const file=`data/trillionx_network_codex_connections_all_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_network_codex_connections_all_latest.json",JSON.stringify(report,null,2));
  console.log("CODEX LAYERS:",Object.keys(NETWORK_CODEX).filter(k=>Array.isArray(NETWORK_CODEX[k])).join(","));
  console.log("INTERFACES:",ifs.length);
  console.log("PORTS:",ports.join(",")||"none");
  console.log("REPO ROUTES:",repo.routes,"API:",repo.api_strings,"SOCKETS:",repo.socket_events);
  console.log("LOCAL:",report.summary.local_ok,"DNS:",report.summary.dns_ok,"EXTERNAL:",report.summary.external_ok);
  console.log("P50:",p50,"P95:",p95,"HEALTH:",health);
  console.log("VERDICT:",report.summary.verdict);
  console.log("REPORT =",file);
})();
