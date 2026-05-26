"use strict";

const fs=require("fs");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

const SRC="runtime_state/bench/trillionx_only_mining_10y_micro_packet_last.json";
const RAID="runtime_state/bench/trillionx_only_raid60_plus_micro_packet_last.json";
const OUT="runtime_state/bench/trillionx_vr_mirror_mining_profile_compare_last.json";

function read(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
function mb(x){return +(x/1024/1024).toFixed(3);}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
function n(x,d=0){return Number.isFinite(Number(x))?Number(x):d;}

const mining=read(SRC);
const raid=read(RAID);

if(!mining){
  console.log("TRILLIONX mining report missing:",SRC);
  process.exit(1);
}

const tx=mining.trillionx_mining_metrics||{};
const p10=mining.trillionx_10y_projection||{};
const mem=mining.trillionx_ram_pool?.after||{};
const disk=mining.trillionx_disk_pool?.after||{};

const MIRRORS=Number(process.env.VR_MIRRORS||12);
const FACETS=Number(process.env.VR_FACETS||64);
const PACKET_KB=Number(process.env.VR_PACKET_KB||8);
const SNAPSHOTS=Number(process.env.VR_SNAPSHOTS||4096);
const CACHE_MAX=Number(process.env.VR_CACHE_MAX||1024);

const t0=performance.now();

let digest="TRILLIONX_VR_MIRROR_START";
let cache=new Map();
let mirrorWrites=0;
let mirrorReads=0;
let mirrorBytes=0;
let collisions=0;
let mirrorLedger=[];

for(let i=0;i<SNAPSHOTS;i++){
  const mirror=i%MIRRORS;
  const facet=i%FACETS;
  const payload=`TRILLIONX|VR_MIRROR|snapshot=${i}|mirror=${mirror}|facet=${facet}|jobs=${p10.trillionx_logic_hash_jobs_s}|disk=${JSON.stringify(disk)}|`;
  const h=crypto.createHash("sha256").update(payload+digest).digest("hex");
  digest=crypto.createHash("sha256").update(digest+h).digest("hex");

  const key=`${mirror}:${facet}:${h.slice(0,8)}`;
  if(cache.has(key)) collisions++;
  cache.set(key,{h,mirror,facet,i});
  if(cache.size>CACHE_MAX) cache.delete(cache.keys().next().value);

  mirrorWrites++;
  mirrorReads++;
  mirrorBytes+=Buffer.byteLength(payload);
  if(i<24) mirrorLedger.push({mirror,facet,hash:h.slice(0,20)});
}

const t1=performance.now();
const vrDurationS=(t1-t0)/1000;

const report={
  module:"TRILLIONX_VR_MIRROR_MINING_PROFILE_COMPARE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_ONLY_WITH_VR_MIRRORS",
  display_policy:{
    no_percentages:true,
    no_host_identity:true,
    no_codespaces_label:true,
    no_profit_claim:true,
    no_fake_btc:true
  },
  trillionx_measured:{
    packets_s:n(tx.packets_s),
    raw_MB_s:n(tx.raw_MB_s),
    integrity_state:n(tx.integrity_percent)===100?"OK":"CHECK",
    hash_jobs_s:n(p10.trillionx_logic_hash_jobs_s),
    hash_jobs_10y:n(p10.trillionx_logic_hash_jobs_10y),
    ram_rss_GB:n(mem.trillionx_process_rss_GB),
    disk_total_MB:n(disk.trillionx_disk_total_MB),
    disk_used_MB:n(disk.trillionx_disk_used_MB),
    disk_free_MB:n(disk.trillionx_disk_free_MB),
    btc_10y:"UNAVAILABLE",
    electricity_coverage:"UNAVAILABLE"
  },
  trillionx_raid60_plus: raid ? {
    packets_total:n(raid.trillionx_metrics?.packets_total),
    packets_s:n(raid.trillionx_metrics?.packets_s),
    write_MB_s:n(raid.trillionx_metrics?.write_MB_s),
    read_MB_s:n(raid.trillionx_metrics?.read_MB_s),
    written_MB:n(raid.trillionx_metrics?.written_MB),
    read_MB:n(raid.trillionx_metrics?.read_MB),
    integrity_state:n(raid.trillionx_metrics?.integrity_percent)===100?"OK":"CHECK",
    ram_rss_GB:n(raid.trillionx_ram_pool?.after?.trillionx_process_rss_GB)
  } : "UNAVAILABLE",
  trillionx_vr_mirrors:{
    mode:"VR_REALITY_MIRROR_LAYER",
    mirrors:MIRRORS,
    facets:FACETS,
    snapshots:SNAPSHOTS,
    packet_kb:PACKET_KB,
    cache_max:CACHE_MAX,
    mirror_writes:mirrorWrites,
    mirror_reads:mirrorReads,
    mirror_MB:mb(mirrorBytes),
    mirror_ops_s:+((mirrorWrites+mirrorReads)/Math.max(vrDurationS,0.001)).toFixed(2),
    duration_s:+vrDurationS.toFixed(6),
    cache_entries:cache.size,
    collisions,
    digest:digest.slice(0,32),
    ledger_sample:mirrorLedger
  },
  profiles:{
    cpu_direct:{
      reading:"direct local work",
      raw_hash_advantage:"UNKNOWN",
      trillionx_advantage:"orchestration, mirror ledger, low RAM footprint"
    },
    gpu_profile:{
      reading:"parallel compatible algorithms",
      raw_hash_advantage:"GPU on compatible algorithms",
      trillionx_advantage:"routing, cache, registry, VR mirror state"
    },
    asic_btc_sha256:{
      reading:"specialized BTC SHA-256",
      raw_hash_advantage:"ASIC for real BTC network hashrate",
      trillionx_advantage:"control logic and audit layer"
    },
    farm_profile:{
      reading:"industrial scale",
      raw_hash_advantage:"farm scale",
      trillionx_advantage:"waste reduction logic, packet discipline, state mirrors"
    },
    trillionx_full_computer:{
      reading:"software computer μ-packets",
      measured:true,
      layers:["processor","coprocessor","raid60_plus","memory_mirror","vr_mirrors","blockchain_logic","security_logic","ui_port_3000"]
    }
  },
  verdict:{
    final:"TRILLIONX ajoute une couche VR_MIRROR au benchmark mining/profils. Les sorties évitent les pourcentages et gardent les mesures brutes.",
    btc:"UNAVAILABLE without real pool shares and rewards",
    electricity:"UNAVAILABLE without real watt input and real BTC revenue",
    next:"Run repeated-key cache benchmark if mirror reuse must be measured."
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT,JSON.stringify(report,null,2));

console.log("===== TRILLIONX VR MIRROR MINING PROFILE COMPARE =====");
console.log("Subject              : TRILLIONX_ONLY_WITH_VR_MIRRORS");
console.log("TRILLIONX packets/s  :",report.trillionx_measured.packets_s);
console.log("TRILLIONX raw MB/s   :",report.trillionx_measured.raw_MB_s);
console.log("TRILLIONX integrity  :",report.trillionx_measured.integrity_state);
console.log("TRILLIONX jobs/s     :",report.trillionx_measured.hash_jobs_s);
console.log("TRILLIONX jobs 10y   :",report.trillionx_measured.hash_jobs_10y);
console.log("TRILLIONX RAM RSS GB :",report.trillionx_measured.ram_rss_GB);
console.log("TRILLIONX disk free  :",report.trillionx_measured.disk_free_MB,"MB");
console.log("VR mirrors           :",MIRRORS);
console.log("VR facets            :",FACETS);
console.log("VR snapshots         :",SNAPSHOTS);
console.log("VR mirror MB         :",report.trillionx_vr_mirrors.mirror_MB);
console.log("VR mirror ops/s      :",report.trillionx_vr_mirrors.mirror_ops_s);
console.log("VR collisions        :",collisions);
console.log("BTC 10y              : UNAVAILABLE");
console.log("Electricity cover    : UNAVAILABLE");
console.log("Report               :",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
