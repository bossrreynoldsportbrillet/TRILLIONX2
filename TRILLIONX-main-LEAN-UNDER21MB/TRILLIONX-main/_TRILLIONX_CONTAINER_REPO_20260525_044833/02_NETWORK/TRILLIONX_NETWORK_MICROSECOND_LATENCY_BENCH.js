const fs=require("fs"),os=require("os"),http=require("http"),https=require("https"),dns=require("dns").promises,cp=require("child_process");
const {performance}=require("perf_hooks");
fs.mkdirSync("data",{recursive:true});

const MODE=process.argv[2]||"micro";
const ROUNDS=Math.max(5,Math.min(Number(process.argv[3]||20),200));
const CONC=Math.max(1,Math.min(Number(process.argv[4]||8),64));
const TIMEOUT=Math.max(500,Math.min(Number(process.argv[5]||2500),10000));

const us=ms=>Number.isFinite(ms)?Math.round(ms*1000):0;
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const sh=(c,t=3000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch{return""}};
const sleep=ms=>new Promise(a=>setTimeout(a,ms));

function pct(arr,p){
  const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  return a[Math.min(a.length-1,Math.floor(a.length*p))];
}

function req(url){
  return new Promise(res=>{
    const lib=url.startsWith("https")?https:http;
    const t0=performance.now();
    const q=lib.get(url,{timeout:TIMEOUT,headers:{"user-agent":"TRILLIONX-microsecond-network-bench"}},rsp=>{
      let bytes=0;
      rsp.on("data",d=>{bytes+=d.length;if(bytes>1048576)q.destroy()});
      rsp.on("end",()=>{
        const ms=performance.now()-t0;
        res({url,ok:rsp.statusCode<500,status:rsp.statusCode,ms:r(ms),us:us(ms),bytes});
      });
    });
    q.on("timeout",()=>{q.destroy();const ms=performance.now()-t0;res({url,ok:false,status:0,ms:r(ms),us:us(ms),bytes:0,error:"timeout"})});
    q.on("error",e=>{const ms=performance.now()-t0;res({url,ok:false,status:0,ms:r(ms),us:us(ms),bytes:0,error:e.code||e.message})});
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
    const m=line.match(/(?:LISTEN|UNCONN).*?[:.]([0-9]{2,5})\b/)||line.match(/[:.]([0-9]{2,5})\s/);
    if(m)out.push({port:Number(m[1]),line});
  }
  return [...new Map(out.filter(x=>x.port).map(x=>[x.port,x])).values()].sort((a,b)=>a.port-b.port);
}

function detectPorts(){
  const raw=sh("ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || lsof -i -P -n 2>/dev/null",5000);
  const listening=parsePorts(raw);
  const repoPorts=[];
  function walk(d,depth=0){
    if(depth>4)return;
    let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return}
    for(const e of ents){
      if([".git","node_modules","raid60_plus","_TRILLIONX_SNAPSHOT_KEEP"].includes(e.name))continue;
      const p=d+"/"+e.name;
      if(e.isDirectory())walk(p,depth+1);
      else if(/\.(js|json|sh|env|txt)$/i.test(e.name)){
        let s="";try{s=fs.readFileSync(p,"utf8").slice(0,400000)}catch{}
        let m,re=/\bPORT\s*=\s*([0-9]{2,5})|\blisten\s*\(\s*([0-9]{2,5})/g;
        while((m=re.exec(s)))repoPorts.push(Number(m[1]||m[2]));
      }
    }
  }
  walk(".");
  return {
    raw:raw.split("\n").slice(0,160),
    listening,
    ports:[...new Set([3000,3010,3011,3012,3013,3014,3015,3016,3017,3018,3019,3020,3021,3022,3023,3024,3025,3026,3027,3028,3029,3033,3044,...listening.map(x=>x.port),...repoPorts])].filter(Boolean).sort((a,b)=>a-b)
  };
}

async function dnsBench(){
  const hosts=["localhost","github.com","api.github.com","mempool.space","blockstream.info","cloudflare.com","google.com"];
  const out=[];
  for(const h of hosts){
    const t0=performance.now();
    try{
      const a=await dns.lookup(h);
      const ms=performance.now()-t0;
      out.push({host:h,ok:true,ms:r(ms),us:us(ms),address:a.address,family:a.family});
    }catch(e){
      const ms=performance.now()-t0;
      out.push({host:h,ok:false,ms:r(ms),us:us(ms),error:e.code||e.message});
    }
  }
  return out;
}

async function runBatch(urls,conc){
  const out=[];
  let idx=0;
  async function worker(){
    while(idx<urls.length){
      const u=urls[idx++];
      out.push(await req(u));
    }
  }
  await Promise.all(Array.from({length:conc},worker));
  return out;
}

function startTransferServer(port=3099){
  return new Promise(resolve=>{
    const payload=Buffer.alloc(1024*1024,7);
    const server=http.createServer((req,res)=>{
      if(req.url==="/transfer-1m"){
        res.setHeader("content-type","application/octet-stream");
        res.end(payload);
      }else if(req.url==="/ping"){
        res.end("pong");
      }else{
        res.statusCode=404;res.end("not found");
      }
    });
    server.listen(port,"127.0.0.1",()=>resolve(server));
  });
}

async function transferBench(){
  const server=await startTransferServer(3099);
  const urls=[];
  for(let i=0;i<ROUNDS;i++)urls.push("http://127.0.0.1:3099/transfer-1m");
  const t0=performance.now();
  const out=await runBatch(urls,Math.min(CONC,16));
  const totalMs=performance.now()-t0;
  server.close();
  const bytes=out.reduce((a,b)=>a+(b.bytes||0),0);
  const lats=out.map(x=>x.us);
  return {
    requests:out.length,
    ok:out.filter(x=>x.ok).length,
    bytes,
    mb:r(bytes/1048576),
    total_ms:r(totalMs),
    total_us:us(totalMs),
    mb_s:r((bytes/1048576)/(totalMs/1000)),
    p50_us:pct(lats,0.50),
    p95_us:pct(lats,0.95),
    p99_us:pct(lats,0.99)
  };
}

(async()=>{
  console.log("=== TRILLIONX NETWORK MICROSECOND LATENCY BENCH ===");
  console.log("TARGET=TRILLIONX | HOST=CODESPACES_SUPPORT_ONLY | UNIT=µs");
  console.log("MODE:",MODE,"ROUNDS:",ROUNDS,"CONC:",CONC,"TIMEOUT:",TIMEOUT);

  const portsInfo=detectPorts();
  const ifs=interfaces();
  const dns=await dnsBench();

  const localUrls=[];
  for(const p of portsInfo.ports.slice(0,30)){
    for(const path of ["/","/api/ping","/api/health","/api/mobile-health","/api/snapshot-lite","/health","/vr"]){
      localUrls.push(`http://127.0.0.1:${p}${path}`);
    }
  }

  const publicUrls=[
    "https://api.github.com",
    "https://mempool.space/api/blocks/tip/height",
    "https://blockstream.info/api/blocks/tip/height",
    "https://cloudflare.com/cdn-cgi/trace"
  ];

  const localTest=[];
  for(let i=0;i<ROUNDS;i++)localTest.push(...localUrls.slice(0,Math.min(localUrls.length,40)));
  const publicTest=[];
  for(let i=0;i<Math.max(1,Math.floor(ROUNDS/4));i++)publicTest.push(...publicUrls);

  const local=await runBatch(localTest,CONC);
  const pub=await runBatch(publicTest,Math.min(CONC,8));
  const transfer=await transferBench();

  const localOk=local.filter(x=>x.ok).length;
  const pubOk=pub.filter(x=>x.ok).length;
  const localLat=local.filter(x=>x.ok).map(x=>x.us);
  const pubLat=pub.filter(x=>x.ok).map(x=>x.us);
  const dnsLat=dns.filter(x=>x.ok).map(x=>x.us);

  const health=Math.max(0,Math.min(100,
    100
    -(local.length-localOk)*0.2
    -(pub.length-pubOk)*1.5
    -(pct(localLat,0.95)>250000?8:0)
    -(transfer.p95_us>500000?8:0)
  ));

  const report={
    engine:"TRILLIONX_NETWORK_MICROSECOND_LATENCY_BENCH",
    ts:new Date().toISOString(),
    policy:{
      target:"TRILLIONX",
      host:"CODESPACES_SUPPORT_ONLY",
      unit:"microseconds",
      automatic_detection_required:true,
      passive_public_probe_only:true,
      no_external_port_scan:true,
      real_only:true
    },
    system:{
      node:process.version,
      platform:os.platform(),
      arch:os.arch(),
      hostname:os.hostname(),
      cpus:os.cpus().length,
      ram_gb:r(os.totalmem()/2**30),
      free_gb:r(os.freemem()/2**30)
    },
    interfaces:ifs,
    detected_ports:portsInfo.ports,
    listening_ports:portsInfo.listening,
    dns,
    local_results:local.slice(0,300),
    public_results:pub,
    transfer,
    summary:{
      local_requests:local.length,
      local_ok:`${localOk}/${local.length}`,
      public_ok:`${pubOk}/${pub.length}`,
      dns_ok:`${dns.filter(x=>x.ok).length}/${dns.length}`,
      local_p50_us:pct(localLat,0.50),
      local_p95_us:pct(localLat,0.95),
      local_p99_us:pct(localLat,0.99),
      public_p50_us:pct(pubLat,0.50),
      public_p95_us:pct(pubLat,0.95),
      dns_p50_us:pct(dnsLat,0.50),
      dns_p95_us:pct(dnsLat,0.95),
      transfer_mb_s:transfer.mb_s,
      transfer_p50_us:transfer.p50_us,
      transfer_p95_us:transfer.p95_us,
      health:r(health),
      verdict:health>=85?"MICROSECOND_NETWORK_GOOD":health>=65?"MICROSECOND_NETWORK_PARTIAL":"MICROSECOND_NETWORK_REVIEW"
    }
  };

  const file=`data/trillionx_network_microsecond_latency_${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  fs.writeFileSync("data/trillionx_network_microsecond_latency_latest.json",JSON.stringify(report,null,2));

  console.log("PORTS:",portsInfo.ports.join(",")||"none");
  console.log("LOCAL OK:",report.summary.local_ok);
  console.log("LOCAL P50/P95/P99 µs:",report.summary.local_p50_us,report.summary.local_p95_us,report.summary.local_p99_us);
  console.log("PUBLIC P50/P95 µs:",report.summary.public_p50_us,report.summary.public_p95_us);
  console.log("DNS P50/P95 µs:",report.summary.dns_p50_us,report.summary.dns_p95_us);
  console.log("TRANSFER MB/s:",report.summary.transfer_mb_s,"P95 µs:",report.summary.transfer_p95_us);
  console.log("HEALTH:",report.summary.health);
  console.log("VERDICT:",report.summary.verdict);
  console.log("REPORT =",file);
})();
