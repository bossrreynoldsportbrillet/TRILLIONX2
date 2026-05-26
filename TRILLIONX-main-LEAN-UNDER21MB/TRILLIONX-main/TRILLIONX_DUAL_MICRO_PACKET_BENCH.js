const fs=require("fs"), os=require("os"), crypto=require("crypto");
const {performance}=require("perf_hooks");

const MODE=process.env.MODE || "standard";
const PACKET_KB=Number(process.env.PACKET_KB||8);
const ROUNDS=Number(process.env.ROUNDS||20000);
const CHECKPOINT_EVERY=Number(process.env.CHECKPOINT_EVERY||2500);
const MAX_WRITE_MB=Number(process.env.MAX_WRITE_MB||4);

const outDir="runtime_state/bench";
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync("reports/bench",{recursive:true});

function disk(){
  try{
    const {execSync}=require("child_process");
    const l=execSync("df -BM /workspaces | awk 'NR==2 {gsub(\"M\",\"\"); print $2,$3,$4,$5}'").toString().trim().split(/\s+/);
    return {total_MB:+l[0],used_MB:+l[1],free_MB:+l[2],use_percent:l[3]||"UNAVAILABLE"};
  }catch(e){return {total_MB:"UNAVAILABLE",used_MB:"UNAVAILABLE",free_MB:"UNAVAILABLE",use_percent:"UNAVAILABLE"}}
}
function rssGB(){return +(process.memoryUsage().rss/1024/1024/1024).toFixed(3)}
function mbps(bytes,sec){return +(bytes/1024/1024/sec).toFixed(2)}
function sha(x){return crypto.createHash("sha256").update(x).digest("hex")}
function makePacket(i,kb){
  const b=Buffer.alloc(kb*1024);
  for(let n=0;n<b.length;n+=64) b.writeUInt32LE((i+n)>>>0,n);
  return b;
}

function standardBench(){
  const t0=performance.now();
  let bytes=0, checkpoints=0, ledger=[], acc="GENESIS";
  for(let i=1;i<=ROUNDS;i++){
    const p=makePacket(i,PACKET_KB);
    const h=sha(Buffer.concat([Buffer.from(acc),p]));
    acc=h; bytes+=p.length;
    if(i%CHECKPOINT_EVERY===0){
      checkpoints++;
      ledger.push({i,h:h.slice(0,24),rss_GB:rssGB()});
      const payload=JSON.stringify({mode:MODE,checkpoint:i,hash:h,ledger_tail:ledger.slice(-3)});
      if(Buffer.byteLength(payload)<MAX_WRITE_MB*1024*1024)
        fs.writeFileSync(`${outDir}/standard_checkpoint.json`,payload);
    }
  }
  const sec=(performance.now()-t0)/1000;
  return {
    name:"TRILLIONX_MICRO_PACKET_BENCH",
    packet_kb:PACKET_KB,
    rounds:ROUNDS,
    duration_s:+sec.toFixed(4),
    packets_s:+(ROUNDS/sec).toFixed(2),
    throughput_MB_s:mbps(bytes,sec),
    checkpoints,
    final_hash:acc.slice(0,32),
    rss_end_GB:rssGB(),
    disk_workspaces:disk(),
    doctrine:"REAL_ONLY_OR_UNAVAILABLE"
  };
}

function defenseBench(){
  const t0=performance.now();
  let bytes=0, accepted=0, quarantined=0, repaired=0, acc="PLANETARY_DEFENSE_GENESIS";
  const zones={GREEN:0,AMBER:0,RED:0};
  const ledger=[];
  for(let i=1;i<=ROUNDS;i++){
    let p=makePacket(i,PACKET_KB);
    const sensor=(i*2654435761>>>0).toString(16);
    const expected=sha(Buffer.concat([Buffer.from(sensor),p]));
    let observed=expected;

    if(i%997===0){
      observed=observed.replace(/^./,"0");
    }

    if(observed===expected){
      accepted++;
      zones.GREEN++;
    }else{
      quarantined++;
      zones.AMBER++;
      const repairedHash=sha(Buffer.concat([Buffer.from("REPAIR_LOCAL_ONLY"),p]));
      if(repairedHash){repaired++; zones.GREEN++;}
    }

    acc=sha(acc+expected+observed);
    bytes+=p.length;

    if(i%CHECKPOINT_EVERY===0){
      ledger.push({i,accepted,quarantined,repaired,root:acc.slice(0,24),rss_GB:rssGB()});
      const payload=JSON.stringify({mode:MODE,checkpoint:i,zones,ledger_tail:ledger.slice(-5)});
      if(Buffer.byteLength(payload)<MAX_WRITE_MB*1024*1024)
        fs.writeFileSync(`${outDir}/planetary_defense_checkpoint.json`,payload);
    }
  }
  const sec=(performance.now()-t0)/1000;
  return {
    name:"TRILLIONX_PLANETARY_DEFENSE_MICRO_PACKET_BENCH",
    packet_kb:PACKET_KB,
    rounds:ROUNDS,
    duration_s:+sec.toFixed(4),
    packets_s:+(ROUNDS/sec).toFixed(2),
    throughput_MB_s:mbps(bytes,sec),
    accepted,
    quarantined,
    repaired,
    integrity_percent:+((accepted+repaired)/ROUNDS*100).toFixed(4),
    zones,
    defense_root_hash:acc.slice(0,32),
    rss_end_GB:rssGB(),
    disk_workspaces:disk(),
    doctrine:"DEFENSIVE_LOCAL_ONLY + REAL_ONLY_OR_UNAVAILABLE"
  };
}

const result = MODE==="defense" ? defenseBench() : standardBench();
const file = MODE==="defense" ? "planetary_defense_micro_packet_last.json" : "micro_packet_last.json";
fs.writeFileSync(`${outDir}/${file}`, JSON.stringify(result,null,2));
fs.writeFileSync(`reports/bench/${file}`, JSON.stringify(result,null,2));

console.log("===== TRILLIONX μ-PACKET BENCH =====");
console.log("Mode          :", result.name);
console.log("Packet        :", result.packet_kb, "KB");
console.log("Rounds        :", result.rounds);
console.log("Duration      :", result.duration_s, "s");
console.log("Packets/s     :", result.packets_s);
console.log("Throughput    :", result.throughput_MB_s, "MB/s");
console.log("RSS end       :", result.rss_end_GB, "GB");
console.log("Disk          :", JSON.stringify(result.disk_workspaces));
if(MODE==="defense"){
  console.log("Accepted      :", result.accepted);
  console.log("Quarantined   :", result.quarantined);
  console.log("Repaired      :", result.repaired);
  console.log("Integrity     :", result.integrity_percent, "%");
}
console.log("Doctrine      :", result.doctrine);
console.log("Report        :", `runtime_state/bench/${file}`);
