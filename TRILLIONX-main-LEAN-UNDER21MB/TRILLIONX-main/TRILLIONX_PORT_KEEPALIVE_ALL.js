const fs=require("fs"),os=require("os"),cp=require("child_process"),http=require("http");
fs.mkdirSync("data",{recursive:true});
fs.mkdirSync("logs",{recursive:true});
fs.mkdirSync("runtime_state",{recursive:true});

const LOOP_MS=Number(process.argv[2]||20000);
const MODE=process.argv[3]||"daemon";

const PORTS=[
  {port:3000,name:"APP_JS_CORE",cmd:"PORT=3000 TRILLIONX_COMPACT_OUTPUT=1 TRILLIONX_OUTPUT_MAX=2500 nohup node app.js > logs/app.core.log 2>&1 &"},
  {port:3033,name:"HYPERBOLIC_JOKER",cmd:"nohup node TRILLIONX_HYPERBOLIC_MICROCONTROLLER_JOKER.js server 3033 > controllers/hyperbolic_microcontroller.log 2>&1 &"},
  {port:3044,name:"USEFUL_WORK_RUNTIME",cmd:"nohup node TRILLIONX_USEFUL_WORK_RUNTIME.js server 3044 > runtime_state/useful_work_runtime.log 2>&1 &"},
  {port:3160,name:"MEMORY_FABRIC_HBM3E_HAMRAM",cmd:"nohup node TRILLIONX_MEMORY_FABRIC_HBM3E_HAMRAM.js server 3160 > logs/memory_fabric_hbm3e_hamram.log 2>&1 &"},
  ...Array.from({length:20},(_,i)=>({
    port:3010+i,
    name:`VR_MESH_NODE_${i}`,
    cmd:`nohup node TRILLIONX_20_NODE_VR_MESH.js node ${i} > mesh_nodes/vr_node_${i}.log 2>&1 &`
  }))
];

const sh=(c,t=6000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch(e){return ""}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function isListening(port){
  const out=sh(`ss -lnt 2>/dev/null | awk '{print $4}' | grep -E '(^|:)${port}$' || true`);
  return !!out;
}
function curlOk(port){
  return new Promise(resolve=>{
    const req=http.get({host:"127.0.0.1",port,path:"/",timeout:1200},res=>{
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on("timeout",()=>{req.destroy();resolve(false)});
    req.on("error",()=>resolve(false));
  });
}
function startService(p){
  console.log(`[START] ${p.name} : ${p.port}`);
  sh(p.cmd,3000);
}
async function cycle(){
  const results=[];
  for(const p of PORTS){
    let listening=isListening(p.port);
    if(!listening){
      startService(p);
      await sleep(1200);
      listening=isListening(p.port);
    }
    const http_ok=listening ? await curlOk(p.port) : false;
    results.push({name:p.name,port:p.port,listening,http_ok,status:listening?"ACTIVE":"DOWN"});
    console.log(`${p.port} ${p.name} ${listening?"ACTIVE":"DOWN"} ${http_ok?"HTTP_OK":"HTTP_CHECK"}`);
  }

  const active=results.filter(x=>x.listening).length;
  const report={
    engine:"TRILLIONX_PORT_KEEPALIVE_ALL",
    ts:new Date().toISOString(),
    target:"TRILLIONX",
    host_role:"CODESPACES_SUPPORT_ONLY",
    mode:"keep required TRILLIONX ports active",
    active,
    total:PORTS.length,
    health:Number((active/PORTS.length*100).toFixed(3)),
    ports:results,
    listening_raw:sh("ss -lntp 2>/dev/null | grep -E '3000|301[0-9]|302[0-9]|3033|3044' || true"),
    memory:{
      free_gb:Number((os.freemem()/2**30).toFixed(3)),
      total_gb:Number((os.totalmem()/2**30).toFixed(3)),
      load1:Number(os.loadavg()[0].toFixed(3))
    },
    truth_policy:{
      real_only:true,
      opens_only_required_trillionx_ports:true,
      no_external_port_scan:true,
      no_fake_network:true,
      codespaces_may_need_port_forward_ui:true
    }
  };
  fs.writeFileSync("data/trillionx_port_keepalive_all_latest.json",JSON.stringify(report,null,2));
  fs.writeFileSync("runtime_state/trillionx_port_keepalive_all_latest.json",JSON.stringify(report,null,2));
  console.log(`HEALTH ${report.health}% ACTIVE ${active}/${PORTS.length}`);
}

async function main(){
  if(MODE==="once"){ await cycle(); return; }
  while(true){ await cycle(); await sleep(LOOP_MS); }
}
main().catch(e=>{console.error(e);process.exit(1)});
