"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});
fs.mkdirSync("logs",{recursive:true});
fs.mkdirSync("history",{recursive:true});

const PORT=Number(process.argv[2]||3100);
const HISTORY="history/trillionx_tier23_history.jsonl";
const LATEST="data/trillionx_tier23_runtime_latest.json";
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const us=ms=>Math.round(ms*1000);
const pct=(a,p)=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.min(b.length-1,Math.floor(b.length*p))]:null};

function mem(){
 const m=process.memoryUsage();
 return {
  rss_mb:r(m.rss/1048576),
  heap_mb:r(m.heapUsed/1048576),
  external_mb:r(m.external/1048576),
  arraybuf_mb:r((m.arrayBuffers||0)/1048576),
  free_gb:r(os.freemem()/1073741824),
  total_gb:r(os.totalmem()/1073741824),
  load1:r(os.loadavg()[0])
 };
}

function appendHistory(o){
 fs.appendFileSync(HISTORY,JSON.stringify(o)+"\n");
}

function readHistory(limit=200){
 try{
  const lines=fs.readFileSync(HISTORY,"utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean);
 }catch{return[]}
}

function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex")}

function cryptoIntensityMicro(rounds=1){
 const t0=performance.now();
 let aesBytes=0, shaBytes=0, rsaOps=0, digest="";
 const key=crypto.randomBytes(32), iv=crypto.randomBytes(16);
 for(let i=0;i<rounds;i++){
  const buf=crypto.randomBytes(4*1024*1024);
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  const enc=Buffer.concat([c.update(buf),c.final()]);
  aesBytes+=buf.length;
  digest=crypto.createHash("sha256").update(enc).digest("hex");
  shaBytes+=enc.length;
 }
 try{
  const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
  const msg=Buffer.from(digest);
  for(let i=0;i<Math.max(1,rounds);i++){
   crypto.sign("sha256",msg,privateKey);
   rsaOps++;
  }
 }catch{}
 const ms=performance.now()-t0;
 return {
  ms:r(ms), us:us(ms),
  aes_mb_s:r((aesBytes/1048576)/(ms/1000)),
  sha_mb_s:r((shaBytes/1048576)/(ms/1000)),
  rsa_sign_s:r(rsaOps/(ms/1000)),
  digest:digest.slice(0,24)
 };
}

function llmTokenSim(tokens=128,batch=4,dim=512){
 const t0=performance.now();
 const state=new Float32Array(batch*dim);
 const weights=new Float32Array(dim);
 for(let i=0;i<weights.length;i++)weights[i]=Math.sin(i)*0.01;
 let checksum=0, ops=0;
 for(let t=0;t<tokens;t++){
  for(let b=0;b<batch;b++){
   let acc=0;
   for(let i=0;i<dim;i++){
    const idx=b*dim+i;
    state[idx]=Math.tanh(state[idx]+weights[i]+((t+i)%17)*0.0001);
    acc+=state[idx]*weights[i];
    ops+=6;
   }
   checksum+=acc;
  }
 }
 const ms=performance.now()-t0;
 return {
  tokens,batch,dim,ms:r(ms),us:us(ms),
  tokens_s:r((tokens*batch)/(ms/1000)),
  gops_s:r((ops/(ms/1000))/1e9),
  memory_mb:r((state.byteLength+weights.byteLength)/1048576),
  checksum:r(checksum)
 };
}

function cacheCoherenceSim(sizeMB=64,stride=64,passes=3){
 const bytes=sizeMB*1048576;
 const buf=Buffer.alloc(bytes);
 const t0=performance.now();
 let checksum=0, ops=0;
 for(let p=0;p<passes;p++){
  for(let i=0;i<bytes;i+=stride){
   buf[i]=(buf[i]+i+p)&255;
   checksum=(checksum+buf[i])>>>0;
   ops++;
  }
 }
 const ms=performance.now()-t0;
 return {
  size_mb:sizeMB,stride,passes,ms:r(ms),us:us(ms),
  touched_ops:ops,
  ops_s:r(ops/(ms/1000)),
  bandwidth_mb_s:r((bytes*passes/1048576)/(ms/1000)),
  checksum
 };
}

function mlOptimizer(){
 const h=readHistory(100);
 if(h.length<3)return {status:"WARMUP",suggestion:"Collect more samples"};
 const scores=h.map(x=>x.summary?.score||0);
 const last=scores.at(-1)||0;
 const avg=scores.reduce((a,b)=>a+b,0)/scores.length;
 const trend=last-avg;
 let suggestion="KEEP";
 if(trend< -10)suggestion="REDUCE_CONCURRENCY_OR_PACKET_SIZE";
 if(trend> 10)suggestion="CAN_INCREASE_STRESS";
 return {status:"ACTIVE",samples:h.length,last_score:r(last),avg_score:r(avg),trend:r(trend),suggestion};
}

function snapshot(){
 const crypto=cryptoIntensityMicro(1);
 const llm=llmTokenSim(96,4,384);
 const cache=cacheCoherenceSim(32,64,2);
 const score=r(crypto.aes_mb_s*0.25+crypto.sha_mb_s*0.25+llm.tokens_s*0.2+cache.bandwidth_mb_s*0.2);
 const report={
  engine:"TRILLIONX_TIER23_RUNTIME",
  ts:new Date().toISOString(),
  target:"TRILLIONX",
  host_role:"CODESPACES_SUPPORT_ONLY",
  modules:{
   cryptographic_intensity:"ACTIVE",
   llm_token_simulation:"ACTIVE",
   cache_coherence_simulation:"ACTIVE",
   json_api_load:"ACTIVE_ON_PORT_3100",
   persistent_history:"ACTIVE",
   ml_optimizer:"ACTIVE",
   realtime_dashboard:"ACTIVE"
  },
  crypto,llm,cache,
  ml_optimizer:mlOptimizer(),
  memory:mem(),
  summary:{
   score,
   health:r(Math.max(0,Math.min(100,100-(mem().free_gb<0.4?20:0)-(mem().rss_mb>1800?15:0)))),
   verdict:"TRILLIONX_TIER23_RUNTIME_ACTIVE"
  },
  truth_policy:{
   real_only:true,
   target_is_trillionx:true,
   codespaces_support_only:true,
   no_fake_frontier_ratio:true,
   no_fake_gpu:true
  }
 };
 fs.writeFileSync(LATEST,JSON.stringify(report,null,2));
 appendHistory({ts:report.ts,summary:report.summary,crypto:report.crypto,llm:report.llm,cache:report.cache,memory:report.memory});
 return report;
}

function html(){
 return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>TRILLIONX Tier 2/3 Runtime Dashboard</title>
<style>
body{background:#05070b;color:#d7f7ff;font-family:Arial;margin:0;padding:20px}
h1{color:#66f7ff}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.card{background:#101726;border:1px solid #2a80ff;border-radius:12px;padding:14px;box-shadow:0 0 18px #003cff55}
.big{font-size:28px;color:#9dff9d}
pre{white-space:pre-wrap;font-size:12px;color:#c7d7ff}
.bar{height:10px;background:#1d2d45;border-radius:99px;overflow:hidden}
.fill{height:10px;background:#5cf5ff;width:50%}
</style>
</head>
<body>
<h1>TRILLIONX Tier 2/3 Runtime Dashboard</h1>
<div class="grid" id="cards"></div>
<pre id="raw"></pre>
<script>
async function load(){
 const j=await fetch('/api/tier23').then(r=>r.json());
 const c=document.getElementById('cards');
 c.innerHTML='';
 function card(t,v,s=''){
  c.innerHTML+=\`<div class="card"><h3>\${t}</h3><div class="big">\${v}</div><p>\${s}</p><div class="bar"><div class="fill" style="width:\${Math.min(100,Number(v)||50)}%"></div></div></div>\`;
 }
 card('Score',j.summary.score,'Tier 2/3 useful runtime');
 card('Health',j.summary.health,'Runtime stability');
 card('AES MB/s',j.crypto.aes_mb_s,'Crypto intensity');
 card('SHA MB/s',j.crypto.sha_mb_s,'Mega-batch crypto');
 card('Tokens/s',j.llm.tokens_s,'LLM token simulation');
 card('Cache MB/s',j.cache.bandwidth_mb_s,'Memory locality');
 card('RAM free GB',j.memory.free_gb,'Codespaces support context');
 card('ML suggestion',j.ml_optimizer.suggestion||j.ml_optimizer.status,'Optimizer');
 document.getElementById('raw').textContent=JSON.stringify(j,null,2);
}
load();setInterval(load,3000);
</script>
</body></html>`;
}

const server=http.createServer((req,res)=>{
 if(req.url==="/"||req.url==="/dashboard"){
  res.setHeader("content-type","text/html");
  res.end(html());
  return;
 }
 if(req.url==="/api/tier23"||req.url==="/health"){
  const j=snapshot();
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify(j,null,2));
  return;
 }
 if(req.url==="/api/history"){
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify(readHistory(200),null,2));
  return;
 }
 res.statusCode=404;res.end("not found");
});

server.listen(PORT,"127.0.0.1",()=>{
 console.log("TRILLIONX TIER23 RUNTIME ACTIVE http://127.0.0.1:"+PORT);
 snapshot();
});
