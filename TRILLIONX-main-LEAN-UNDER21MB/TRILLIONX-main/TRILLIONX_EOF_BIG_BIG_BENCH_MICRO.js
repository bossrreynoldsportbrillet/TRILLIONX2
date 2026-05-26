"use strict";
/*
TRILLIONX EOF BIG BIG BENCH μPACKETS
- Pas de faux hardware.
- Petits paquets pour éviter saturation Codespaces.
- Difficulté progressive.
- Déblocage DiCT x200 par paliers symboliques.
- Résultat complet JSON + résumé terminal.
*/

const fs=require("fs"),os=require("os"),crypto=require("crypto"),zlib=require("zlib");
const {performance}=require("perf_hooks");

const OUTDIR="runtime_state/eof_big_bench";
fs.mkdirSync(OUTDIR,{recursive:true});
const OUT=OUTDIR+"/last_result.json";

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>performance.now();
const gb=x=>+(x/1024/1024/1024).toFixed(3);
const mb=x=>+(x/1024/1024).toFixed(3);
const pct=x=>+(x*100).toFixed(3);

const STATE={
  name:"TRILLIONX_EOF_BIG_BIG_BENCH_MICRO",
  honesty:"REAL_MEASURED_OR_UNAVAILABLE",
  mission:"EOF_MAXI: sauver un mineur / enrichissement logique / débloquer DiCT par paliers",
  started:new Date().toISOString(),
  host:{
    platform:os.platform(),
    arch:os.arch(),
    cpus:os.cpus().length,
    cpu_model:os.cpus()[0]?.model||"unavailable",
    ram_gb:gb(os.totalmem()),
    node:process.version
  },
  packets:[],
  dict_unlocks:[],
  final:null
};

function addPacket(name,result){
  STATE.packets.push({name,ts:new Date().toISOString(),...result});
  fs.writeFileSync(OUT,JSON.stringify(STATE,null,2));
}

async function benchCPU(rounds){
  let x=0,a=1.000001,b=0.999999;
  const t0=now();
  for(let i=0;i<rounds;i++){
    x+=Math.sin(i%97)*Math.cos(i%89)+Math.sqrt((i%1000)+1)*a*b;
    if(i%250000===0) await sleep(0);
  }
  const ms=now()-t0;
  return {rounds,ms:+ms.toFixed(3),ops_per_s:+(rounds/(ms/1000)).toFixed(0),checksum:+x.toFixed(5)};
}

async function benchHash(blocks,size){
  const buf=crypto.randomBytes(size);
  let last="";
  const t0=now();
  for(let i=0;i<blocks;i++){
    last=crypto.createHash("sha256").update(buf).update(String(i)).digest("hex");
    if(i%500===0) await sleep(0);
  }
  const ms=now()-t0, bytes=blocks*size;
  return {algo:"sha256",blocks,size_bytes:size,total_mb:mb(bytes),ms:+ms.toFixed(3),mb_s:+(mb(bytes)/(ms/1000)).toFixed(3),last:last.slice(0,16)};
}

async function benchBigInt(rounds){
  let x=123456789123456789n,m=1000000007n;
  const t0=now();
  for(let i=0;i<rounds;i++){
    x=(x*1103515245n+12345n+BigInt(i))%m;
    if(i%50000===0) await sleep(0);
  }
  const ms=now()-t0;
  return {rounds,ms:+ms.toFixed(3),bigint_ops_s:+(rounds/(ms/1000)).toFixed(0),checksum:String(x)};
}

async function benchCompress(kb){
  const raw=Buffer.alloc(kb*1024);
  for(let i=0;i<raw.length;i++) raw[i]=(i*31+i%251)&255;
  const t0=now();
  const gz=zlib.gzipSync(raw,{level:6});
  const t1=now();
  const un=zlib.gunzipSync(gz);
  const t2=now();
  return {
    raw_mb:mb(raw.length),
    gz_mb:mb(gz.length),
    ratio:+(gz.length/raw.length).toFixed(5),
    gzip_ms:+(t1-t0).toFixed(3),
    gunzip_ms:+(t2-t1).toFixed(3),
    ok:un.length===raw.length
  };
}

async function benchJSON(items){
  const arr=[];
  for(let i=0;i<items;i++) arr.push({i,v:"TRILLIONX_"+i,h:crypto.createHash("md5").update(""+i).digest("hex")});
  const t0=now();
  const s=JSON.stringify(arr);
  const t1=now();
  const back=JSON.parse(s);
  const t2=now();
  return {items,json_mb:mb(Buffer.byteLength(s)),stringify_ms:+(t1-t0).toFixed(3),parse_ms:+(t2-t1).toFixed(3),ok:back.length===items};
}

async function benchIO(files,kb){
  const dir=OUTDIR+"/io";
  fs.mkdirSync(dir,{recursive:true});
  const buf=crypto.randomBytes(kb*1024);
  const t0=now();
  for(let i=0;i<files;i++){
    fs.writeFileSync(`${dir}/p_${i}.bin`,buf);
    if(i%10===0) await sleep(0);
  }
  const t1=now();
  let sum=0;
  for(let i=0;i<files;i++) sum+=fs.readFileSync(`${dir}/p_${i}.bin`).length;
  const t2=now();
  return {
    files,kb_each:kb,total_mb:mb(sum),
    write_ms:+(t1-t0).toFixed(3),
    read_ms:+(t2-t1).toFixed(3),
    write_mb_s:+(mb(sum)/((t1-t0)/1000)).toFixed(3),
    read_mb_s:+(mb(sum)/((t2-t1)/1000)).toFixed(3)
  };
}

async function benchEventLoop(samples){
  const delays=[];
  for(let i=0;i<samples;i++){
    const t=now();
    await sleep(0);
    delays.push(now()-t);
  }
  delays.sort((a,b)=>a-b);
  const q=p=>+delays[Math.floor(delays.length*p)].toFixed(4);
  return {samples,p50_ms:q(.5),p95_ms:q(.95),p99_ms:q(.99),max_ms:+delays.at(-1).toFixed(4)};
}

async function benchScheduler(jobs){
  let done=0,acc=0;
  const t0=now();
  const run=async id=>{
    let x=id;
    for(let i=0;i<3000;i++) x=(x*1664525+1013904223)>>>0;
    acc^=x; done++;
  };
  for(let i=0;i<jobs;i++){
    run(i);
    if(i%50===0) await sleep(0);
  }
  const ms=now()-t0;
  return {jobs,done,ms:+ms.toFixed(3),jobs_s:+(jobs/(ms/1000)).toFixed(0),checksum:acc};
}

function unlock(score,stage){
  const level=Math.max(1,Math.floor(score/200));
  const dicts=level*200;
  const obj={
    stage,
    score:+score.toFixed(2),
    unlocked_dicts:dicts,
    difficulty_next:`x${Math.min(2000,level*200)}`,
    status:score>1200?"OMEGA_DIFFICULTY":score>700?"HARD_UNLOCK":"BASE_UNLOCK"
  };
  STATE.dict_unlocks.push(obj);
  return obj;
}

async function main(){
  console.log("=== TRILLIONX EOF BIG BIG BENCH μPACKETS ===");
  const stages=[
    {name:"μ1 CPU logique",fn:()=>benchCPU(800000)},
    {name:"μ2 SHA256 mineur",fn:()=>benchHash(2500,4096)},
    {name:"μ3 BigInt arithmétique",fn:()=>benchBigInt(250000)},
    {name:"μ4 Compression mémoire",fn:()=>benchCompress(4096)},
    {name:"μ5 JSON dictionnaires",fn:()=>benchJSON(35000)},
    {name:"μ6 I/O fragments",fn:()=>benchIO(60,128)},
    {name:"μ7 Event-loop latence",fn:()=>benchEventLoop(120)},
    {name:"μ8 Scheduler jobs",fn:()=>benchScheduler(2500)}
  ];

  for(let i=0;i<stages.length;i++){
    const s=stages[i];
    console.log("\nRUN",s.name);
    const mem0=process.memoryUsage();
    const r=await s.fn();
    const mem1=process.memoryUsage();
    r.mem_before_mb=mb(mem0.rss);
    r.mem_after_mb=mb(mem1.rss);
    r.mem_delta_mb=+(r.mem_after_mb-r.mem_before_mb).toFixed(3);
    addPacket(s.name,r);

    const partialScore =
      (r.ops_per_s||0)/100000 +
      (r.mb_s||0)*2 +
      (r.bigint_ops_s||0)/80000 +
      (r.write_mb_s||0)/5 +
      (r.read_mb_s||0)/5 +
      (r.jobs_s||0)/2000 +
      Math.max(0,80-(r.p95_ms||0)*10);

    const u=unlock(partialScore*(i+1),s.name);
    console.log("OK",JSON.stringify({packet:s.name,unlock:u},null,2));
    await sleep(100);
  }

  const P=STATE.packets;
  const totalScore=P.reduce((a,p)=>a+
    (p.ops_per_s||0)/100000+
    (p.mb_s||0)*2+
    (p.bigint_ops_s||0)/80000+
    (p.write_mb_s||0)/5+
    (p.read_mb_s||0)/5+
    (p.jobs_s||0)/2000+
    Math.max(0,80-(p.p95_ms||0)*10)
  ,0);

  const verdict =
    totalScore>1800 ? "TRILLIONX_DOMINANT_LOGIC_ORCHESTRATOR" :
    totalScore>1000 ? "TRILLIONX_STRONG_CODESPACE_NODE" :
    totalScore>500  ? "TRILLIONX_VALID_MICROBENCH_ENGINE" :
                       "TRILLIONX_BASELINE_NODE";

  STATE.final={
    ended:new Date().toISOString(),
    total_score:+totalScore.toFixed(2),
    verdict,
    mission_result: totalScore>1000 ? "MINEUR_SAUVE_ET_DICTS_DEBLOQUES" : "MISSION_PARTIELLE_CONTINUER_OPTIMISATION",
    max_dict_unlock:Math.max(...STATE.dict_unlocks.map(x=>x.unlocked_dicts)),
    packets_count:P.length,
    warnings:[
      "Codespaces mesure le node virtuel réel disponible, pas un CPU inventé.",
      "Score comparatif interne EOF, pas FLOPS HPC officiel.",
      "Chaque paquet est petit pour éviter saturation."
    ]
  };

  fs.writeFileSync(OUT,JSON.stringify(STATE,null,2));
  console.log("\n=== RESULTAT FINAL EOF ===");
  console.log(JSON.stringify(STATE.final,null,2));
  console.log("\nRapport complet:",OUT);
}
main().catch(e=>{
  console.error("EOF_BENCH_ERROR",e);
  process.exit(1);
});
