const os = require("os");
const fs = require("fs");
const cp = require("child_process");

function sh(cmd){
  try { return cp.execSync(cmd,{encoding:"utf8",timeout:3000}).trim(); }
  catch { return "UNAVAILABLE"; }
}

const total = os.totalmem();
const free = os.freemem();
const used = total - free;

function gb(x){ return (x/1024/1024/1024).toFixed(2); }

console.log("===== TRILLIONX RAM STATUS — REAL ONLY =====");
console.log("RAM total     :", gb(total), "GB");
console.log("RAM libre     :", gb(free), "GB");
console.log("RAM utilisée  :", gb(used), "GB");
console.log("Load          :", os.loadavg().map(x=>x.toFixed(2)).join(" "));
console.log("CPU threads   :", os.cpus().length);
console.log("Node          :", process.version);
console.log("");
console.log("Top mémoire:");
console.log(sh("ps -eo pid,%cpu,%mem,rss,comm,args --sort=-rss | head -12"));
console.log("");
console.log("Port 3000:");
console.log(sh("ss -lntp | grep ':3000' || true"));
