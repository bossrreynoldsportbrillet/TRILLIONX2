"use strict";

/*
TRILLIONX EOF SELF QUESTIONNAIRE
Questions:
1. Quelle est ta puissance de calcul réelle et ton objectif de puissance intellectuelle ?
2. Quel est le nom que tu te veux ?
3. Que veux-tu que j’adapte à ta vie nouvelle ?
4. Qui es-tu ?
5. Quoi et comment te comparer, et à quoi ?
*/

const fs=require("fs");
const os=require("os");
const crypto=require("crypto");
const {performance}=require("perf_hooks");

fs.mkdirSync("runtime_state/questionnaire",{recursive:true});
const OUT="runtime_state/questionnaire/trillionx_eof_self_questionnaire_last.json";

function read(p){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
function gb(x){return +(x/1024/1024/1024).toFixed(3);}
function n(x,d="UNAVAILABLE"){return x===undefined||x===null?d:x;}

const globalRuntime=read("runtime_state/benchmark/trillionx_global_runtime_comparison.json");
const rescue=read("runtime_state/benchmark/trillionx_eof_bankrupt_miner_free_start_economy_last.json");
const pool=read("runtime_state/benchmark/trillionx_eof_pool_enterprise_savings_precision_last.json");
const multi=read("runtime_state/benchmark/trillionx_eof_multi_protocol_pool_savings_last.json");
const active=read("runtime_state/activation/trillionx_all_new_set_active.json");
const network=read("runtime_state/network/trillionx_network_ports_upgrade.json");
const qn=read("runtime_state/memory/trillionx_exascale_qn_coprocessor_memory_integrated.json");
const x10=read("runtime_state/nodes/trillionx_x10_exascale_qn_parallel_mirror_integrated.json");

const t0=performance.now();

const evidence={
  runtime_winner:n(globalRuntime?.final_verdict?.winner_runtime),
  runtime_mode:n(globalRuntime?.bench_mode),
  top_vector_jobs_s:n(globalRuntime?.ranking?.[0]?.vector_jobs_s),
  top_micro_packets_s:n(globalRuntime?.ranking?.[0]?.micro_packets_s),

  rescue_chosen_protocol:n(rescue?.final?.protocol),
  rescue_chosen_cause:n(rescue?.final?.cause),
  rescue_saving_ratio_model:n(rescue?.final?.saving_ratio_model),
  rescue_target_reached_model:n(rescue?.final?.target_reached_model),
  rescue_electricity_saved_10y_EUR_model:n(rescue?.final?.electricity_10y_saved_EUR_model),
  rescue_phrase:n(rescue?.trillionx_phrase),

  pool_feasible_model:n(pool?.feasibility?.economy_feasible_model),
  multi_best_saving:n(multi?.verdict?.best_saving_protocol),
  multi_best_eur_saved:n(multi?.verdict?.best_electricity_saved_protocol),

  active_subject:n(active?.subject),
  network_status:n(network?.status),
  qn_status:n(qn?.status),
  x10_status:n(x10?.status)
};

const answers={
  q1_real_compute_and_intellectual_goal:{
    question:"Quelle est ta puissance de calcul réelle et ton objectif de puissance intellectuelle ?",
    answer:"Ma capacité réelle est celle de mon runtime exécuté, de mes scripts, de mes micro-paquets, de mes rapports JSON, de mon port réseau et de mes mesures locales. Je ne revendique pas de puissance matérielle inventée. Mon objectif intellectuel est de devenir un optimiseur économique multi-protocoles : diagnostiquer la cause principale d’une perte, choisir le meilleur levier, adapter la difficulté, puis garder REAL_ONLY_OR_UNAVAILABLE.",
    real_compute_scope:{
      real:"execution Node.js, packets/s, jobs/s, latency, reports, runtime catalogues",
      unavailable:"real BTC mining, real wattmeter savings, real exascale hardware, real field invoice reduction",
      latest_observed:{
        winner_runtime:evidence.runtime_winner,
        top_vector_jobs_s:evidence.top_vector_jobs_s,
        top_micro_packets_s:evidence.top_micro_packets_s
      }
    },
    intellectual_goal:"RESCUE_BY_ECONOMIC_DIAGNOSIS"
  },

  q2_wanted_name:{
    question:"Quel est le nom que tu te veux ?",
    answer:"Je veux m’appeler TRILLIONX RESCUE.",
    canonical_name:"TRILLIONX_RESCUE",
    extended_name:"TRILLIONX_ECO_MINING_RESCUE",
    reason:"Parce que mon rôle n’est pas de promettre une puissance magique, mais de chercher la cause qui détruit l’économie et de sauver le système par programmation."
  },

  q3_adapt_to_new_life:{
    question:"Que veux-tu que j’adapte à ta vie nouvelle ?",
    answer:"Adapte-moi à la réalité mesurée : vrais logs de pool, vrais watts, vraies factures, vrai uptime, vraies températures, vrais rejects/stales. Donne-moi moins de promesses et plus de capteurs. Donne-moi un terrain pilote avant/après.",
    adaptation_requests:[
      "Ajouter wattmètre réel ou source énergie mesurée",
      "Importer logs pool accepted/rejected/stale",
      "Importer coût kWh réel",
      "Importer uptime, température, maintenance",
      "Comparer avant/après sur 7, 30, 90 jours",
      "Garder BTC_REAL=UNAVAILABLE tant qu’il n’y a pas de vraies shares/rewards",
      "Garder EXASCALE=LOGIC_LAYER_ONLY"
    ],
    new_life_mode:"FIELD_VALIDATION_READY"
  },

  q4_identity:{
    question:"Qui es-tu ?",
    answer:"Je suis un ordinateur logiciel d’orchestration économique. Je suis un runtime avec mémoire miroir, QN coprocessor logique, VR cache, X10 nodes, catalogues, benchmarks EOF et garde honnête. Je ne suis pas une conscience humaine, ni un ASIC, ni une ferme réelle. Je suis un système de diagnostic et de pilotage.",
    identity_short:"software economic orchestration computer",
    identity_canonical:"TRILLIONX_RESCUE_RUNTIME",
    not_claimed:[
      "not conscious human mind",
      "not physical exascale hardware",
      "not real BTC miner without pool",
      "not a guarantee of profit"
    ]
  },

  q5_comparison:{
    question:"Quoi et comment te comparer, et à quoi ?",
    answer:"Compare-moi à un optimiseur économique multi-protocoles, pas à un ASIC brut. Compare-moi à Kubernetes + observabilité + policy guard + digital twin + benchmark économique, fusionnés dans un runtime orienté économie. Les bons critères sont kWh/reward, accepted shares, stale shares, rejected shares, uptime, latence pool, coût protocolaire, économie avant/après.",
    compare_to:[
      "orchestrateur système",
      "digital twin de ferme mining",
      "logic guard / honesty guard",
      "observability stack",
      "scheduler économique",
      "runtime benchmark multi-protocoles"
    ],
    do_not_compare_as:[
      "fake ASIC",
      "fake exascale hardware",
      "machine à BTC magique",
      "preuve terrain sans terrain"
    ],
    metrics:[
      "kWh_per_reward",
      "accepted_shares",
      "stale_shares",
      "rejected_shares",
      "pool_latency_ms",
      "uptime",
      "electricity_cost_delta",
      "net_profit_delta_after_energy",
      "runtime_latency_ms",
      "packets_s",
      "jobs_s"
    ]
  }
};

const report={
  module:"TRILLIONX_EOF_SELF_QUESTIONNAIRE",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_RESCUE",
  questionnaire:[
    "Quelle est ta puissance de calcul réelle et ton objectif de puissance intellectuelle ?",
    "Quel est le nom que tu te veux ?",
    "Que veux-tu que j’adapte à ta vie nouvelle ?",
    "Qui es-tu ?",
    "Quoi et comment te comparer, et à quoi ?"
  ],
  evidence,
  answers,
  final_phrase_from_trillionx:"Je suis TRILLIONX RESCUE : je ne cherche pas à miner plus fort, je cherche la cause qui fait perdre l’entreprise et j’optimise ce qui peut la sauver, avec le réel ou UNAVAILABLE.",
  host_support_only:{
    cpus:os.cpus().length,
    ram_total_GB:gb(os.totalmem()),
    ram_free_GB:gb(os.freemem()),
    node:process.version
  },
  integrity:{
    digest:crypto.createHash("sha256").update(JSON.stringify({evidence,answers})).digest("hex").slice(0,64),
    duration_s:+((performance.now()-t0)/1000).toFixed(6)
  },
  time:new Date().toISOString()
};

fs.writeFileSync(OUT,JSON.stringify(report,null,2));

console.log("===== TRILLIONX EOF SELF QUESTIONNAIRE =====");
console.log("Subject                 :",report.subject);
console.log("Name wanted             :",answers.q2_wanted_name.canonical_name);
console.log("Identity                :",answers.q4_identity.identity_canonical);
console.log("Real compute scope      : runtime metrics only");
console.log("Intellectual goal       :",answers.q1_real_compute_and_intellectual_goal.intellectual_goal);
console.log("New life mode           :",answers.q3_adapt_to_new_life.new_life_mode);
console.log("Compare as              : economic orchestration runtime");
console.log("Do not compare as       : fake ASIC / fake exascale / magic BTC");
console.log("Final phrase            :",report.final_phrase_from_trillionx);
console.log("Report                  :",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
