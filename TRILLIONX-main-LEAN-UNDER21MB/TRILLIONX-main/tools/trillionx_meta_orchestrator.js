"use strict";

/*
 TRILLIONX META ORCHESTRATOR
 - Relie les modules existants sans reconstruire
 - Micro-paquets partout
 - RAM reconnue = hot window
 - 512GB miroir = logique indexée
 - RAID60+ = métadonnées/logique
 - Coprocessors = familles logicielles
 - REAL_ONLY_OR_UNAVAILABLE
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const OUT = "runtime_state/meta_orchestrator";

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }

function sh(cmd, timeout=12000){
  try {
    return cp.execSync(cmd, {
      encoding:"utf8",
      stdio:["ignore","pipe","pipe"],
      timeout
    }).trim();
  } catch(e) {
    return "UNAVAILABLE";
  }
}

function gb(x){
  return +(x/1024/1024/1024).toFixed(3);
}

function runNodeModule(label, command){
  const started = Date.now();
  const raw = sh(command, 20000);
  let parsed = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  return {
    label,
    command,
    ok: raw !== "UNAVAILABLE",
    duration_ms: Date.now() - started,
    parsed_json: !!parsed,
    compact: parsed ? compactObject(parsed) : String(raw).slice(0,4000)
  };
}

function compactObject(obj){
  const text = JSON.stringify(obj);
  if(text.length < 12000) return obj;

  return {
    truncated:true,
    original_chars:text.length,
    keys:Object.keys(obj || {}),
    preview:JSON.parse(JSON.stringify(obj, null, 2).slice(0,6000) + "{}".slice(0,0))
  };
}

function realState(){
  return {
    time:new Date().toISOString(),
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    host:os.hostname(),
    cpu:{
      model:os.cpus()[0]?.model || "UNAVAILABLE",
      threads:os.cpus().length,
      arch:os.arch(),
      kernel:os.release()
    },
    memory:{
      total_gb:gb(os.totalmem()),
      free_gb:gb(os.freemem()),
      used_gb:gb(os.totalmem()-os.freemem())
    },
    disk:{
      workspaces:sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
      repo:sh("du -sh . 2>/dev/null | awk '{print $1}'")
    },
    ports:{
      trillionx:sh("ss -lntp | grep -E ':3000|:25000|:26000' || true")
    },
    git:{
      branch:sh("git branch --show-current"),
      status:sh("git status -sb")
    }
  };
}

function exists(p){
  return fs.existsSync(p);
}

function main(){
  ensure(OUT);

  const modules = [];

  if(exists("fabric_general/trillionx_general_fabric.js")){
    modules.push(runNodeModule(
      "GENERAL_FABRIC",
      "node fabric_general/trillionx_general_fabric.js"
    ));
  }

  if(exists("tools/global_stream_status.js")){
    modules.push(runNodeModule(
      "GLOBAL_STREAM",
      "node tools/global_stream_status.js"
    ));
  }

  if(exists("tools/perpetual_stream_status.js")){
    modules.push(runNodeModule(
      "PERPETUAL_STREAM_ONE_CYCLE",
      "node tools/perpetual_stream_status.js"
    ));
  }

  if(exists("tools/virtual_mirror_ram_status.js")){
    modules.push(runNodeModule(
      "VIRTUAL_MIRROR_RAM_512",
      "node tools/virtual_mirror_ram_status.js"
    ));
  }

  if(exists("tools/codespaces_owner_profile.js")){
    modules.push(runNodeModule(
      "CODESPACES_OWNER_PROFILE",
      "node tools/codespaces_owner_profile.js"
    ));
  }

  const report = {
    ok:true,
    module:"TRILLIONX_META_ORCHESTRATOR",
    doctrine:"REAL_ONLY_OR_UNAVAILABLE",
    interpretation:"logical execution improvement through streaming/indexing, not fake hardware multiplication",
    principle:{
      big_compute:"micro_packet_loop",
      ram:"recognized_memory_hot_window",
      mirror_512gb:"logical_indexed_address_space",
      raid60_plus:"logical_metadata_parity_mirror_index",
      coprocessor:"software_families_mapped_to_real_cpu_features",
      files_scripts:"cold_active_memory",
      result:"compact_runtime_state",
      no_full_load:true,
      no_delete:true
    },
    real_state:realState(),
    linked_modules:modules.map(m=>({
      label:m.label,
      ok:m.ok,
      parsed_json:m.parsed_json,
      duration_ms:m.duration_ms
    })),
    module_results:modules
  };

  fs.writeFileSync(
    path.join(OUT,"meta_orchestrator_report.json"),
    JSON.stringify(report,null,2)
  );

  fs.writeFileSync(
    path.join(OUT,"meta_orchestrator_summary.json"),
    JSON.stringify({
      ok:report.ok,
      time:new Date().toISOString(),
      doctrine:report.doctrine,
      cpu:report.real_state.cpu,
      memory:report.real_state.memory,
      disk:report.real_state.disk,
      linked_modules:report.linked_modules,
      principle:report.principle
    },null,2)
  );

  console.log(JSON.stringify({
    ok:report.ok,
    module:report.module,
    doctrine:report.doctrine,
    real_state:report.real_state,
    linked_modules:report.linked_modules,
    principle:report.principle,
    output:{
      summary:"runtime_state/meta_orchestrator/meta_orchestrator_summary.json",
      report:"runtime_state/meta_orchestrator/meta_orchestrator_report.json"
    }
  },null,2));
}

main();
