"use strict";
const fs=require("fs"),os=require("os"),http=require("http"),crypto=require("crypto");
const {performance}=require("perf_hooks");

fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("history",{recursive:true});

const MODE=process.argv[2]||"full";
const ROUNDS=Math.max(1,Math.min(Number(process.argv[3]||5),50));
const CONC=Math.max(1,Math.min(Number(process.argv[4]||32),512));
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;
const us=ms=>Math.round(ms*1000);
const pct=(a,p)=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.min(b.length-1,Math.floor(b.length*p))]:null};

function mem(){
 const m=process.memoryUsage();
 return {rss_mb:r(m.rss/1048576),heap_mb:r(m.heapUsed/1048576),free_gb:r(os.freemem()/1073741824),total_gb:r(os.totalmem()/1073741824)};
}

function cryptoBench(){
 const t0=performance.now();
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(16);
 let aesBytes=0,shaBytes=0,digest="";
 for(let i=0;i<ROUNDS;i++){
  const buf=crypto.randomBytes(32*1024*1024);
  const c=crypto.createCipheriv("aes-256-cbc",key,iv);
  const enc=Buffer.concat([c.update(buf),c.final()]);
  aesBytes+=buf.length;
  digest=crypto.createHash("sha256").update(enc).digest("hex");
  shaBytes+=enc.length;
 }
 const rsaT=performance.now();
 const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
 let rsaOps=0;
 while(performance.now()-rsaT<1500){
  crypto.sign("sha256",Buffer.from(digest),privateKey);
  rsaOps++;
 }
 const ms=performance.now()-t0;
 return {
  ms:r(ms),us:us(ms),
  aes_mb_s:r((aesBytes/1048576)/(ms/1000)),
  sha_mb_s:r((shaBytes/1048576)/(ms/1000)),
  rsa2048_sign_s:r(rsaOps/((performance.now()-rsaT)/1000)),
  digest:digest.slice(0,24)
 };
}

function llmBench(){
 const batches=[1,2,4,8,16];
 const out=[];
 for(const batch of batches){
  const tokens=256,dim=768;
  const state=new Float32Array(batch*dim);
  const w=new Float32Array(dim);
  for(let i=0;i<dim;i++)w[i]=Math.sin(i)*0.01;
  const t0=performance.now();let ops=0,checksum=0;
  for(let t=0;t<tokens;t++){
   for(let b=0;b<batch;b++){
    let acc=0;
    for(let i=0;i<dim;i++){
     const idx=b*dim+i;
     state[idx]=Math.tanh(state[idx]+w[i]+((t+i)%31)*0.0001);
     acc+=state[idx]*w[i];
     ops+=6;
    }
    checksum+=acc;
   }
  }
  const ms=performance.now()-t0;
  out.push({batch,tokens,dim,ms:r(ms),tokens_s:r((tokens*batch)/(ms/1000)),gops_s:r((ops/(ms/1000))/1e9),memory_mb:r((state.byteLength+w.byteLength)/1048576),checksum:r(checksum)});
 }
 return out;
}

function cacheBench(){
 const sizes=[8,32,64,128];
 const strides=[1,64,4096];
 const out=[];
 for(const sizeMB of sizes){
  const buf=Buffer.alloc(sizeMB*1048576);
  for(const stride of strides){
   const t0=performance.now();let ops=0,chk=0;
   for(let pass=0;pass<3;pass++){
    for(let i=0;i<buf.length;i+=stride){
     buf[i]=(buf[i]+pass+i)&255;
     chk=(chk+buf[i])>>>0;
     ops++;
    }
   }
   const ms=performance.now()-t0;
   out.push({size_mb:sizeMB,stride,ms:r(ms),us:us(ms),ops,ops_s:r(ops/(ms/1000)),bandwidth_mb_s:r((buf.length*3/1048576)/(ms/1000)),checksum:chk});
  }
 }
 return out;
}

function startApiServer(port=3199){
 return new Promise(resolve=>{
  const server=http.createServer((req,res)=>{
   if(req.url.startsWith("/json")){
    const payload={ok:true,ts:Date.now(),hash:crypto.randomBytes(16).toString("hex"),data:Array.from({length:64},(_,i)=>i*i)};
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify(payload));
   }else{res.end("ok")}
  });
  server.listen(port,"127.0.0.1",()=>resolve(server));
 });
}

function req(port){
 return new Promise(resolve=>{
  const t0=performance.now();
  const q=http.get({host:"127.0.0.1",port,path:"/json",timeout:2500},res=>{
   let bytes=0;res.on("data",d=>bytes+=d.length);
   res.on("end",()=>resolve({ok:res.statusCode<500,ms:performance.now()-t0,bytes}));
  });
  q.on("timeout",()=>{q.destroy();resolve({ok:false,ms:performance.now()-t0,bytes:0,error:"timeout"})});
  q.on("error",e=>resolve({ok:false,ms:performance.now()-t0,bytes:0,error:e.code||e.message}));
 });
}

async function jsonApiLoad(){
 const server=await startApiServer(3199);
 const total=1000;
 const results=[];
 let idx=0;
 async function worker(){
  while(idx<total){
   idx++;
   results.push(await req(3199));
  }
 }
 const t0=performance.now();
 await Promise.all(Array.from({length:CONC},worker));
 const totalMs=performance.now()-t0;
 server.close();
 const l=results.map(x=>x.ms*1000);
 const ok=results.filter(x=>x.ok).length;
 const bytes=results.reduce((a,b)=>a+b.bytes,0);
 return {
  requests:total,concurrency:CONC,ok,fail:total-ok,
  total_ms:r(totalMs),
  req_s:r(total/(totalMs/1000)),
  mb_s:r((bytes/1048576)/(totalMs/1000)),
  p50_us:Math.round(pct(l,0.5)),
  p95_us:Math.round(pct(l,0.95)),
  p99_us:Math.round(pct(l,0.99))
 };
}

function frontierComparison(summary){
 return {
  status:"INDICATIVE_ONLY",
  note:"Frontier public exascale baseline is not fetched here; no fake ratio. Compare only workload-specific metrics after sourcing official data.",
  trillionx_score:summary.score,
  ratio_policy:"UNAVAILABLE_UNTIL_OFFICIAL_BASELINE_IMPORTED"
 };
}

(async()=>{
 console.log("=== TRILLIONX TIER 2/3 BENCHMARK ===");
 console.log("MODE:",MODE,"ROUNDS:",ROUNDS,"CONC:",CONC);
 const before=mem();

 const cryptoRes=cryptoBench();
 console.log("CRYPTO OK",cryptoRes);

 const llmRes=llmBench();
 console.log("LLM OK",llmRes.map(x=>({batch:x.batch,tokens_s:x.tokens_s})));

 const cacheRes=cacheBench();
 console.log("CACHE OK",cacheRes.length);

 const apiRes=await jsonApiLoad();
 console.log("API LOAD OK",apiRes);

 const bestLLM=Math.max(...llmRes.map(x=>x.tokens_s));
 const bestCache=Math.max(...cacheRes.map(x=>x.bandwidth_mb_s));
 const score=r(cryptoRes.aes_mb_s*0.2+cryptoRes.sha_mb_s*0.2+cryptoRes.rsa2048_sign_s*0.2+bestLLM*0.2+bestCache*0.1+apiRes.req_s*0.1);
 const summary={
  score,
  best_llm_tokens_s:r(bestLLM),
  best_cache_mb_s:r(bestCache),
  api_req_s:apiRes.req_s,
  health:r(Math.max(0,Math.min(100,100-(mem().free_gb<0.3?25:0)-(apiRes.fail>0?10:0)))),
  verdict:"TRILLIONX_TIER23_BENCHMARK_COMPLETE"
 };

 const report={
  engine:"TRILLIONX_TIER23_BENCHMARK",
  ts:new Date().toISOString(),
  mode:MODE,rounds:ROUNDS,concurrency:CONC,
  target:"TRILLIONX",
  host_role:"CODESPACES_SUPPORT_ONLY",
  before_memory:before,
  after_memory:mem(),
  crypto:cryptoRes,
  llm:llmRes,
  cache:cacheRes,
  json_api_load:apiRes,
  summary,
  comparative_frontier:frontierComparison(summary),
  truth_policy:{
   real_only:true,
   no_fake_frontier_ratio:true,
   no_fake_exascale:true,
   no_fake_gpu:true,
   benchmarks_separate_from_runtime:true
  }
 };

 const file=`data/trillionx_tier23_benchmark_${Date.now()}.json`;
 fs.writeFileSync(file,JSON.stringify(report,null,2));
 fs.writeFileSync("data/trillionx_tier23_benchmark_latest.json",JSON.stringify(report,null,2));
 fs.appendFileSync("history/trillionx_tier23_benchmark_history.jsonl",JSON.stringify({ts:report.ts,summary})+"\n");

 console.log("=== SUMMARY ===");
 console.log("SCORE:",summary.score);
 console.log("BEST LLM TOKENS/S:",summary.best_llm_tokens_s);
 console.log("BEST CACHE MB/S:",summary.best_cache_mb_s);
 console.log("API REQ/S:",summary.api_req_s);
 console.log("HEALTH:",summary.health);
 console.log("VERDICT:",summary.verdict);
 console.log("REPORT =",file);
})();
