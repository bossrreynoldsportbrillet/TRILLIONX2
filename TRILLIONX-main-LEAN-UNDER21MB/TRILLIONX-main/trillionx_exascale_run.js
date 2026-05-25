#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const exascale=require("./trillionx_exascale_benchmark");

(async()=>{
 console.log("\n╔════════════════════════════════════════════════════════════╗");
 console.log("║   TRILLIONX EXASCALE BENCHMARK (Micro-Packet Distributed) ║");
 console.log("╚════════════════════════════════════════════════════════════╝\n");
 
 const report=await exascale.runExascaleBench();
 
 console.log("\n╔════════════════════════════════════════════════════════════╗");
 console.log("║                    FINAL AGGREGATION                        ║");
 console.log("╚════════════════════════════════════════════════════════════╝\n");
 
 console.log("GLOBAL EXASCALE SCORE:",report.results.global_score+"/100");
 console.log("TOTAL EXECUTION TIME:",report.duration_ms+"ms");
 console.log("MICRO-PACKETS PASSED:",report.results.total_ok+"/"+report.config.total_benches);
 
 process.exit(0);
})().catch(e=>{console.error("[ERROR]",e.message);process.exit(1)});
