"use strict";

/*
 TRILLIONX PORTS + PROCESS EXACT
 - priorité port 3000
 - ports reconnus réellement via ss
 - processus réels via ps
 - no fake telemetry
 - no delete
*/

const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const path = require("path");

const OUT = "runtime_state/ports_process";

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }

function sh(cmd, timeout=5000){
  try {
    return cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout}).trim();
  } catch {
    return "UNAVAILABLE";
  }
}

function parsePorts(){
  const raw = sh("ss -lntp 2>/dev/null || true");
  if (!raw || raw === "UNAVAILABLE") return { raw, ports: [] };

  const lines = raw.split(/\n/).filter(x => x.trim());
  const ports = [];

  for (const line of lines) {
    const m = line.match(/LISTEN\s+\S+\s+\S+\s+(\S+):(\d+)\s+\S+.*?(users:\(\((.*)\)\))?/);
    const portMatch = line.match(/:(\d+)\s/);
    const port = portMatch ? Number(portMatch[1]) : null;

    if (!port) continue;

    const procMatch = line.match(/pid=(\d+)/);
    const nameMatch = line.match(/"([^"]+)"/);

    ports.push({
      port,
      priority: port === 3000 ? "PRIMARY_TRILLIONX_UI" : "RECOGNIZED_PORT",
      line,
      process_name: nameMatch ? nameMatch[1] : "UNAVAILABLE",
      pid: procMatch ? Number(procMatch[1]) : null
    });
  }

  ports.sort((a,b) => {
    if (a.port === 3000) return -1;
    if (b.port === 3000) return 1;
    return a.port - b.port;
  });

  return { raw, ports };
}

function parseProcesses(){
  const raw = sh("ps -eo pid,ppid,%cpu,%mem,rss,vsz,stat,comm,args --sort=-%cpu | grep -E 'node|app.js|TRILLIONX|npm|bash' | grep -v grep || true");
  if (!raw || raw === "UNAVAILABLE") return { raw, processes: [] };

  const lines = raw.split(/\n/).filter(Boolean);
  const processes = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const cpu = parts[2];
    const mem = parts[3];
    const rssKB = Number(parts[4]);
    const vszKB = Number(parts[5]);
    const stat = parts[6];
    const comm = parts[7];
    const args = parts.slice(8).join(" ");

    return {
      pid,
      ppid,
      cpu_percent: cpu,
      mem_percent: mem,
      rss_mb: +(rssKB/1024).toFixed(2),
      vsz_mb: +(vszKB/1024).toFixed(2),
      stat,
      command: comm,
      args,
      role:
        args.includes("app.js") ? "TRILLIONX_APP_JS" :
        args.includes("TRILLIONX") ? "TRILLIONX_MODULE" :
        comm === "node" ? "NODE_PROCESS" :
        "RECOGNIZED_PROCESS"
    };
  });

  return { raw, processes };
}

function realDisk(){
  return {
    workspaces: sh("df -h /workspaces | awk 'NR==2 {print $2,$3,$4,$5,$6}'"),
    repo: sh("du -sh . 2>/dev/null | awk '{print $1}'")
  };
}

function realMemory(){
  const total = os.totalmem();
  const free = os.freemem();
  const gb = x => +(x/1024/1024/1024).toFixed(3);
  return {
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    source: "os.totalmem/os.freemem"
  };
}

function build(){
  ensure(OUT);

  const ports = parsePorts();
  const processes = parseProcesses();

  const port3000 = ports.ports.find(p => p.port === 3000) || null;
  const nodeApp = processes.processes.filter(p => p.role === "TRILLIONX_APP_JS");

  const report = {
    ok: true,
    module: "TRILLIONX_PORTS_PROCESS_EXACT",
    time: new Date().toISOString(),
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    no_delete: true,
    priority: {
      port_3000: port3000 ? "ACTIVE" : "UNAVAILABLE",
      port_3000_detail: port3000,
      app_js_processes: nodeApp
    },
    ports_recognized: ports.ports,
    processes_recognized: processes.processes,
    real_memory: realMemory(),
    real_disk: realDisk(),
    policy: {
      priority_port: 3000,
      structure_lock: true,
      no_fake_ports: true,
      no_fake_processes: true,
      raid60_plus: "PACKET_CACHE_GROUPS_LOGICAL",
      memory: "RECOGNIZED_RAM_HOT_WINDOW_PLUS_LOGICAL_MIRROR",
      execution: "MICRO_PACKET_STREAMING"
    }
  };

  fs.writeFileSync(path.join(OUT,"ports_process_exact_report.json"), JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(OUT,"ports_process_exact_summary.json"), JSON.stringify({
    ok: report.ok,
    time: report.time,
    doctrine: report.doctrine,
    port_3000: report.priority.port_3000,
    port_3000_detail: report.priority.port_3000_detail,
    recognized_ports_count: report.ports_recognized.length,
    recognized_processes_count: report.processes_recognized.length,
    app_js_processes: report.priority.app_js_processes,
    real_memory: report.real_memory,
    real_disk: report.real_disk
  },null,2));

  return report;
}

if (require.main === module) {
  const r = build();
  console.log(JSON.stringify({
    ok: r.ok,
    module: r.module,
    doctrine: r.doctrine,
    priority: r.priority,
    recognized_ports_count: r.ports_recognized.length,
    recognized_ports: r.ports_recognized.map(p => ({
      port: p.port,
      priority: p.priority,
      pid: p.pid,
      process_name: p.process_name
    })),
    recognized_processes_count: r.processes_recognized.length,
    processes: r.processes_recognized.slice(0,20),
    real_memory: r.real_memory,
    real_disk: r.real_disk
  },null,2));
}
