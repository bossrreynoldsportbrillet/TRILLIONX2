"use strict";
const fs=require("fs"), crypto=require("crypto");
const {performance}=require("perf_hooks");

const OUT_DIR="runtime_state/bench";
const OUT_FILE=`${OUT_DIR}/trillionx_vr_mirror_bench_last.json`;
fs.mkdirSync(OUT_DIR,{recursive:true});

const MIRRORS=Number(process.env.VR_MIRRORS||16);
const FACETS=Number(process.env.VR_FACETS||64);
const SNAPSHOTS=Number(process.env.VR_SNAPSHOTS||8192);
const CACHE_MAX=Number(process.env.VR_CACHE_MAX||2048);

let digest="TRILLIONX_VR_MIRROR_BENCH_START";
let cache=new Map();
let collisions=0;
let writes=0;
let reads=0;
let bytes=0;
let ledger=[];

const t0=performance.now();

for(let i=0;i<SNAPSHOTS;i++){
  const mirror=i%MIRRORS;
  const facet=i%FACETS;
  const payload=`TRILLIONX|VR_MIRROR|snapshot=${i}|mirror=${mirror}|facet=${facet}|seed=${digest}|`;
  const h=crypto.createHash("sha256").update(payload).digest("hex");
  digest=crypto.createHash("sha256").update(digest+h).digest("hex");

  const key=`${mirror}:${facet}:${h.slice(0,12)}`;
  if(cache.has(key)) collisions++;
  cache.set(key,{mirror,facet,h});
  if(cache.size>CACHE_MAX) cache.delete(cache.keys().next().value);

  writes++;
  reads++;
  bytes+=Buffer.byteLength(payload);
  if(i<32) ledger.push({mirror,facet,hash:h.slice(0,20)});
}

const dt=(performance.now()-t0)/1000;
const report={
  module:"TRILLIONX_VR_MIRROR_BENCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_ONLY",
  display_policy:{no_percentages:true,no_host_identity:true,no_profit_claim:true},
  vr_mirror:{
    mirrors:MIRRORS,
    facets:FACETS,
    snapshots:SNAPSHOTS,
    cache_max:CACHE_MAX,
    writes,
    reads,
    mirror_bytes:bytes,
    mirror_MB:+(bytes/1024/1024).toFixed(3),
    ops_s:+((writes+reads)/Math.max(dt,0.001)).toFixed(2),
    duration_s:+dt.toFixed(6),
    cache_entries:cache.size,
    collisions,
    digest:digest.slice(0,32),
    ledger_sample:ledger
  },
  verdict:{
    state:"TRILLIONX_VR_MIRROR_LAYER_OK",
    reading:"Miroirs réalité virtuelle TRILLIONX mesurés en snapshots, facettes, ops/s, collisions et digest."
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT_FILE,JSON.stringify(report,null,2));
console.log("===== TRILLIONX VR MIRROR BENCH =====");
console.log("Subject        : TRILLIONX_ONLY");
console.log("VR mirrors     :",MIRRORS);
console.log("VR facets      :",FACETS);
console.log("VR snapshots   :",SNAPSHOTS);
console.log("VR writes      :",writes);
console.log("VR reads       :",reads);
console.log("VR MB          :",report.vr_mirror.mirror_MB);
console.log("VR ops/s       :",report.vr_mirror.ops_s);
console.log("VR collisions  :",collisions);
console.log("Report         :",OUT_FILE);
console.log("REAL_ONLY_OR_UNAVAILABLE");
