"use strict";

const fs=require("fs");
const crypto=require("crypto");

const SRC="runtime_state/benchmark/trillionx_eof_exascale_micro_packet_enterprise_btc_savings_last.json";
const OUT="runtime_state/benchmark/trillionx_eof_savings_scope_interrogation_last.json";
fs.mkdirSync("runtime_state/benchmark",{recursive:true});

function read(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
const r=read(SRC);

if(!r){
  console.log("EOF_SCOPE_INTERROGATION: SOURCE_UNAVAILABLE");
  console.log("Missing:",SRC);
  process.exit(1);
}

const t=r.totals||{};
const cfg=r.config||{};

const baseline=t.enterprise_baseline_MW ?? "UNAVAILABLE";
const optimized=t.enterprise_optimized_MW_model ?? "UNAVAILABLE";
const savedEUR=t.electricity_saved_10y_model_EUR ?? "UNAVAILABLE";
const savingRatio=t.final_logical_saving_ratio ?? "UNAVAILABLE";
const target=t.final_target_saving_ratio ?? "UNAVAILABLE";
const proximity=t.final_saving_to_target ?? "UNAVAILABLE";

const report={
  module:"TRILLIONX_EOF_INTERROGATE_SAVINGS_SCOPE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  question:"Is the saving for TRILLIONX alone, the emulated company, or company protocols?",
  source:SRC,

  answer:{
    short:"The measured runtime is TRILLIONX; the modeled savings are for the emulated BTC enterprise and its protocols.",
    self_scope:{
      name:"TRILLIONX_SELF",
      what_is_real:"runtime execution, packets/s, jobs/s, latency, JSON report generation",
      what_is_model:"none for self cost unless wattmeter data is connected",
      electricity_saving:"UNAVAILABLE_WITHOUT_REAL_TRILLIONX_WATTS"
    },
    enterprise_scope:{
      name:"EMULATED_BTC_ENTERPRISE",
      farms:cfg.farms ?? "UNAVAILABLE",
      miners_per_farm:cfg.miners_per_farm ?? "UNAVAILABLE",
      baseline_MW_model:baseline,
      optimized_MW_model:optimized,
      electricity_saved_10y_model_EUR:savedEUR,
      saving_ratio_model:savingRatio,
      target_saving_ratio:target,
      target_proximity:proximity,
      reading:"This is the modeled enterprise saving, not a measured real-world invoice reduction."
    },
    protocol_scope:{
      name:"PROTOCOL_SAVINGS_LAYER",
      applies_to:[
        "SHA256 workload scheduling",
        "pool/job routing model",
        "micro-packet batching",
        "cache reuse",
        "VR mirror state reuse",
        "QN quantization routing",
        "network/port discipline",
        "thermal/electric load planning model",
        "maintenance/idle waste reduction model"
      ],
      reading:"The economy is modeled as protocol/process optimization across a fleet, not as extra mining power."
    },
    btc_scope:{
      BTC_real:t.BTC_REAL ?? "UNAVAILABLE",
      reading:"BTC output remains unavailable without real pool shares/rewards."
    }
  },

  verdict:{
    state:"EOF_SCOPE_ANSWER_READY",
    line:"TRILLIONX measures itself, then models savings for the emulated enterprise protocols.",
    real:"TRILLIONX runtime metrics",
    modeled:"enterprise/protocol electricity saving",
    unavailable:"real BTC, real wattmeter savings, real invoices"
  },

  digest:crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0,32),
  time:new Date().toISOString()
};

fs.writeFileSync(OUT,JSON.stringify(report,null,2));

console.log("===== TRILLIONX EOF SAVINGS SCOPE INTERROGATION =====");
console.log("Question             : TRILLIONX seul, entreprise, ou protocoles ?");
console.log("Answer               : TRILLIONX mesure son runtime; économie = entreprise/protocoles émulés");
console.log("TRILLIONX self       : runtime metrics REAL");
console.log("Enterprise farms     :",report.answer.enterprise_scope.farms);
console.log("Miners/farm          :",report.answer.enterprise_scope.miners_per_farm);
console.log("Baseline MW model    :",baseline);
console.log("Optimized MW model   :",optimized);
console.log("Saved 10y model EUR  :",savedEUR);
console.log("Saving ratio model   :",savingRatio);
console.log("Target proximity     :",proximity);
console.log("BTC real             :",report.answer.btc_scope.BTC_real);
console.log("Report               :",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
