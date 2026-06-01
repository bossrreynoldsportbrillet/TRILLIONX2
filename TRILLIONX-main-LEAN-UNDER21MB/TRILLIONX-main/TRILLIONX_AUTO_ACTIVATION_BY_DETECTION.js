"use strict";
/* TRILLIONX AUTO ACTIVATION BY DETECTION — Termux-safe variant
   REAL_ONLY_OR_UNAVAILABLE — pure detection, no spawn */
const fs=require("fs"),os=require("os"),crypto=require("crypto"),{execSync}=require("child_process");
fs.mkdirSync("runtime_state",{recursive:true});
const OUT="runtime_state/TRILLIONX_AUTO_ACTIVATION_BY_DETECTION.json";
const safe=(c)=>{try{return execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000}).trim()}catch{return "UNAVAILABLE"}};
const gb=x=>+(x/1024/1024/1024).toFixed(3);
const cpuinfo=safe("cat /proc/cpuinfo");
const REPORT={
  timestamp:new Date().toISOString(),
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  detection:{
    cpu:{
      model:os.cpus()?.[0]?.model||"UNAVAILABLE",
      threads:os.cpus()?.length||0,
      loadavg:os.loadavg(),
      avx:/ avx /.test(cpuinfo),
      avx2:/ avx2 /.test(cpuinfo),
      avx512:/avx512/.test(cpuinfo),
      neon:/neon/.test(cpuinfo),
      asimd:/asimd/.test(cpuinfo),
      simd_flags:safe("grep -m1 -E 'Features|flags' /proc/cpuinfo")
    },
    memory:{total_gb:gb(os.totalmem()),free_gb:gb(os.freemem())},
    network:{interfaces:Object.keys(os.networkInterfaces())},
    gpu:{nvidia:safe("nvidia-smi"),pci:safe("lspci 2>/dev/null | grep -Ei 'vga|3d|display'")},
    thermal:{temp:safe("cat /sys/class/thermal/thermal_zone0/temp")},
    storage:{df:safe("df -h $HOME | tail -1")},
    platform:{android:safe("getprop ro.product.model"),termux:!!process.env.TERMUX_VERSION}
  },
  runtime:{
    UV_THREADPOOL_SIZE:Math.max(4,Math.min(os.cpus().length,64)),
    NODE_OPTIONS:"--max-old-space-size=8192",
    scheduler:"AUTO",
    cache:"AUTO",
    telemetry:"ACTIVE",
    runtime_id:crypto.randomBytes(16).toString("hex")
  },
  honesty:{
    REAL_ONLY_OR_UNAVAILABLE:true,
    NO_FAKE_CPU:true,NO_FAKE_RAM:true,NO_FAKE_GPU:true,
    NO_FAKE_POWER:true,NO_FAKE_HASHRATE:true,
    UNAVAILABLE_IS_VALID:true,
    NO_AUTO_SPAWN:true
  }
};
fs.writeFileSync(OUT,JSON.stringify(REPORT,null,2));
console.log("=== TRILLIONX AUTO ACTIVATION BY DETECTION ===");
console.log("CPU:",REPORT.detection.cpu.threads,"threads | NEON:",REPORT.detection.cpu.neon,"| ASIMD:",REPORT.detection.cpu.asimd);
console.log("RAM:",REPORT.detection.memory.total_gb,"GB total /",REPORT.detection.memory.free_gb,"GB free");
console.log("Platform:",REPORT.detection.platform.android||"N/A","Termux:",REPORT.detection.platform.termux);
console.log("Runtime ID:",REPORT.runtime.runtime_id);
console.log("Report:",OUT);
console.log("REAL_ONLY_OR_UNAVAILABLE");
