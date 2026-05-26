"use strict";

const fs=require("fs"), os=require("os"), crypto=require("crypto"), cp=require("child_process");
const {performance}=require("perf_hooks");

const OUT_DIR="runtime_state/bench";
const OUT_FILE=`${OUT_DIR}/trillionx_only_mining_10y_micro_packet_last.json`;

const PACKET_KB=Number(process.env.PACKET_KB||8);
const PACKETS=Number(process.env.PACKETS||90000);
const CACHE_MAX=Number(process.env.CACHE_MAX||2048);
const CHECKPOINT_EVERY=Number(process.env.CHECKPOINT_EVERY||10000);
const MAX_WRITE_MB=Number(process.env.MAX_WRITE_MB||256);

const BTC_PRICE_EUR=Number(process.env.BTC_PRICE_EUR||0);
const ELECTRICITY_EUR_KWH=Number(process.env.ELECTRICITY_EUR_KWH||0);
const TRILLIONX_WATT=Number(process.env.TRILLIONX_WATT||0);

function sh(cmd){
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5000}).trim();}
  catch{return "UNAVAILABLE";}
}
function mb(x){return +(x/1024/1024).toFixed(3);}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
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

const TMP_DIR="runtime_state/trillionx_only_mining_10y_packets";
fs.rmSync(TMP_DIR,{recursive:true,force:true});
fs.mkdirSync(TMP_DIR,{recursive:true});

const beforeDisk=diskPool();
const beforeRam={
  trillionx_ram_total_GB:gb(os.totalmem()),
  trillionx_ram_free_GB:gb(os.freemem()),
  trillionx_ram_used_GB:gb(os.totalmem()-os.freemem())
};

const packetBytes=PACKET_KB*1024;
const realPackets=Math.min(PACKETS,Math.max(1,Math.floor((MAX_WRITE_MB*1024*1024)/packetBytes)));

let accepted=0, rejected=0, cacheHit=0, cacheMiss=0, written=0;
let digest="TRILLIONX_MINING_10Y_START";
const cache=new Map();
const checkpoints=[];

const t0=performance.now();

for(let i=0;i<realPackets;i++){
  const payload=Buffer.allocUnsafe(packetBytes);
  const header=`TRILLIONX_ONLY|MINING_10Y|μ|packet=${i}|`;
  const seed=crypto.createHash("sha256").update(header+digest).digest();
  for(let p=0;p<packetBytes;p+=seed.length) seed.copy(payload,p);
  payload.write(header,0,"utf8");

  const h=crypto.createHash("sha256").update(payload).digest("hex");
  digest=crypto.createHash("sha256").update(digest+h).digest("hex");

  const key=h.slice(0,12);
  if(cache.has(key)) cacheHit++; else cacheMiss++;
  cache.set(key,true);
  if(cache.size>CACHE_MAX) cache.delete(cache.keys().next().value);

  try{
    fs.appendFileSync(`${TMP_DIR}/trillionx_mining_packets.bin`,payload);
    accepted++;
    written+=payload.length;
  }catch{
    rejected++;
  }

  if((i+1)%CHECKPOINT_EVERY===0){
    checkpoints.push({
      trillionx_packet:i+1,
      accepted,
      rejected,
      cache_size:cache.size,
      digest:digest.slice(0,24)
    });
  }
}

const t1=performance.now();
const durationS=(t1-t0)/1000;
const packetsS=+(realPackets/Math.max(durationS,0.001)).toFixed(2);
const rawMBS=+(mb(written)/Math.max(durationS,0.001)).toFixed(2);

// Lecture mining logique : hash-jobs TRILLIONX locaux, pas shares réseau.
const trillionx_logic_hash_jobs_s=packetsS;
const seconds10y=10*365.25*24*3600;
const trillionx_logic_hash_jobs_10y=Math.round(trillionx_logic_hash_jobs_s*seconds10y);

// BTC réel volontairement indisponible sans pool/shares/reward.
const btcEstimate={
  btc_10y:"UNAVAILABLE",
  reason:"TRILLIONX_ONLY ne fournit ici aucune share pool, aucun reward réseau, aucun wallet, donc pas de BTC inventé.",
  btc_price_eur_input:BTC_PRICE_EUR>0?BTC_PRICE_EUR:"UNAVAILABLE",
  allowed:"Comparer la logique hash-jobs TRILLIONX, pas déclarer un revenu BTC."
};

// Couverture électrique seulement si watts + prix kWh sont donnés.
let electricity={
  trillionx_watt_input:TRILLIONX_WATT>0?TRILLIONX_WATT:"UNAVAILABLE",
  electricity_eur_kwh_input:ELECTRICITY_EUR_KWH>0?ELECTRICITY_EUR_KWH:"UNAVAILABLE",
  kwh_10y:"UNAVAILABLE",
  cost_10y_eur:"UNAVAILABLE",
  coverage_by_btc:"UNAVAILABLE",
  reason:"Couverture BTC impossible sans BTC réel mesuré."
};
if(TRILLIONX_WATT>0 && ELECTRICITY_EUR_KWH>0){
  const kwh=+(TRILLIONX_WATT*seconds10y/3600/1000).toFixed(2);
  electricity.kwh_10y=kwh;
  electricity.cost_10y_eur=+(kwh*ELECTRICITY_EUR_KWH).toFixed(2);
}

const afterDisk=diskPool();
const afterRam={
  trillionx_ram_total_GB:gb(os.totalmem()),
  trillionx_ram_free_GB:gb(os.freemem()),
  trillionx_ram_used_GB:gb(os.totalmem()-os.freemem()),
  trillionx_process_rss_GB:gb(process.memoryUsage().rss)
};

const portRaw=sh("ss -lntp | grep ':3000' || true");
const port3000=portRaw&&portRaw!=="UNAVAILABLE"?"TRILLIONX_PORT_3000_ACTIVE_OR_LISTED":"TRILLIONX_PORT_3000_UNAVAILABLE";

const healthNotes=[];
let health=100;
if(rejected>0){health-=20;healthNotes.push("TRILLIONX_REJECTED_PACKETS");}
if(afterDisk.trillionx_disk_free_MB<1024){health-=15;healthNotes.push("TRILLIONX_DISK_POOL_LOW");}
if(afterRam.trillionx_ram_free_GB<1){health-=10;healthNotes.push("TRILLIONX_RAM_POOL_LOW");}
if(port3000.includes("UNAVAILABLE")){health-=10;healthNotes.push("TRILLIONX_PORT_3000_NOT_LISTED");}
if(cacheHit===0) healthNotes.push("TRILLIONX_CACHE_UNIQUE_STREAM_NO_HIT");

const report={
  module:"TRILLIONX_ONLY_MINING_10Y_MICRO_PACKET_BENCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject_measured:"TRILLIONX_ONLY",
  benchmark_identity:"TRILLIONX_MINING_10Y_μ_PACKET_BENCH",
  terminology:{
    no_codespaces_label:true,
    no_host_identity:true,
    no_cpu_identity:true,
    no_power_word:true,
    subject:"TRILLIONX seulement"
  },
  safety:{
    real_pool:false,
    wallet:false,
    transaction:false,
    btc_profit_claim:false,
    network_mining_claim:false,
    local_logic_benchmark_only:true
  },
  config:{
    packet_kb:PACKET_KB,
    requested_packets:PACKETS,
    trillionx_packets_executed:realPackets,
    cache_max:CACHE_MAX,
    max_write_MB:MAX_WRITE_MB
  },
  trillionx_mining_metrics:{
    duration_s:+durationS.toFixed(4),
    packets_s:packetsS,
    raw_MB_s:rawMBS,
    accepted,
    rejected,
    integrity_percent:+((accepted/Math.max(realPackets,1))*100).toFixed(4),
    cache_hit_percent:+((cacheHit/Math.max(cacheHit+cacheMiss,1))*100).toFixed(4),
    written_MB:mb(written),
    digest:digest.slice(0,32)
  },
  trillionx_10y_projection:{
    period:"10_years_continuous_estimate",
    basis:"TRILLIONX local μ-packet mining logic benchmark",
    trillionx_logic_hash_jobs_s,
    trillionx_logic_hash_jobs_10y,
    reading:"Projection logique TRILLIONX sur 10 ans, pas revenu BTC."
  },
  btc_estimation:btcEstimate,
  electricity_coverage:electricity,
  trillionx_disk_pool:{before:beforeDisk,after:afterDisk},
  trillionx_ram_pool:{before:beforeRam,after:afterRam},
  trillionx_port_3000:port3000,
  trillionx_checkpoints:checkpoints,
  trillionx_health:{
    score:Math.max(0,health),
    status:health>=85?"TRILLIONX_MINING_BENCH_GOOD":health>=65?"TRILLIONX_MINING_BENCH_WATCH":"TRILLIONX_MINING_BENCH_RISK",
    notes:healthNotes
  },
  verdict:{
    final:"TRILLIONX_ONLY mesure une logique mining μ-packets sur 10 ans en projection. BTC et couverture électrique restent indisponibles sans données réelles de pool/reward/watts.",
    no_fake_btc:true,
    no_fake_profit:true
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));

console.log("===== TRILLIONX ONLY MINING 10Y μ-PACKET BENCH =====");
console.log("Subject                    : TRILLIONX_ONLY");
console.log("TRILLIONX packets          :", realPackets);
console.log("TRILLIONX packets/s        :", packetsS);
console.log("TRILLIONX raw MB/s         :", rawMBS);
console.log("TRILLIONX integrity        :", report.trillionx_mining_metrics.integrity_percent,"%");
console.log("TRILLIONX hash-jobs/s      :", trillionx_logic_hash_jobs_s);
console.log("TRILLIONX hash-jobs 10y    :", trillionx_logic_hash_jobs_10y);
console.log("BTC 10y                    :", btcEstimate.btc_10y);
console.log("Electricity coverage       :", electricity.coverage_by_btc);
console.log("TRILLIONX RAM RSS          :", afterRam.trillionx_process_rss_GB,"GB");
console.log("TRILLIONX disk before      :", JSON.stringify(beforeDisk));
console.log("TRILLIONX disk after       :", JSON.stringify(afterDisk));
console.log("TRILLIONX port 3000        :", port3000);
console.log("TRILLIONX health           :", report.trillionx_health.status, report.trillionx_health.score);
console.log("Report                     :", OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
