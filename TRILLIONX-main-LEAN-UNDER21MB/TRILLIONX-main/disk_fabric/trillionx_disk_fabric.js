"use strict";

/*
 TRILLIONX DISK FABRIC
 - disque réel Codespaces = mesuré par df
 - RAID60+ = logique/index/parité/miroirs
 - pas de faux stockage physique
 - micro-paquets / fichiers froids / résultats compacts
 - REAL_ONLY_OR_UNAVAILABLE
*/

const fs=require("fs");
const os=require("os");
const path=require("path");
const crypto=require("crypto");
const cp=require("child_process");

const ROOT=process.cwd();
const OUT=path.join(ROOT,"runtime_state/disk_fabric");

function ensure(p){fs.mkdirSync(p,{recursive:true});}
function sh(cmd,timeout=5000){
  try{return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();}
  catch{return "UNAVAILABLE";}
}
function sha(x){return crypto.createHash("sha256").update(String(x)).digest("hex");}

function diskReal(){
  const bm=sh("df -BM /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'");
  const bg=sh("df -BG /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'");
  const repo=sh("du -sh . 2>/dev/null | awk '{print $1}'");
  const inode=sh("df -ih /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'");
  return {
    source:"df/du real host",
    workspaces_mb:bm,
    workspaces_gb:bg,
    repo_size:repo,
    inodes:inode,
    physical_storage_claim:"REAL_HOST_ONLY"
  };
}

function diskMirrorIndex(){
  const logicalCapacityGB=2048;
  const stripes=16;
  const parityGroups=2;
  const mirrors=4;
  const blockLogicalGB=logicalCapacityGB/(stripes*parityGroups*mirrors);
  const blocks=[];

  for(let s=0;s<stripes;s++){
    for(let p=0;p<parityGroups;p++){
      for(let m=0;m<mirrors;m++){
        const id=`DRAID60P_S${String(s).padStart(2,"0")}_P${p}_M${m}`;
        blocks.push({
          id,
          stripe:s,
          parity_group:p,
          mirror:m,
          logical_size_gb:+blockLogicalGB.toFixed(3),
          allocation:"INDEX_ONLY_NOT_ALLOCATED",
          physical_disk_claim:false,
          checksum_seed:sha(id).slice(0,32)
        });
      }
    }
  }

  return {
    mode:"TRILLIONX_DISK_MIRROR_RAID60_PLUS",
    doctrine:"logical address space over real disk measurements",
    physical_disk_claim:false,
    logical_capacity_gb:logicalCapacityGB,
    stripes,
    parity_groups:parityGroups,
    mirrors,
    blocks_count:blocks.length,
    block_logical_gb:+blockLogicalGB.toFixed(3),
    write_policy:"compact_results_only",
    cold_memory_policy:"files_scripts_indexes",
    spill_policy:"bounded_runtime_state",
    blocks
  };
}

function classifyStorage(){
  return {
    hot_storage:"real /workspaces measured by df",
    cold_storage:"repo files, scripts, json, reports, runtime_state",
    logical_storage:"RAID60+ mirror index, no physical allocation",
    compute_policy:"micro-packets, never full-load huge files",
    result_policy:"compact summaries in runtime_state/disk_fabric"
  };
}

function buildReport(){
  ensure(OUT);
  const report={
    ok:true,
    module:"TRILLIONX_DISK_FABRIC",
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    time:new Date().toISOString(),
    port:process.env.PORT||"3000",
    real_disk:diskReal(),
    raid60_plus_mirror:diskMirrorIndex(),
    storage_policy:classifyStorage(),
    safety:{
      no_delete:true,
      no_fake_disk:true,
      no_fake_raid:true,
      no_full_load:true,
      max_report_policy:"compact"
    }
  };

  fs.writeFileSync(path.join(OUT,"disk_fabric_report.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(OUT,"disk_fabric_summary.json"),JSON.stringify({
    ok:report.ok,
    time:report.time,
    doctrine:report.doctrine,
    real_disk:report.real_disk,
    logical_capacity_gb:report.raid60_plus_mirror.logical_capacity_gb,
    raid60_blocks:report.raid60_plus_mirror.blocks_count,
    physical_disk_claim:false,
    policy:report.storage_policy
  },null,2));

  return report;
}

module.exports={buildReport};

if(require.main===module){
  const r=buildReport();
  console.log(JSON.stringify({
    ok:r.ok,
    module:r.module,
    doctrine:r.doctrine,
    real_disk:r.real_disk,
    raid60_plus_mirror:{
      mode:r.raid60_plus_mirror.mode,
      logical_capacity_gb:r.raid60_plus_mirror.logical_capacity_gb,
      blocks_count:r.raid60_plus_mirror.blocks_count,
      physical_disk_claim:r.raid60_plus_mirror.physical_disk_claim
    },
    storage_policy:r.storage_policy,
    safety:r.safety
  },null,2));
}
