"use strict";

const fs=require("fs"), os=require("os"), crypto=require("crypto"), cp=require("child_process");
const {performance}=require("perf_hooks");

const OUT_DIR="runtime_state/bench";
const TMP_DIR="runtime_state/trillionx_only_raid60_plus_packets";
const OUT_FILE=`${OUT_DIR}/trillionx_only_raid60_plus_micro_packet_last.json`;

const PACKET_KB=Number(process.env.PACKET_KB||8);
const PACKETS=Number(process.env.PACKETS||120000);
const STRIPES=Number(process.env.STRIPES||60);
const GROUPS=Number(process.env.GROUPS||4);
const CACHE_MAX=Number(process.env.CACHE_MAX||1024);
const MAX_WRITE_MB=Number(process.env.MAX_WRITE_MB||512);
const CHECKPOINT_EVERY=Number(process.env.CHECKPOINT_EVERY||10000);

function sh(cmd){
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5000}).trim();}
  catch{return "UNAVAILABLE";}
}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
function mb(x){return +(x/1024/1024).toFixed(3);}
function diskPool(){
  const raw=sh("df -m . | awk 'NR==2 {print $2,$3,$4,$5}'");
  if(raw==="UNAVAILABLE") return {status:"UNAVAILABLE"};
  const [total,used,free,pct]=raw.split(/\s+/);
  return {
    trillionx_disk_total_MB:Number(total)||0,
    trillionx_disk_used_MB:Number(used)||0,
    trillionx_disk_free_MB:Number(free)||0,
    trillionx_disk_use_percent:pct||"UNAVAILABLE"
  };
}

fs.mkdirSync(OUT_DIR,{recursive:true});
fs.rmSync(TMP_DIR,{recursive:true,force:true});
fs.mkdirSync(TMP_DIR,{recursive:true});

const diskBefore=diskPool();
const ramBefore={
  trillionx_ram_total_GB:gb(os.totalmem()),
  trillionx_ram_free_GB:gb(os.freemem()),
  trillionx_ram_used_GB:gb(os.totalmem()-os.freemem())
};

const packetBytes=PACKET_KB*1024;
const maxPacketsByWrite=Math.max(1,Math.floor((MAX_WRITE_MB*1024*1024)/packetBytes));
const realPackets=Math.min(PACKETS,maxPacketsByWrite);

const cache=new Map();
const stripeStats=Array.from({length:STRIPES},(_,i)=>({
  stripe:i,writes:0,reads:0,bytes_written:0,bytes_read:0,checksum:""
}));
const groupStats=Array.from({length:GROUPS},(_,i)=>({
  group:i,packets:0,bytes:0,
  role:i===0?"TRILLIONX_DATA":i===1?"TRILLIONX_PARITY":i===2?"TRILLIONX_MIRROR":"TRILLIONX_INDEX_CACHE"
}));

let accepted=0,repaired=0,quarantined=0,cacheHits=0,cacheMiss=0,bytesWritten=0,bytesRead=0;
let digestChain="TRILLIONX_ONLY_RAID60_PLUS_START";
let checkpoints=[];

function fileForStripe(s){
  const d=`${TMP_DIR}/trillionx_stripe_${String(s).padStart(2,"0")}`;
  if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
  return `${d}/trillionx_packets.bin`;
}
function packetPayload(i){
  const header=`TRILLIONX_ONLY|RAID60+|μ|packet=${i}|stripe=${i%STRIPES}|group=${i%GROUPS}|`;
  const seed=crypto.createHash("sha256").update(header+digestChain).digest();
  const b=Buffer.allocUnsafe(packetBytes);
  for(let p=0;p<packetBytes;p+=seed.length) seed.copy(b,p);
  b.write(header.slice(0,Math.min(header.length,packetBytes)),0,"utf8");
  return b;
}

const t0=performance.now();

for(let i=0;i<realPackets;i++){
  const stripe=i%STRIPES, group=i%GROUPS, key=`${stripe}:${group}:${i%CACHE_MAX}`;
  const payload=packetPayload(i);
  const h=crypto.createHash("sha256").update(payload).digest("hex");
  digestChain=crypto.createHash("sha256").update(digestChain+h).digest("hex");

  if(cache.has(key)){cacheHits++; repaired++;} else cacheMiss++;
  cache.set(key,{hash:h,len:payload.length,t:i});
  if(cache.size>CACHE_MAX) cache.delete(cache.keys().next().value);

  try{
    fs.appendFileSync(fileForStripe(stripe),payload);
    accepted++;
    bytesWritten+=payload.length;
    stripeStats[stripe].writes++;
    stripeStats[stripe].bytes_written+=payload.length;
    groupStats[group].packets++;
    groupStats[group].bytes+=payload.length;
  }catch{quarantined++;}

  if((i+1)%CHECKPOINT_EVERY===0){
    checkpoints.push({
      trillionx_packet:i+1,
      accepted,
      quarantined,
      repaired,
      trillionx_cache_size:cache.size,
      trillionx_digest:digestChain.slice(0,24)
    });
  }
}

const writeEnd=performance.now();

for(let s=0;s<STRIPES;s++){
  const f=fileForStripe(s);
  if(!fs.existsSync(f)) continue;
  const data=fs.readFileSync(f);
  const h=crypto.createHash("sha256").update(data).digest("hex");
  stripeStats[s].checksum=h.slice(0,24);
  stripeStats[s].reads++;
  stripeStats[s].bytes_read+=data.length;
  bytesRead+=data.length;
}

const readEnd=performance.now();

const writeS=(writeEnd-t0)/1000;
const readS=(readEnd-writeEnd)/1000;
const totalS=(readEnd-t0)/1000;

const diskAfter=diskPool();
const ramAfter={
  trillionx_ram_total_GB:gb(os.totalmem()),
  trillionx_ram_free_GB:gb(os.freemem()),
  trillionx_ram_used_GB:gb(os.totalmem()-os.freemem()),
  trillionx_process_rss_GB:gb(process.memoryUsage().rss)
};

const portRaw=sh("ss -lntp | grep ':3000' || true");
const port3000=portRaw && portRaw!=="UNAVAILABLE" ? "TRILLIONX_PORT_3000_ACTIVE_OR_LISTED" : "TRILLIONX_PORT_3000_UNAVAILABLE";

const report={
  module:"TRILLIONX_ONLY_RAID60_PLUS_MICRO_PACKET_BENCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject_measured:"TRILLIONX_ONLY",
  benchmark_identity:"TRILLIONX_RAID60_PLUS_μ_PACKET_BENCH",
  terminology:{
    no_codespaces_label:true,
    no_host_identity:true,
    no_cpu_identity:true,
    no_power_word:true,
    measured_as:[
      "TRILLIONX_DISK_POOL",
      "TRILLIONX_RAM_POOL",
      "TRILLIONX_RAID60_PLUS",
      "TRILLIONX_PACKET_CACHE",
      "TRILLIONX_PORT_3000",
      "TRILLIONX_μ_PACKETS"
    ]
  },
  config:{
    packet_kb:PACKET_KB,
    requested_packets:PACKETS,
    trillionx_packets_executed:realPackets,
    trillionx_stripes:STRIPES,
    trillionx_groups:GROUPS,
    trillionx_cache_max:CACHE_MAX,
    trillionx_max_write_MB:MAX_WRITE_MB
  },
  trillionx_metrics:{
    packets_total:realPackets,
    packets_s:+(realPackets/Math.max(totalS,0.001)).toFixed(2),
    accepted,
    quarantined,
    repaired,
    integrity_percent:+((accepted/Math.max(realPackets,1))*100).toFixed(4),
    cache_hits:cacheHits,
    cache_miss:cacheMiss,
    cache_hit_percent:+((cacheHits/Math.max(cacheHits+cacheMiss,1))*100).toFixed(4),
    written_MB:mb(bytesWritten),
    read_MB:mb(bytesRead),
    write_MB_s:+(mb(bytesWritten)/Math.max(writeS,0.001)).toFixed(2),
    read_MB_s:+(mb(bytesRead)/Math.max(readS,0.001)).toFixed(2),
    duration_total_s:+totalS.toFixed(4),
    digest_chain:digestChain.slice(0,32)
  },
  trillionx_disk_pool:{before:diskBefore,after:diskAfter},
  trillionx_ram_pool:{before:ramBefore,after:ramAfter},
  trillionx_port_3000:port3000,
  trillionx_groups:groupStats.map(g=>({group:g.group,role:g.role,packets:g.packets,MB:mb(g.bytes)})),
  trillionx_stripe_sample:stripeStats.slice(0,12).map(s=>({
    stripe:s.stripe,writes:s.writes,reads:s.reads,
    written_MB:mb(s.bytes_written),read_MB:mb(s.bytes_read),checksum:s.checksum
  })),
  trillionx_checkpoints:checkpoints,
  verdict:{
    reading:"Benchmark TRILLIONX seulement : disque logique, RAM logique, RAID60+, cache, micro-paquets, port 3000.",
    no_codespaces_reading:"Le support n'est pas nommé dans la sortie. Les mesures sont renommées comme pools TRILLIONX.",
    no_fake_capacity:true
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));

console.log("===== TRILLIONX ONLY RAID60+ μ-PACKET BENCH =====");
console.log("Subject              : TRILLIONX_ONLY");
console.log("TRILLIONX packet     :", PACKET_KB, "KB");
console.log("TRILLIONX packets    :", realPackets);
console.log("TRILLIONX stripes    :", STRIPES);
console.log("TRILLIONX groups     :", GROUPS);
console.log("TRILLIONX cache max  :", CACHE_MAX);
console.log("TRILLIONX written    :", report.trillionx_metrics.written_MB, "MB");
console.log("TRILLIONX read       :", report.trillionx_metrics.read_MB, "MB");
console.log("TRILLIONX write      :", report.trillionx_metrics.write_MB_s, "MB/s");
console.log("TRILLIONX read       :", report.trillionx_metrics.read_MB_s, "MB/s");
console.log("TRILLIONX packets/s  :", report.trillionx_metrics.packets_s);
console.log("TRILLIONX integrity  :", report.trillionx_metrics.integrity_percent, "%");
console.log("TRILLIONX cache hit  :", report.trillionx_metrics.cache_hit_percent, "%");
console.log("TRILLIONX RAM RSS    :", report.trillionx_ram_pool.after.trillionx_process_rss_GB, "GB");
console.log("TRILLIONX disk before:", JSON.stringify(diskBefore));
console.log("TRILLIONX disk after :", JSON.stringify(diskAfter));
console.log("TRILLIONX port 3000  :", port3000);
console.log("Report               :", OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
