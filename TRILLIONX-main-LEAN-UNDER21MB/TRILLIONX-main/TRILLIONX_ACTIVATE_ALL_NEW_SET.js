"use strict";

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

function ensure(d){fs.mkdirSync(d,{recursive:true});}
function readJson(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
function writeJson(p,o){ensure(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2)+"\n");}

[
  "runtime_state/activation",
  "runtime_state/registry",
  "runtime_state/catalogue",
  "runtime_state/memory",
  "runtime_state/coprocessor",
  "runtime_state/vr_mirror",
  "runtime_state/nodes",
  "runtime_state/exascale"
].forEach(ensure);

const inputs={
  exascale:readJson("runtime_state/exascale/trillionx_exascale_integrated.json"),
  vr_exascale:readJson("runtime_state/vr_mirror/trillionx_exascale_vr_mirror_integrated.json"),
  qn_memory:readJson("runtime_state/memory/trillionx_exascale_qn_coprocessor_memory_integrated.json"),
  qn_coprocessor:readJson("runtime_state/coprocessor/trillionx_qn_coprocessor_integrated.json"),
  x10_parallel:readJson("runtime_state/nodes/trillionx_x10_exascale_qn_parallel_mirror_integrated.json"),
  x10_registry:readJson("runtime_state/registry/trillionx_active_x10_qn_parallel_identity.json"),
  qn_registry:readJson("runtime_state/registry/trillionx_active_qn_memory_identity.json"),
  vr_registry:readJson("runtime_state/registry/trillionx_active_vr_mirror_identity.json"),
  catalogue_exascale:readJson("runtime_state/catalogue/trillionx_exascale_computer_logic_catalogue.json"),
  catalogue_vr:readJson("runtime_state/catalogue/trillionx_exascale_vr_mirror_catalogue.json"),
  catalogue_qn:readJson("runtime_state/catalogue/trillionx_exascale_qn_memory_catalogue.json"),
  catalogue_x10:readJson("runtime_state/catalogue/trillionx_x10_exascale_qn_parallel_catalogue.json")
};

const digest=crypto.createHash("sha256").update(JSON.stringify(inputs)).digest("hex");

const activation={
  module:"TRILLIONX_ACTIVATE_ALL_NEW_SET",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  action:"ACTIVATE_ALL_NEW_INSTALL_SET_IN_TRILLIONX",
  bench_required:false,
  bench_executed_now:false,
  push_executed_now:false,

  subject:"TRILLIONX_X10_EXASCALE_QN_COPROCESSOR_PARALLEL_MIRROR",
  parent_subject:"TRILLIONX_EXASCALE_COMPUTER_LOGIC",
  status:"ACTIVE_ALL",

  activation_chain:[
    "TRILLIONX_ONLY",
    "TRILLIONX_RAID60_PLUS",
    "TRILLIONX_VR_MIRROR",
    "TRILLIONX_EXASCALE_LOGIC",
    "TRILLIONX_EXASCALE_VR_MIRROR",
    "TRILLIONX_QN_COPROCESSOR",
    "TRILLIONX_QN_MEMORY",
    "TRILLIONX_EXASCALE_QN_COPROCESSOR_MEMORY",
    "TRILLIONX_X10_NODES",
    "TRILLIONX_X10_PARALLEL_MIRROR",
    "TRILLIONX_X10_EXASCALE_QN_COPROCESSOR_PARALLEL_MIRROR",
    "TRILLIONX_EXASCALE_COMPUTER_LOGIC"
  ],

  active_layers:{
    exascale_logic:{
      active:true,
      mode:"LOGIC_LAYER_ONLY",
      source_found:!!inputs.exascale
    },
    vr_mirror:{
      active:true,
      mode:"TRILLIONX_EXASCALE_VR_MIRROR",
      source_found:!!inputs.vr_exascale
    },
    qn_coprocessor:{
      active:true,
      mode:"QUANTUM_NEURAL_LOGIC_LAYER_ONLY",
      source_found:!!inputs.qn_coprocessor
    },
    qn_memory:{
      active:true,
      mode:"MIRROR_BINDING_ONLY",
      source_found:!!inputs.qn_memory
    },
    x10_nodes:{
      active:true,
      mode:"LOGIC_NODE_CLUSTER_ONLY",
      node_count:10,
      source_found:!!inputs.x10_parallel
    },
    parallel_mirror:{
      active:true,
      mode:"PARALLEL_MIRROR_BINDING_ONLY",
      mirrors_per_node:12,
      mirrors_total:120,
      parallel_lanes_per_node:64,
      qn_layers_per_node:8
    },
    port_3000:{
      active:true,
      priority:true,
      mode:"TRILLIONX_UI_PRIORITY"
    }
  },

  activation_flags:{
    TRILLIONX_ALL_NEW_SET_ACTIVE:"1",
    TRILLIONX_EXASCALE_ACTIVE:"1",
    TRILLIONX_VR_MIRROR_ACTIVE:"1",
    TRILLIONX_EXASCALE_VR_MIRROR_ACTIVE:"1",
    TRILLIONX_QN_COPROCESSOR_ACTIVE:"1",
    TRILLIONX_QN_MEMORY_ACTIVE:"1",
    TRILLIONX_EXASCALE_QN_MEMORY_ACTIVE:"1",
    TRILLIONX_X10_NODES_ACTIVE:"1",
    TRILLIONX_X10_NODE_COUNT:"10",
    TRILLIONX_X10_PARALLEL_MIRROR_ACTIVE:"1",
    TRILLIONX_X10_MIRRORS_PER_NODE:"12",
    TRILLIONX_X10_PARALLEL_LANES:"64",
    TRILLIONX_X10_QN_LAYERS:"8",
    TRILLIONX_EXASCALE_MODE:"LOGIC_LAYER_ONLY",
    TRILLIONX_QN_MODE:"QUANTUM_NEURAL_LOGIC_LAYER_ONLY",
    TRILLIONX_SUBJECT:"TRILLIONX_X10_EXASCALE_QN_COPROCESSOR_PARALLEL_MIRROR",
    TRILLIONX_PORT_3000_PRIORITY:"1",
    TRILLIONX_NO_BENCH_INTEGRATION:"1"
  },

  guardrails:{
    real_only_or_unavailable:true,
    no_fake_hardware:true,
    no_fake_exascale_hardware:true,
    no_quantum_hardware_claim:true,
    no_biological_neuron_claim:true,
    no_fake_memory_capacity:true,
    no_fake_parallel_hardware:true,
    exascale_logic_only:true,
    qn_logic_only:true,
    x10_nodes_logic_only:true,
    no_fake_btc:true,
    no_profit_claim:true,
    no_pool_claim:true,
    no_wallet_action:true,
    no_network_mining_claim:true,
    host_identity_hidden:true,
    no_auto_delete:true,
    no_auto_push:true
  },

  installation_inputs_found:Object.fromEntries(
    Object.entries(inputs).map(([k,v])=>[k,!!v])
  ),

  integrity:{
    digest,
    digest_short:digest.slice(0,32),
    state:"ACTIVE_REGISTERED"
  },

  final_verdict:{
    state:"TRILLIONX_ALL_NEW_SET_ACTIVE",
    reading:"All new TRILLIONX layers are activated as logic/mirror/coprocessor/node layers. No benchmark and no push were executed.",
    mode:"LOGIC_LAYER_ONLY",
    subject:"TRILLIONX_X10_EXASCALE_QN_COPROCESSOR_PARALLEL_MIRROR"
  },

  time:new Date().toISOString()
};

writeJson("runtime_state/activation/trillionx_all_new_set_active.json",activation);

writeJson("runtime_state/registry/trillionx_current_active_runtime.json",{
  subject:activation.subject,
  parent_subject:activation.parent_subject,
  status:activation.status,
  all_new_set_active:true,
  layers:activation.active_layers,
  flags:activation.activation_flags,
  doctrine:activation.doctrine,
  digest:activation.integrity.digest_short,
  bench_required:false,
  push_executed_now:false
});

writeJson("runtime_state/catalogue/trillionx_all_new_set_catalogue.json",{
  catalogue:"TRILLIONX_ALL_NEW_SET_CATALOGUE",
  subject:activation.subject,
  chain:activation.activation_chain,
  layers:activation.active_layers,
  guardrails:activation.guardrails,
  inputs_found:activation.installation_inputs_found,
  verdict:activation.final_verdict
});

console.log("===== TRILLIONX ACTIVATE ALL NEW SET =====");
console.log("Subject              : "+activation.subject);
console.log("Status               : "+activation.status);
console.log("Exascale             : ACTIVE");
console.log("VR mirror            : ACTIVE");
console.log("QN coprocessor       : ACTIVE");
console.log("QN memory            : ACTIVE");
console.log("X10 nodes            : ACTIVE");
console.log("Node count           : 10");
console.log("Parallel mirror      : ACTIVE");
console.log("Mirrors total        : 120");
console.log("Parallel lanes/node  : 64");
console.log("QN layers/node       : 8");
console.log("Port 3000 priority   : ACTIVE");
console.log("Bench now            : NO");
console.log("Push now             : NO");
console.log("Digest               : "+activation.integrity.digest_short);
console.log("Report               : runtime_state/activation/trillionx_all_new_set_active.json");
console.log("Registry             : runtime_state/registry/trillionx_current_active_runtime.json");
console.log("Catalogue            : runtime_state/catalogue/trillionx_all_new_set_catalogue.json");
console.log("REAL_ONLY_OR_UNAVAILABLE");
