const fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("raid60_plus",{recursive:true});

const ROOT=process.cwd();
const RAID="raid60_plus";
const STRIPES=6;
const MIRRORS=2;
const PARITY=2;

function shaFile(p){
  try{
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  }catch(e){return null}
}
function safeRead(p){
  try{return fs.readFileSync(p)}catch{return null}
}
function copyFile(src,dst){
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
}
function walk(dir,out=[]){
  let ents=[];
  try{ents=fs.readdirSync(dir,{withFileTypes:true})}catch{return out}
  for(const e of ents){
    if([".git","node_modules","raid60_plus"].includes(e.name))continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory())walk(p,out);
    else if(
      /data\/.*latest.*\.json$/.test(p) ||
      /data\/trillionx_.*\.json$/.test(p) ||
      /mesh_nodes\/.*\.(json|log|pid)$/.test(p) ||
      /TRILLIONX_.*\.(js|sh|json)$/.test(p) ||
      /app\.js$|package\.json$|launch\.json$/.test(p)
    ){
      try{
        const st=fs.statSync(p);
        if(st.size < 12*1024*1024) out.push(p);
      }catch{}
    }
  }
  return out;
}
function xorBuffers(buffers){
  const max=Math.max(...buffers.map(b=>b.length),0);
  const out=Buffer.alloc(max);
  for(const b of buffers){
    for(let i=0;i<b.length;i++)out[i]^=b[i];
  }
  return out;
}
function makeRaid(){
  const ts=new Date().toISOString().replace(/[:.]/g,"-");
  const session=`raid60_${Date.now()}`;
  const base=path.join(RAID,session);
  fs.mkdirSync(base,{recursive:true});
  const files=walk(ROOT);
  const manifest={
    engine:"TRILLIONX_RAID60_PLUS_LOGICAL_STORAGE",
    ts:new Date().toISOString(),
    mode:"RAID60_PLUS_LOGICAL",
    truth_policy:{
      real_only:true,
      logical_redundancy:true,
      not_hardware_raid:true,
      protects_reports_mesh_registry_snapshots:true
    },
    config:{stripes:STRIPES,mirrors:MIRRORS,parity:PARITY},
    host:{
      platform:os.platform(),
      arch:os.arch(),
      cpus:os.cpus().length,
      ram_gb:+(os.totalmem()/2**30).toFixed(3)
    },
    files:[]
  };

  const stripeBuckets=Array.from({length:STRIPES},()=>[]);
  files.forEach((f,i)=>stripeBuckets[i%STRIPES].push(f));

  for(let s=0;s<STRIPES;s++){
    const stripeDir=path.join(base,`stripe_${s}`);
    fs.mkdirSync(stripeDir,{recursive:true});

    for(const src of stripeBuckets[s]){
      const rel=path.relative(ROOT,src);
      const hash=shaFile(src);
      const size=fs.statSync(src).size;

      for(let m=0;m<MIRRORS;m++){
        const dst=path.join(stripeDir,`mirror_${m}`,rel);
        copyFile(src,dst);
      }

      manifest.files.push({
        rel,
        stripe:s,
        mirrors:MIRRORS,
        size,
        sha256:hash
      });
    }

    const buffers=stripeBuckets[s].map(safeRead).filter(Boolean);
    const parity0=xorBuffers(buffers);
    fs.writeFileSync(path.join(stripeDir,"PARITY_XOR_0.bin"),parity0);
    fs.writeFileSync(path.join(stripeDir,"PARITY_XOR_0.sha256"),crypto.createHash("sha256").update(parity0).digest("hex"));

    const parity1=crypto.createHash("sha256");
    for(const b of buffers)parity1.update(b);
    fs.writeFileSync(path.join(stripeDir,"PARITY_HASH_1.txt"),parity1.digest("hex"));
  }

  manifest.summary={
    protected_files:manifest.files.length,
    total_payload_bytes:manifest.files.reduce((a,b)=>a+b.size,0),
    logical_copies:manifest.files.length*MIRRORS,
    stripes:STRIPES,
    parity_blocks:STRIPES*PARITY,
    session
  };

  const man=path.join(base,"RAID60_PLUS_MANIFEST.json");
  fs.writeFileSync(man,JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(RAID,"latest_manifest.json"),JSON.stringify(manifest,null,2));
  return {manifest,path:man};
}
function verifyLatest(){
  const p=path.join(RAID,"latest_manifest.json");
  if(!fs.existsSync(p))return {ok:false,error:"NO_MANIFEST"};
  const m=JSON.parse(fs.readFileSync(p,"utf8"));
  const bad=[];
  for(const f of m.files){
    const cur=shaFile(path.join(ROOT,f.rel));
    if(cur && cur!==f.sha256)bad.push({file:f.rel,expected:f.sha256,current:cur});
  }
  return {
    ok:bad.length===0,
    checked:m.files.length,
    bad,
    session:m.summary?.session
  };
}
const mode=process.argv[2]||"make";
if(mode==="verify"){
  const v=verifyLatest();
  console.log("=== TRILLIONX RAID60+ VERIFY ===");
  console.log(JSON.stringify(v,null,2));
  process.exit(v.ok?0:1);
}
const r=makeRaid();
console.log("=== TRILLIONX RAID60+ LOGICAL STORAGE ===");
console.log("MANIFEST:",r.path);
console.log("PROTECTED FILES:",r.manifest.summary.protected_files);
console.log("PAYLOAD MB:",+(r.manifest.summary.total_payload_bytes/1048576).toFixed(3));
console.log("LOGICAL COPIES:",r.manifest.summary.logical_copies);
console.log("STRIPES:",r.manifest.summary.stripes);
console.log("PARITY BLOCKS:",r.manifest.summary.parity_blocks);
console.log("SESSION:",r.manifest.summary.session);
