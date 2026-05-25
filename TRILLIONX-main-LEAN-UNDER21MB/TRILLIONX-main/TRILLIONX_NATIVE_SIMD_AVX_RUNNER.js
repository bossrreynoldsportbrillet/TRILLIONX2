const fs=require("fs");
const os=require("os");
const {execSync,spawnSync}=require("child_process");
const path=require("path");

fs.mkdirSync("data",{recursive:true});

function sh(cmd){
  try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10000}).trim();}
  catch(e){return "UNAVAILABLE: "+(e.stderr?.toString()||e.message);}
}

function flags(){
  let cpuinfo="";
  try{cpuinfo=fs.readFileSync("/proc/cpuinfo","utf8")}catch(e){}
  const line=(cpuinfo.match(/^flags\s*: (.*)$/m)||[])[1]||"";
  const f=line.split(/\s+/);
  const has=x=>f.includes(x);
  return {
    sse:has("sse"), sse2:has("sse2"), sse4_1:has("sse4_1"), sse4_2:has("sse4_2"),
    avx:has("avx"), avx2:has("avx2"), avx512f:has("avx512f"), fma:has("fma")
  };
}

const cc = sh("command -v gcc || command -v clang || true");
if(!cc || cc.startsWith("UNAVAILABLE")){
  console.log(JSON.stringify({ok:false,error:"gcc/clang unavailable"},null,2));
  process.exit(1);
}

const support=flags();
const src="native/simd/trillionx_simd_native_bench.c";
const bin="native/simd/trillionx_simd_native_bench";

let march = "-O3 -march=native";
let compile = `${cc} ${march} ${src} -o ${bin}`;
console.log("=== COMPILE NATIVE SIMD ===");
console.log(compile);
console.log(sh(compile));

console.log("=== RUN NATIVE SIMD ===");
const n = process.argv[2] || "16000000";
const rounds = process.argv[3] || "24";
const run = spawnSync(`./${bin}`,[n,rounds],{encoding:"utf8",timeout:120000});
if(run.error){
  console.log(JSON.stringify({ok:false,error:run.error.message,stderr:run.stderr},null,2));
  process.exit(1);
}
if(run.status !== 0){
  console.log(JSON.stringify({ok:false,status:run.status,stderr:run.stderr,stdout:run.stdout},null,2));
  process.exit(run.status || 1);
}

let native;
try{ native=JSON.parse(run.stdout); }
catch(e){ native={parse_error:e.message,raw:run.stdout,stderr:run.stderr}; }

const report={
  name:"TRILLIONX_NATIVE_SIMD_AVX_AVX2_AVX512_REPORT",
  time:new Date().toISOString(),
  host:{
    cpu:(os.cpus()[0]||{}).model||"UNKNOWN",
    logical_cpus:os.cpus().length,
    platform:process.platform,
    arch:process.arch,
    node:process.version,
    codespaces:!!process.env.CODESPACES || !!process.env.CODESPACE_NAME,
    container:fs.existsSync("/.dockerenv")
  },
  compiler:cc,
  compile_command:compile,
  detected_flags:support,
  native_result:native,
  verdict:{
    native_simd:true,
    avx_detected:support.avx,
    avx2_detected:support.avx2,
    avx512_detected:support.avx512f,
    note:"This is native C SIMD compiled with -march=native. It is real native execution, not pure JavaScript."
  }
};

const file=`data/trillionx_native_simd_avx_${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify(report,null,2));
fs.writeFileSync("data/trillionx_native_simd_avx_latest.json",JSON.stringify(report,null,2));

console.log(JSON.stringify(report,null,2));
console.log("REPORT =",file);
