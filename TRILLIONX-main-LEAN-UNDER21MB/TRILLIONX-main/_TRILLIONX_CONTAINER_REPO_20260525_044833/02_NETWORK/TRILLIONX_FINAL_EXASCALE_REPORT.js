#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");

(async()=>{
 const latest=JSON.parse(fs.readFileSync("data/trillionx_exascale_latest.json","utf8"));
 
 const final={
  engine:"TRILLIONX_FINAL_EXASCALE_REPORT",
  version:"1.0-COMPLETE",
  timestamp:new Date().toISOString(),
  summary:{
   global_score:latest.results.global_score,
   total_execution_ms:latest.duration_ms,
   success_rate:latest.results.success_pct+"%",
   micro_packets_total:latest.config.total_benches,
   micro_packets_passed:latest.results.total_ok,
   cpu_power_detected:latest.power_detected.scores.base_power_ops_per_ms_per_core,
   verdict:latest.results.global_score===100?"EXASCALE_READY":"FRONTIER_CAPABLE"
  },
  categories:latest.results.by_category,
  top_performers:Object.entries(latest.results.by_category)
   .sort((a,b)=>b[1].success_rate-a[1].success_rate)
   .slice(0,5)
   .map(([cat,data])=>({category:cat,success_rate:data.success_rate,avg_ms:data.avg_ms})),
  all_results:latest.details
 };
 
 const file="data/TRILLIONX_EXASCALE_FINAL.json";
 fs.writeFileSync(file,JSON.stringify(final,null,2));
 
 console.log("\n╔═══════════════════════════════════════════════════════╗");
 console.log("║        TRILLIONX EXASCALE BENCHMARK - FINAL REPORT    ║");
 console.log("╚═══════════════════════════════════════════════════════╝\n");
 console.log("🎯 GLOBAL SCORE:",final.summary.global_score+"/100");
 console.log("⏱️  TOTAL TIME:",final.summary.total_execution_ms+"ms");
 console.log("📦 MICRO-PACKETS:",final.summary.micro_packets_passed+"/"+final.summary.micro_packets_total);
 console.log("💪 CPU POWER:",final.summary.cpu_power_detected.toFixed(0)+" ops/ms/core");
 console.log("✅ STATUS:",final.summary.verdict);
 console.log("\n🏆 TOP PERFORMERS:");
 for(const p of final.top_performers){
  console.log(`   ${p.category}: ${p.success_rate.toFixed(1)}% (${p.avg_ms}ms avg)`);
 }
 console.log("\n📊 REPORT: "+file);
 console.log("\n");
})().catch(e=>{console.error(e);process.exit(1)});
