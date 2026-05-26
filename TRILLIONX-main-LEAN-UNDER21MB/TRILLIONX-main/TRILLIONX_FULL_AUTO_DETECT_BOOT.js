"use strict";

const os=require("os");
const fs=require("fs");
const net=require("net");
const dns=require("dns");
const crypto=require("crypto");
const {execSync}=require("child_process");
const {performance}=require("perf_hooks");

const SAFE=(cmd)=>{
 try{
  return execSync(cmd,{
   encoding:"utf8",
   stdio:["ignore","pipe","ignore"],
   timeout:5000
  }).trim();
 }catch{
  return "UNAVAILABLE";
 }
};

const GB=x=>+(x/1024/1024/1024).toFixed(3);
const MB=x=>+(x/1024/1024).toFixed(3);

function AUTO_DETECT_ALL(){

 const cpuinfo=SAFE("cat /proc/cpuinfo");
 const meminfo=SAFE("cat /proc/meminfo");
 const mounts=SAFE("mount");
 const env=process.env;

 const DETECT={

  timestamp:new Date().toISOString(),

  runtime:{
   node:process.version,
   pid:process.pid,
   cwd:process.cwd(),
   platform:process.platform,
   arch:process.arch,
   uptime_sec:process.uptime(),
   argv:process.argv,
   execPath:process.execPath
  },

  system:{
   hostname:os.hostname(),
   type:os.type(),
   release:os.release(),
   kernel:SAFE("uname -a"),
   codespaces:!!env.CODESPACES,
   docker:fs.existsSync("/.dockerenv"),
   container:SAFE("cat /proc/1/cgroup"),
   virtualization:SAFE("systemd-detect-virt"),
   users:SAFE("who")
  },

  cpu:{
   model:os.cpus()?.[0]?.model||"UNAVAILABLE",
   threads:os.cpus()?.length||0,
   speed_mhz:os.cpus()?.[0]?.speed||0,
   loadavg:os.loadavg(),
   cpuinfo,
   governor:SAFE("cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"),
   scaling_cur_freq:SAFE("cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"),
   microcode:SAFE("grep microcode /proc/cpuinfo | head"),
   numa:SAFE("numactl --hardware"),
   lscpu:SAFE("lscpu")
  },

  simd:{
   mmx:/mmx/.test(cpuinfo),
   sse:/sse/.test(cpuinfo),
   sse2:/sse2/.test(cpuinfo),
   sse3:/sse3/.test(cpuinfo),
   ssse3:/ssse3/.test(cpuinfo),
   sse41:/sse4_1/.test(cpuinfo),
   sse42:/sse4_2/.test(cpuinfo),
   avx:/ avx /.test(cpuinfo),
   avx2:/ avx2 /.test(cpuinfo),
   avx512:/avx512/.test(cpuinfo),
   aes:/ aes /.test(cpuinfo),
   sha:/ sha_ni /.test(cpuinfo),
   fma:/ fma /.test(cpuinfo)
  },

  memory:{
   total_gb:GB(os.totalmem()),
   free_gb:GB(os.freemem()),
   used_gb:GB(os.totalmem()-os.freemem()),
   meminfo,
   hugepages:SAFE("grep Huge /proc/meminfo"),
   swap:SAFE("swapon --show"),
   pressure:SAFE("cat /proc/pressure/memory"),
   vmstat:SAFE("vmstat 1 2")
  },

  cache:{
   l1d:SAFE("getconf LEVEL1_DCACHE_SIZE"),
   l1i:SAFE("getconf LEVEL1_ICACHE_SIZE"),
   l2:SAFE("getconf LEVEL2_CACHE_SIZE"),
   l3:SAFE("getconf LEVEL3_CACHE_SIZE"),
   cpu_cache:SAFE("lscpu | grep cache")
  },

  disk:{
   df:SAFE("df -h"),
   lsblk:SAFE("lsblk"),
   mounts,
   io_pressure:SAFE("cat /proc/pressure/io"),
   diskstats:SAFE("cat /proc/diskstats | tail -20"),
   scheduler:SAFE("cat /sys/block/*/queue/scheduler"),
   nvme:SAFE("nvme list")
  },

  network:{
   interfaces:os.networkInterfaces(),
   ip:SAFE("ip addr"),
   route:SAFE("ip route"),
   ss:SAFE("ss -tulpen | head -40"),
   resolv:SAFE("cat /etc/resolv.conf"),
   ping_github:SAFE("ping -c 2 github.com"),
   ping_google:SAFE("ping -c 2 google.com"),
   pressure:SAFE("cat /proc/pressure/cpu")
  },

  gpu:{
   nvidia_smi:SAFE("nvidia-smi"),
   lspci_gpu:SAFE("lspci | grep -Ei 'vga|3d|display'"),
   drm:SAFE("ls /dev/dri")
  },

  thermal:{
   thermal_zone:SAFE("cat /sys/class/thermal/thermal_zone0/temp"),
   sensors:SAFE("sensors")
  },

  nodejs:{
   versions:process.versions,
   memoryUsage:process.memoryUsage(),
   resourceUsage:process.resourceUsage(),
   activeHandles:process._getActiveHandles().length,
   activeRequests:process._getActiveRequests().length
  },

  cgroup:{
   cpu_max:SAFE("cat /sys/fs/cgroup/cpu.max"),
   cpu_weight:SAFE("cat /sys/fs/cgroup/cpu.weight"),
   mem_max:SAFE("cat /sys/fs/cgroup/memory.max"),
   mem_current:SAFE("cat /sys/fs/cgroup/memory.current"),
   pids_max:SAFE("cat /sys/fs/cgroup/pids.max")
  },

  processes:{
   top:SAFE("top -b -n1 | head -40"),
   ps:SAFE("ps aux --sort=-%mem | head -25")
  },

  orchestration:{
   pm2:SAFE("pm2 list"),
   docker:SAFE("docker ps"),
   git:SAFE("git status"),
   npm:SAFE("npm -v"),
   node:SAFE("node -v")
  },

  entropy:{
   random:crypto.randomBytes(64).toString("hex")
  },

  honesty:{
   policy:"REAL_ONLY_OR_UNAVAILABLE",
   fake_metrics:false,
   fake_gpu:false,
   fake_temp:false,
   fake_power:false
  }
 };

 return DETECT;
}

(async()=>{

 console.log("=== TRILLIONX FULL AUTO DETECT START ===");

 const T0=performance.now();

 const REPORT=AUTO_DETECT_ALL();

 REPORT.duration_ms=+(performance.now()-T0).toFixed(3);

 fs.mkdirSync("runtime_state",{recursive:true});

 fs.writeFileSync(
  "runtime_state/TRILLIONX_FULL_AUTO_DETECT.json",
  JSON.stringify(REPORT,null,2)
 );

 console.log(JSON.stringify(REPORT,null,2));

 console.log("\nREPORT:");
 console.log("runtime_state/TRILLIONX_FULL_AUTO_DETECT.json");

 console.log("=== TRILLIONX FULL AUTO DETECT END ===");

})();
