#!/usr/bin/env node
const http=require('http');
const DURATION_S=parseInt(process.env.DURATION_S||60);
const TARGET_LAT_MS=parseInt(process.env.TARGET_LAT_MS||50);
const YIELD_MIN_US=parseInt(process.env.YIELD_MIN_US||100);
const YIELD_MAX_MS=parseInt(process.env.YIELD_MAX_MS||20);
const EP=process.env.EP||'/api/memory-stress?n=1';
const MASTER=3160;
const agent=new http.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1,keepAliveMsecs:30000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sleepUs=us=>new Promise(r=>setTimeout(r,us/1000));
let opsOK=0,opsKO=0,latSum=0,latMax=0,latMin=999999;
let yieldUs=YIELD_MIN_US;
const latHist=[];
const t0=Date.now();
function call(){return new Promise(res=>{
  const s=Date.now();
  const r=http.get({host:'127.0.0.1',port:MASTER,path:EP,agent:agent},x=>{
    let buf='';x.on('data',c=>buf+=c);
    x.on('end',()=>res({ok:x.statusCode===200,ms:Date.now()-s,bytes:buf.length}));
  });
  r.on('error',()=>res({ok:false,ms:Date.now()-s}));
  r.setTimeout(5000,()=>{r.destroy();res({ok:false,ms:Date.now()-s,timeout:true});});
});}
function adaptYield(latMs){
  if(latMs>TARGET_LAT_MS*1.5) yieldUs=Math.min(yieldUs*1.5,YIELD_MAX_MS*1000);
  else if(latMs>TARGET_LAT_MS) yieldUs=Math.min(yieldUs*1.1,YIELD_MAX_MS*1000);
  else if(latMs<TARGET_LAT_MS*0.5) yieldUs=Math.max(yieldUs*0.9,YIELD_MIN_US);
}
let lastReport=Date.now();
function report(){
  const now=Date.now();
  if(now-lastReport<3000) return;
  const elapsed=((now-t0)/1000).toFixed(1);
  const rate=(opsOK/(now-t0)*1000).toFixed(0);
  const avgLat=opsOK?(latSum/opsOK).toFixed(1):0;
  console.log(`[${elapsed}s] ops=${opsOK} rate=${rate}/s avgLat=${avgLat}ms maxLat=${latMax}ms yield=${(yieldUs/1000).toFixed(1)}ms KO=${opsKO}`);
  lastReport=now;
}
(async()=>{
  console.log(`=== μ-INJECTION PURE ===`);
  console.log(`Duration: ${DURATION_S}s, target lat: ${TARGET_LAT_MS}ms, EP: ${EP}`);
  console.log(`Socket: keep-alive (1 conn), mode: sequential μ-packet adaptive`);
  console.log(``);
  while((Date.now()-t0)/1000<DURATION_S){
    const r=await call();
    if(r.ok){
      opsOK++;latSum+=r.ms;
      if(r.ms>latMax)latMax=r.ms;
      if(r.ms<latMin)latMin=r.ms;
      if(opsOK%100===0)latHist.push(r.ms);
      adaptYield(r.ms);
    }else{
      opsKO++;
      yieldUs=Math.min(yieldUs*2,YIELD_MAX_MS*1000);
    }
    report();
    if(yieldUs>=1000) await sleep(yieldUs/1000);
    else await sleepUs(yieldUs);
  }
  const dur=((Date.now()-t0)/1000).toFixed(2);
  const tot=opsOK+opsKO;
  const sorted=[...latHist].sort((a,b)=>a-b);
  const p50=sorted[Math.floor(sorted.length*0.5)]||0;
  const p95=sorted[Math.floor(sorted.length*0.95)]||0;
  const p99=sorted[Math.floor(sorted.length*0.99)]||0;
  console.log(``);
  console.log(`=== μ-VERDICT ===`);
  console.log(`Duration : ${dur}s`);
  console.log(`Ops OK   : ${opsOK}`);
  console.log(`Ops KO   : ${opsKO}`);
  console.log(`Ops/sec  : ${(opsOK/dur).toFixed(0)}`);
  console.log(`Success% : ${tot?(opsOK/tot*100).toFixed(2):0}`);
  console.log(`Lat min  : ${latMin}ms`);
  console.log(`Lat avg  : ${opsOK?(latSum/opsOK).toFixed(2):0}ms`);
  console.log(`Lat p50  : ${p50}ms`);
  console.log(`Lat p95  : ${p95}ms`);
  console.log(`Lat p99  : ${p99}ms`);
  console.log(`Lat max  : ${latMax}ms`);
  console.log(`Yield fin: ${(yieldUs/1000).toFixed(2)}ms`);
  process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
