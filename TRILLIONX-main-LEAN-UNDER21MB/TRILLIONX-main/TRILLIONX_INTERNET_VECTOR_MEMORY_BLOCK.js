"use strict";

/*
 TRILLIONX INTERNET VECTOR MEMORY BLOCK
 - Local + public URL/API scanner
 - Safe: no intrusion, no brute force, no crawling aggressive
 - Vector memory: lexical hashed embeddings
 - Detects repo files, routes, APIs, JSON, JS, C/C++, shell, package scripts, ports
 - Optional public URL list: data/trillionx_internet_targets.txt
*/

const fs=require("fs");
const os=require("os");
const path=require("path");
const crypto=require("crypto");
const http=require("http");
const https=require("https");
const net=require("net");
const cp=require("child_process");
const {performance}=require("perf_hooks");

const ROOT=process.cwd();
const OUT="data";
const HIST="history";
fs.mkdirSync(OUT,{recursive:true});
fs.mkdirSync(HIST,{recursive:true});

const MAX_FILES=Number(process.argv[2]||2000);
const MAX_BYTES=Number(process.argv[3]||262144);
const VECTOR_DIMS=Number(process.argv[4]||256);
const HTTP_TIMEOUT=Number(process.argv[5]||3500);

const IGNORE=new Set([".git","node_modules",".cache",".npm",".vscode-server","dist","build","coverage"]);
const EXT_OK=new Set([".js",".mjs",".cjs",".json",".jsonl",".txt",".md",".sh",".html",".css",".c",".cc",".cpp",".h",".hpp",".py",".yml",".yaml",".toml",".env",".conf",".ini"]);
const COMMON_PORTS=[80,443,3000,3001,3002,3033,3044,3055,3100,3110,3111,3112,3113,3114,3115,3116,3117,3118,3119,3150,3160,3199,4000,5000,8000,8080,8443,8888,9000,9229,9230,10000];

const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const now=()=>new Date().toISOString();
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const sh=cmd=>{try{return cp.execSync(cmd,{stdio:["ignore","pipe","ignore"],timeout:3000}).toString().trim()}catch(e){return ""}};
const safeRead=f=>{try{return fs.readFileSync(f,"utf8").slice(0,MAX_BYTES)}catch{return ""}};

function title(s){console.log("\n"+"═".repeat(78));console.log(" "+s);console.log("═".repeat(78))}
function kv(k,v,u=""){console.log(String(k).padEnd(32," ")+": "+String(v)+(u?" "+u:""))}

function walk(dir,arr=[]){
  if(arr.length>=MAX_FILES)return arr;
  let list=[];
  try{list=fs.readdirSync(dir,{withFileTypes:true})}catch{return arr}
  for(const e of list){
    if(arr.length>=MAX_FILES)break;
    if(IGNORE.has(e.name))continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p,arr);
    else{
      const ext=path.extname(e.name).toLowerCase();
      if(EXT_OK.has(ext) || e.name==="package.json") arr.push(p);
    }
  }
  return arr;
}

function tokenize(s){
  return (s.toLowerCase().match(/[a-z0-9_\/\.\-:]{2,}/g)||[]).slice(0,20000);
}

function vectorize(tokens,dims=VECTOR_DIMS){
  const v=new Float32Array(dims);
  for(const t of tokens){
    const h=crypto.createHash("sha1").update(t).digest();
    const idx=h.readUInt32LE(0)%dims;
    const sign=(h[4]&1)?1:-1;
    v[idx]+=sign*(1+Math.min(t.length,32)/32);
  }
  let norm=0;
  for(const x of v)norm+=x*x;
  norm=Math.sqrt(norm)||1;
  for(let i=0;i<v.length;i++)v[i]=+(v[i]/norm).toFixed(6);
  return Array.from(v);
}

function detect(text,file){
  const routes=[];
  const apis=[];
  const ws=[];
  const requires=[];
  const imports=[];
  const codecs=[];
  const networks=[];
  const registries=[];
  const scripts=[];
  const ports=[];
  const errors=[];

  const routeRe=/\bapp\.(get|post|put|delete|patch|all)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while((m=routeRe.exec(text))) routes.push({method:m[1].toUpperCase(),route:m[2]});

  const apiRe=/\/api\/[a-zA-Z0-9_\-\/:]+/g;
  while((m=apiRe.exec(text))) apis.push(m[0]);

  const wsRe=/\b(socket\.on|io\.on|emit)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while((m=wsRe.exec(text))) ws.push(m[2]);

  const reqRe=/require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  while((m=reqRe.exec(text))) requires.push(m[1]);

  const impRe=/import\s+.*?\s+from\s+["'`]([^"'`]+)["'`]/g;
  while((m=impRe.exec(text))) imports.push(m[1]);

  const portRe=/\b(?:PORT|port)\b[^0-9]{0,8}([0-9]{2,5})/g;
  while((m=portRe.exec(text))){
    const p=Number(m[1]);
    if(p>0&&p<65536)ports.push(p);
  }

  const lower=text.toLowerCase();
  for(const c of ["http","https","websocket","tcp","udp","mqtt","coap","grpc","json","jsonl","csv","xml","html","wasm","protobuf","msgpack","base64","gzip","brotli","zlib","sha256","sha3","blake","aes","rsa","ecdsa","utxo","merkle","stratum","btc","eth","blockchain","satellite","iot","lorawan","opcua"]){
    if(lower.includes(c))codecs.push(c);
  }
  for(const n of ["dns","ip","ipv4","ipv6","socket","net","ping","latency","throughput","bandwidth","port","route","gateway","interface","eth0","docker0","localhost","127.0.0.1","0.0.0.0"]){
    if(lower.includes(n))networks.push(n);
  }
  for(const g of ["registry","catalog","module","plugin","worker","runtime","benchmark","health","memory","cache","vector","raid60","mirror","vr","trillionx","trillions"]){
    if(lower.includes(g))registries.push(g);
  }

  if(path.basename(file)==="package.json"){
    try{
      const j=JSON.parse(text);
      if(j.scripts)for(const [k,v] of Object.entries(j.scripts))scripts.push({name:k,cmd:String(v)});
    }catch(e){errors.push("package_json_parse_error")}
  }

  return {
    routes:[...new Map(routes.map(x=>[x.method+" "+x.route,x])).values()].slice(0,500),
    apis:[...new Set(apis)].slice(0,1000),
    ws:[...new Set(ws)].slice(0,500),
    requires:[...new Set(requires)].slice(0,300),
    imports:[...new Set(imports)].slice(0,300),
    codecs:[...new Set(codecs)],
    networks:[...new Set(networks)],
    registries:[...new Set(registries)],
    scripts,
    ports:[...new Set(ports)].slice(0,200),
    errors
  };
}

function cpu(){
  const cs=os.cpus()||[];
  const mhz=cs.map(x=>x.speed||0).filter(Boolean);
  return {
    host:os.hostname(),
    platform:os.platform(),
    arch:os.arch(),
    node:process.version,
    model:cs[0]?.model||"unknown",
    logical:cs.length,
    ghz:r((mhz.reduce((a,b)=>a+b,0)/(mhz.length||1))/1000),
    ram_total_gb:r(os.totalmem()/1073741824),
    ram_free_gb:r(os.freemem()/1073741824),
    load:os.loadavg().map(r)
  };
}

function mem(){
  const m=process.memoryUsage();
  return {
    rss_mb:r(m.rss/1048576),
    heap_used_mb:r(m.heapUsed/1048576),
    heap_total_mb:r(m.heapTotal/1048576),
    external_mb:r(m.external/1048576),
    array_buffers_mb:r((m.arrayBuffers||0)/1048576)
  };
}

function portProbe(port){
  return new Promise(resolve=>{
    const t0=performance.now();
    const s=net.createConnection({host:"127.0.0.1",port});
    const done=o=>{try{s.destroy()}catch{} resolve({...o,port,ms:r(performance.now()-t0)})};
    s.setTimeout(450);
    s.on("connect",()=>done({open:true}));
    s.on("timeout",()=>done({open:false,error:"timeout"}));
    s.on("error",e=>done({open:false,error:e.code||e.message}));
  });
}

function httpGet(url){
  return new Promise(resolve=>{
    const t0=performance.now();
    const lib=url.startsWith("https:")?https:http;
    const req=lib.get(url,{timeout:HTTP_TIMEOUT,headers:{"User-Agent":"TRILLIONX-safe-vector-memory/1.0"}},res=>{
      let data="";
      res.on("data",d=>{ if(data.length<MAX_BYTES)data+=d.toString("utf8") });
      res.on("end",()=>{
        resolve({
          url,status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<400,
          content_type:res.headers["content-type"]||"",
          bytes:data.length,ms:r(performance.now()-t0),
          hash:sha(data),sample:data.slice(0,5000)
        });
      });
    });
    req.on("timeout",()=>{req.destroy();resolve({url,ok:false,error:"timeout",ms:r(performance.now()-t0)})});
    req.on("error",e=>resolve({url,ok:false,error:e.code||e.message,ms:r(performance.now()-t0)}));
  });
}

function loadTargets(){
  const f=path.join(OUT,"trillionx_internet_targets.txt");
  if(!fs.existsSync(f)){
    fs.writeFileSync(f,[
      "http://127.0.0.1:3000/",
      "http://127.0.0.1:3000/api/health",
      "http://127.0.0.1:3000/api/full",
      "http://127.0.0.1:3000/api/system",
      "http://127.0.0.1:3000/api/runtime/status",
      "http://127.0.0.1:3000/api/ping"
    ].join("\n"));
  }
  return fs.readFileSync(f,"utf8").split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith("#")).slice(0,200);
}

(async()=>{
  const t0=performance.now();

  title("TRILLIONX INTERNET VECTOR MEMORY BLOCK");
  kv("Root",ROOT);
  kv("Max files",MAX_FILES);
  kv("Max bytes/file",MAX_BYTES);
  kv("Vector dims",VECTOR_DIMS);
  kv("Mode","SAFE_LOCAL_AND_DECLARED_PUBLIC_URLS_ONLY");
  kv("Truth","No intrusive scan, no global internet takeover, no fake infinite memory");

  const before=mem();
  const host=cpu();

  title("HOST / TRILLIONX IDENTITY");
  kv("TRILLIONX","AVAILABLE_AS_VECTOR_MEMORY_RUNTIME");
  kv("Support CPU réel",host.model);
  kv("GHz détecté",host.ghz,"GHz");
  kv("Logical CPU",host.logical);
  kv("RAM totale",host.ram_total_gb,"GB");
  kv("RAM libre",host.ram_free_gb,"GB");

  title("REPO AUTODETECT");
  const files=walk(ROOT);
  const entries=[];
  const global={
    files:files.length,routes:0,apis:0,ws:0,requires:0,imports:0,ports:new Set(),
    codecs:new Map(),networks:new Map(),registries:new Map(),scripts:0,errors:0
  };

  for(const file of files){
    const rel=path.relative(ROOT,file);
    const text=safeRead(file);
    const tokens=tokenize(text+" "+rel);
    const d=detect(text,rel);
    for(const p of d.ports)global.ports.add(p);
    for(const k of d.codecs)global.codecs.set(k,(global.codecs.get(k)||0)+1);
    for(const k of d.networks)global.networks.set(k,(global.networks.get(k)||0)+1);
    for(const k of d.registries)global.registries.set(k,(global.registries.get(k)||0)+1);
    global.routes+=d.routes.length;
    global.apis+=d.apis.length;
    global.ws+=d.ws.length;
    global.requires+=d.requires.length;
    global.imports+=d.imports.length;
    global.scripts+=d.scripts.length;
    global.errors+=d.errors.length;

    entries.push({
      id:sha(rel).slice(0,16),
      file:rel,
      ext:path.extname(rel)||"NOEXT",
      size:Buffer.byteLength(text),
      hash:sha(text).slice(0,24),
      tokens:tokens.length,
      routes:d.routes,
      apis:d.apis,
      ws:d.ws,
      requires:d.requires,
      imports:d.imports,
      codecs:d.codecs,
      networks:d.networks,
      registries:d.registries,
      scripts:d.scripts,
      errors:d.errors,
      vector:vectorize(tokens)
    });
  }

  kv("Fichiers indexés",entries.length);
  kv("Routes détectées",global.routes);
  kv("API strings",global.apis);
  kv("WS events",global.ws);
  kv("Requires",global.requires);
  kv("Imports",global.imports);
  kv("Scripts package",global.scripts);
  kv("Ports dans code",Array.from(global.ports).sort((a,b)=>a-b).join(", ")||"aucun");

  title("PORT AUTODETECT");
  const probePorts=[...new Set([...COMMON_PORTS,...Array.from(global.ports)])].sort((a,b)=>a-b).slice(0,120);
  const portResults=[];
  for(const p of probePorts)portResults.push(await portProbe(p));
  const openPorts=portResults.filter(x=>x.open).map(x=>x.port);
  kv("Ports testés",probePorts.length);
  kv("Ports ouverts",openPorts.join(", ")||"aucun");

  title("DECLARED INTERNET/API TARGETS");
  const targets=loadTargets();
  const urlResults=[];
  for(const u of targets)urlResults.push(await httpGet(u));
  const okUrls=urlResults.filter(x=>x.ok);
  kv("Targets déclarées",targets.length);
  kv("Targets OK",okUrls.length);
  for(const u of okUrls.slice(0,10))kv(String(u.status)+" "+u.url,u.ms+" ms / "+u.bytes+" bytes");

  title("VECTOR MEMORY BUILD");
  const corpusTokens=entries.flatMap(e=>[e.file,...e.codecs,...e.networks,...e.registries,...e.apis.slice(0,20)]);
  const masterVector=vectorize(corpusTokens,VECTOR_DIMS);
  const memory={
    name:"TRILLIONX_INTERNET_VECTOR_MEMORY",
    version:"V1_SAFE_EXPRESS",
    dims:VECTOR_DIMS,
    created_at:now(),
    root:ROOT,
    mode:"LOCAL_REPO_PLUS_DECLARED_PUBLIC_TARGETS",
    host,
    global:{
      files:global.files,
      routes:global.routes,
      apis:global.apis,
      ws_events:global.ws,
      modules:global.requires+global.imports,
      scripts:global.scripts,
      errors:global.errors,
      ports_in_code:Array.from(global.ports).sort((a,b)=>a-b),
      open_ports:openPorts,
      codecs:Object.fromEntries([...global.codecs.entries()].sort((a,b)=>b[1]-a[1])),
      networks:Object.fromEntries([...global.networks.entries()].sort((a,b)=>b[1]-a[1])),
      registries:Object.fromEntries([...global.registries.entries()].sort((a,b)=>b[1]-a[1]))
    },
    targets:urlResults.map(x=>({url:x.url,ok:x.ok,status:x.status||null,ms:x.ms,bytes:x.bytes||0,content_type:x.content_type||"",error:x.error||null,hash:x.hash||null})),
    master_vector:masterVector,
    entries
  };

  const stamp=Date.now();
  const latest=path.join(OUT,"trillionx_internet_vector_memory_latest.json");
  const full=path.join(OUT,`trillionx_internet_vector_memory_${stamp}.json`);
  fs.writeFileSync(latest,JSON.stringify(memory,null,2));
  fs.writeFileSync(full,JSON.stringify(memory,null,2));

  const seal=sha(JSON.stringify({
    ts:memory.created_at,
    global:memory.global,
    targets:memory.targets,
    master_vector:memory.master_vector
  }));

  const block={
    engine:"TRILLIONX_INTERNET_VECTOR_MEMORY_BLOCK",
    ts:now(),
    seal,
    file:full,
    latest,
    summary:memory.global,
    health:Math.max(0,Math.min(100,100-(global.errors>50?10:0)-(openPorts.length===0?10:0)-(entries.length===0?50:0))),
    verdict:"TRILLIONX_VECTOR_INTERNET_BLOCK_READY_SAFE_LOCAL_DECLARED_TARGETS",
    truth_policy:{
      safe_only:true,
      no_global_takeover:true,
      no_intrusion:true,
      no_bruteforce:true,
      declared_targets_only:true,
      local_repo_index:true,
      vector_memory:true,
      internet_support:"only public/declared URLs and local exposed endpoints"
    }
  };

  fs.writeFileSync(path.join(OUT,"TRILLIONX_INTERNET_VECTOR_BLOCK_LATEST.json"),JSON.stringify(block,null,2));
  fs.appendFileSync(path.join(HIST,"TRILLIONX_INTERNET_VECTOR_BLOCK_CHAIN.jsonl"),JSON.stringify(block)+"\n");

  const after=mem();
  title("FINAL VECTOR BLOCK RESULT");
  kv("Seal SHA256",seal);
  kv("Fichiers",memory.global.files);
  kv("Routes",memory.global.routes);
  kv("API strings",memory.global.apis);
  kv("WS events",memory.global.ws_events);
  kv("Modules",memory.global.modules);
  kv("Ports ouverts",memory.global.open_ports.join(", ")||"aucun");
  kv("Targets OK",okUrls.length+"/"+targets.length);
  kv("Mémoire avant RSS",before.rss_mb,"MB");
  kv("Mémoire après RSS",after.rss_mb,"MB");
  kv("Health",block.health);
  kv("Verdict",block.verdict);
  kv("Latest",latest);
  kv("Block",path.join(OUT,"TRILLIONX_INTERNET_VECTOR_BLOCK_LATEST.json"));
  kv("Runtime ms",r(performance.now()-t0));
})();
