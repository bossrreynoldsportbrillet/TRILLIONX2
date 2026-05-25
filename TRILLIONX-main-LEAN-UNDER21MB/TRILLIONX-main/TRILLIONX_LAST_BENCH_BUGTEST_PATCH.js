"use strict";

const fs=require("fs");
const cp=require("child_process");

const files=[
  "TRILLIONX_VR_MIRROR_BENCH.js",
  "TRILLIONX_EXASCALE_LOGIC_BENCH.js",
  "TRILLIONX_FUSE_LAST_BENCH_REPORT.js"
];

const reports=[
  "runtime_state/bench/trillionx_vr_mirror_bench_last.json",
  "runtime_state/bench/trillionx_exascale_logic_bench_last.json",
  "runtime_state/bench/trillionx_fused_vr_exascale_mining_report_last.json"
];

function sh(cmd){
  try{
    return {
      ok:true,
      out:cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:20000})
    };
  }catch(e){
    return {
      ok:false,
      out:String(e.stdout||""),
      err:String(e.stderr||e.message||e)
    };
  }
}

function readJson(p){
  try{return JSON.parse(fs.readFileSync(p,"utf8"));}
  catch(e){return {__error:String(e.message||e)};}
}

function exists(p){return fs.existsSync(p);}

let result={
  module:"TRILLIONX_LAST_BENCH_BUGTEST_PATCH",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  subject:"TRILLIONX_ONLY",
  syntax:{},
  run:{},
  reports:{},
  detected_bugs:[],
  verdict:"PENDING"
};

for(const f of files){
  result.syntax[f]=sh(`node --check ${f}`);
  if(!result.syntax[f].ok) result.detected_bugs.push(`SYNTAX_FAIL:${f}`);
}

if(result.detected_bugs.length===0){
  result.run.vr=sh("node TRILLIONX_VR_MIRROR_BENCH.js");
  if(!result.run.vr.ok) result.detected_bugs.push("RUN_FAIL:VR_MIRROR");

  result.run.exascale=sh("node TRILLIONX_EXASCALE_LOGIC_BENCH.js");
  if(!result.run.exascale.ok) result.detected_bugs.push("RUN_FAIL:EXASCALE_LOGIC");

  result.run.fuse=sh("node TRILLIONX_FUSE_LAST_BENCH_REPORT.js");
  if(!result.run.fuse.ok) result.detected_bugs.push("RUN_FAIL:FUSE_REPORT");
}

for(const p of reports){
  result.reports[p]={
    exists:exists(p),
    json:exists(p)?readJson(p):"MISSING"
  };
  if(!exists(p)) result.detected_bugs.push(`REPORT_MISSING:${p}`);
  if(exists(p) && result.reports[p].json.__error) result.detected_bugs.push(`JSON_INVALID:${p}`);
}

const fused=result.reports["runtime_state/bench/trillionx_fused_vr_exascale_mining_report_last.json"]?.json;

if(fused && !fused.__error){
  if(fused.subject!=="TRILLIONX_ONLY") result.detected_bugs.push("BAD_SUBJECT_NOT_TRILLIONX_ONLY");
  if(!fused.trillionx_exascale_logic || fused.trillionx_exascale_logic==="UNAVAILABLE") result.detected_bugs.push("EXASCALE_SECTION_UNAVAILABLE");
  if(!fused.trillionx_vr_mirror || fused.trillionx_vr_mirror==="UNAVAILABLE") result.detected_bugs.push("VR_SECTION_UNAVAILABLE");
  if(fused.final_verdict?.exascale!=="LOGIC_LAYER_ONLY") result.detected_bugs.push("EXASCALE_GUARD_MISSING");
}

result.verdict=result.detected_bugs.length ? "TRILLIONX_LAST_BENCH_NEEDS_FIX" : "TRILLIONX_LAST_BENCH_OK";

fs.mkdirSync("runtime_state/bench",{recursive:true});
fs.writeFileSync("runtime_state/bench/trillionx_last_bench_bugtest_patch_report.json",JSON.stringify(result,null,2));

console.log("===== TRILLIONX LAST BENCH BUGTEST =====");
console.log("Subject       : TRILLIONX_ONLY");
console.log("Syntax VR     :",result.syntax[files[0]]?.ok?"OK":"FAIL");
console.log("Syntax EXA    :",result.syntax[files[1]]?.ok?"OK":"FAIL");
console.log("Syntax FUSE   :",result.syntax[files[2]]?.ok?"OK":"FAIL");
console.log("Run VR        :",result.run.vr?.ok?"OK":(result.run.vr?"FAIL":"SKIPPED"));
console.log("Run EXA       :",result.run.exascale?.ok?"OK":(result.run.exascale?"FAIL":"SKIPPED"));
console.log("Run FUSE      :",result.run.fuse?.ok?"OK":(result.run.fuse?"FAIL":"SKIPPED"));
console.log("Bugs          :",result.detected_bugs.length?result.detected_bugs.join(" | "):"NONE");
console.log("Verdict       :",result.verdict);
console.log("Report        : runtime_state/bench/trillionx_last_bench_bugtest_patch_report.json");
console.log("REAL_ONLY_OR_UNAVAILABLE");
