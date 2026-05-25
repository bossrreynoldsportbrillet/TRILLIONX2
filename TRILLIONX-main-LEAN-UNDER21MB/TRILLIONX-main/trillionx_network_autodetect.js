"use strict";
const fs=require("fs"),path=require("path"),http=require("http"),https=require("https"),dns=require("dns").promises;
const {performance}=require("perf_hooks");
const DATA_DIR=path.join(__dirname,"data");
const LIVE_FILE=path.join(DATA_DIR,"trillionx_networks_live.json");
fs.mkdirSync(DATA_DIR,{recursive:true});
const r=x=>Number.isFinite(x)?+x.toFixed(3):0;

// === 50 réseaux publics passifs (id, catégorie, rôle, url) ===
const NETWORKS=[
 // BTC chain (10)
 {id:"btc_height_mempool",cat:"btc",role:"height",url:"https://mempool.space/api/blocks/tip/height"},
 {id:"btc_height_blockstream",cat:"btc",role:"height",url:"https://blockstream.info/api/blocks/tip/height"},
 {id:"btc_height_blockchain_info",cat:"btc",role:"height",url:"https://blockchain.info/q/getblockcount"},
 {id:"btc_fees_mempool",cat:"btc",role:"fees",url:"https://mempool.space/api/v1/fees/recommended"},
 {id:"btc_diff_mempool",cat:"btc",role:"diff",url:"https://mempool.space/api/v1/difficulty-adjustment"},
 {id:"btc_fee_est_blockstream",cat:"btc",role:"fee_est",url:"https://blockstream.info/api/fee-estimates"},
 {id:"btc_hashrate",cat:"btc",role:"hashrate",url:"https://blockchain.info/q/hashrate"},
 {id:"btc_ticker",cat:"btc",role:"ticker",url:"https://blockchain.info/ticker"},
 {id:"btc_stats_blockchair",cat:"btc",role:"stats",url:"https://api.blockchair.com/bitcoin/stats"},
 {id:"eth_stats_blockchair",cat:"eth",role:"stats",url:"https://api.blockchair.com/ethereum/stats"},
 // Markets (8)
 {id:"cg_ping",cat:"market",role:"ping",url:"https://api.coingecko.com/api/v3/ping"},
 {id:"cg_prices",cat:"market",role:"prices",url:"https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,monero&vs_currencies=usd,eur"},
 {id:"cg_global",cat:"market",role:"global",url:"https://api.coingecko.com/api/v3/global"},
 {id:"cc_btc",cat:"market",role:"asset",url:"https://api.coincap.io/v2/assets/bitcoin"},
 {id:"cc_eth",cat:"market",role:"asset",url:"https://api.coincap.io/v2/assets/ethereum"},
 {id:"kraken_time",cat:"market",role:"time",url:"https://api.kraken.com/0/public/Time"},
 {id:"kraken_status",cat:"market",role:"status",url:"https://api.kraken.com/0/public/SystemStatus"},
 {id:"bitstamp_btcusd",cat:"market",role:"ticker",url:"https://www.bitstamp.net/api/v2/ticker/btcusd/"},
 // Code hosts (6)
 {id:"gh_root",cat:"code",role:"root",url:"https://api.github.com"},
 {id:"gh_zen",cat:"code",role:"zen",url:"https://api.github.com/zen"},
 {id:"gh_rate",cat:"code",role:"rate",url:"https://api.github.com/rate_limit"},
 {id:"gh_meta",cat:"code",role:"meta",url:"https://api.github.com/meta"},
 {id:"gl_ver",cat:"code",role:"ver",url:"https://gitlab.com/api/v4/version"},
 {id:"cb_ver",cat:"code",role:"ver",url:"https://codeberg.org/api/v1/version"},
 // Registries (5)
 {id:"npm_ping",cat:"pkg",role:"ping",url:"https://registry.npmjs.org/-/ping?write=true"},
 {id:"npm_express",cat:"pkg",role:"meta",url:"https://registry.npmjs.org/express"},
 {id:"pypi_pip",cat:"pkg",role:"meta",url:"https://pypi.org/pypi/pip/json"},
 {id:"crates_sum",cat:"pkg",role:"summary",url:"https://crates.io/api/v1/summary"},
 {id:"rubygems_rails",cat:"pkg",role:"meta",url:"https://rubygems.org/api/v1/versions/rails.json"},
 // Network / DNS-over-HTTPS (7)
 {id:"cf_trace",cat:"net",role:"trace",url:"https://cloudflare.com/cdn-cgi/trace"},
 {id:"cf_1111",cat:"net",role:"trace",url:"https://1.1.1.1/cdn-cgi/trace"},
 {id:"cf_doh",cat:"net",role:"doh",url:"https://cloudflare-dns.com/dns-query?name=example.com&type=A"},
 {id:"goog_doh",cat:"net",role:"doh",url:"https://dns.google/resolve?name=example.com&type=A"},
 {id:"ipify",cat:"net",role:"ip",url:"https://api.ipify.org?format=json"},
 {id:"ipapi",cat:"net",role:"geo",url:"https://ipapi.co/json/"},
 {id:"httpbin",cat:"net",role:"echo",url:"https://httpbin.org/get"},
 // Time / Reference (4)
 {id:"wt_paris",cat:"time",role:"tz",url:"https://worldtimeapi.org/api/timezone/Europe/Paris"},
 {id:"wt_ip",cat:"time",role:"tz_ip",url:"https://worldtimeapi.org/api/ip"},
 {id:"wp_btc",cat:"ref",role:"summary",url:"https://en.wikipedia.org/api/rest_v1/page/summary/Bitcoin"},
 {id:"pub_apis",cat:"ref",role:"list",url:"https://api.publicapis.org/entries"},
 // AI / Docs (4)
 {id:"hf_models",cat:"ai",role:"models",url:"https://huggingface.co/api/models?limit=1"},
 {id:"hf_datasets",cat:"ai",role:"datasets",url:"https://huggingface.co/api/datasets?limit=1"},
 {id:"anthropic_docs",cat:"ai",role:"docs",url:"https://docs.anthropic.com/"},
 {id:"anthropic_www",cat:"ai",role:"www",url:"https://www.anthropic.com/"},
 // Status (6)
 {id:"st_github",cat:"status",role:"status",url:"https://www.githubstatus.com/api/v2/status.json"},
 {id:"st_cloudflare",cat:"status",role:"status",url:"https://www.cloudflarestatus.com/api/v2/status.json"},
 {id:"st_npm",cat:"status",role:"status",url:"https://status.npmjs.org/api/v2/status.json"},
 {id:"st_openai",cat:"status",role:"status",url:"https://status.openai.com/api/v2/status.json"},
 {id:"st_anthropic",cat:"status",role:"status",url:"https://status.anthropic.com/api/v2/status.json"},
 {id:"st_python",cat:"status",role:"status",url:"https://status.python.org/api/v2/status.json"}
];

function request(url,timeout){
 return new Promise(res=>{
  const t=performance.now(),lib=url.startsWith("https")?https:http;
  let done=false,end=v=>{if(done)return;done=true;res(v)};
  try{
   const req=lib.get(url,{timeout,headers:{"user-agent":"TRILLIONX-autodetect","accept":"application/json,text/plain,*/*"}},rsp=>{
    let chunks=[],n=0;
    rsp.on("data",d=>{n+=d.length;if(n<262144)chunks.push(d);else req.destroy()});
    rsp.on("end",()=>end({ok:rsp.statusCode<500,status:rsp.statusCode,ms:r(performance.now()-t),bytes:n,body:Buffer.concat(chunks).toString("utf8").slice(0,262144)}));
    rsp.on("error",e=>end({ok:false,status:0,ms:r(performance.now()-t),error:e.code||e.message,body:""}));
   });
   req.on("timeout",()=>{req.destroy();end({ok:false,status:0,ms:r(performance.now()-t),error:"timeout",body:""})});
   req.on("error",e=>end({ok:false,status:0,ms:r(performance.now()-t),error:e.code||e.message,body:""}));
  }catch(e){end({ok:false,status:0,ms:r(performance.now()-t),error:e.message,body:""})}
 });
}

function safeJSON(s){try{return JSON.parse(s)}catch{return null}}

async function parallel(items,fn,limit){
 const out=new Array(items.length);let i=0;
 async function worker(){while(i<items.length){const k=i++;try{out[k]=await fn(items[k])}catch(e){out[k]={ok:false,error:e.message}}}}
 await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
 return out;
}

// === Extraction des FAITS utilisables depuis les corps de réponse ===
function extractFacts(results){
 const get=id=>results.find(x=>x.id===id);
 const f={};
 // BTC heights (consensus = max des sources)
 const heights=[get("btc_height_mempool"),get("btc_height_blockstream"),get("btc_height_blockchain_info")]
   .filter(x=>x&&x.ok).map(x=>parseInt(x.body,10)).filter(Number.isFinite);
 if(heights.length){f.btc_height=Math.max(...heights);f.btc_height_sources=heights.length}
 // BTC fees
 const fees=get("btc_fees_mempool");if(fees&&fees.ok){const j=safeJSON(fees.body);if(j){f.btc_fee_fast=j.fastestFee;f.btc_fee_30m=j.halfHourFee;f.btc_fee_hour=j.hourFee}}
 // BTC difficulty
 const dff=get("btc_diff_mempool");if(dff&&dff.ok){const j=safeJSON(dff.body);if(j){f.btc_diff_change_pct=j.difficultyChange;f.btc_diff_progress_pct=j.progressPercent;f.btc_diff_remaining_blocks=j.remainingBlocks}}
 // BTC hashrate
 const hr=get("btc_hashrate");if(hr&&hr.ok){const v=parseFloat(hr.body);if(Number.isFinite(v))f.btc_hashrate_ghs=v}
 // BTC ticker (blockchain.info)
 const tk=get("btc_ticker");if(tk&&tk.ok){const j=safeJSON(tk.body);if(j&&j.USD){f.btc_usd_blockchain=j.USD.last;f.btc_eur_blockchain=j.EUR&&j.EUR.last}}
 // CoinGecko prices
 const cg=get("cg_prices");if(cg&&cg.ok){const j=safeJSON(cg.body);if(j){if(j.bitcoin){f.btc_usd=j.bitcoin.usd;f.btc_eur=j.bitcoin.eur}if(j.ethereum){f.eth_usd=j.ethereum.usd;f.eth_eur=j.ethereum.eur}if(j.monero){f.xmr_usd=j.monero.usd;f.xmr_eur=j.monero.eur}}}
 // CoinGecko global
 const cgg=get("cg_global");if(cgg&&cgg.ok){const j=safeJSON(cgg.body);if(j&&j.data){f.market_cap_usd=j.data.total_market_cap&&j.data.total_market_cap.usd;f.btc_dominance=j.data.market_cap_percentage&&j.data.market_cap_percentage.btc}}
 // CoinCap BTC
 const ccb=get("cc_btc");if(ccb&&ccb.ok){const j=safeJSON(ccb.body);if(j&&j.data){f.btc_usd_coincap=parseFloat(j.data.priceUsd);f.btc_supply=parseFloat(j.data.supply);f.btc_change_24h=parseFloat(j.data.changePercent24Hr)}}
 // CoinCap ETH
 const cce=get("cc_eth");if(cce&&cce.ok){const j=safeJSON(cce.body);if(j&&j.data){f.eth_usd_coincap=parseFloat(j.data.priceUsd);f.eth_change_24h=parseFloat(j.data.changePercent24Hr)}}
 // Bitstamp ticker
 const bs=get("bitstamp_btcusd");if(bs&&bs.ok){const j=safeJSON(bs.body);if(j){f.btc_usd_bitstamp=parseFloat(j.last);f.btc_24h_high=parseFloat(j.high);f.btc_24h_low=parseFloat(j.low);f.btc_24h_volume=parseFloat(j.volume)}}
 // GitHub rate limit (utile pour savoir quand on peut puller)
 const gh=get("gh_rate");if(gh&&gh.ok){const j=safeJSON(gh.body);if(j&&j.rate){f.gh_rate_remaining=j.rate.remaining;f.gh_rate_limit=j.rate.limit;f.gh_rate_reset=j.rate.reset}}
 // Cloudflare trace (IP publique vue par le réseau)
 const cf=get("cf_trace");if(cf&&cf.ok){const m=cf.body.match(/ip=([^\n]+)/);if(m)f.public_ip=m[1].trim();const lo=cf.body.match(/loc=([^\n]+)/);if(lo)f.public_loc=lo[1].trim()}
 // ipify fallback
 const ip=get("ipify");if(ip&&ip.ok){const j=safeJSON(ip.body);if(j&&j.ip&&!f.public_ip)f.public_ip=j.ip}
 // Worldtime Paris
 const wt=get("wt_paris");if(wt&&wt.ok){const j=safeJSON(wt.body);if(j){f.paris_datetime=j.datetime;f.paris_utc_offset=j.utc_offset}}
 // Status agrégé
 const statuses={};for(const k of ["st_github","st_cloudflare","st_npm","st_openai","st_anthropic","st_python"]){
  const e=get(k);if(e&&e.ok){const j=safeJSON(e.body);if(j&&j.status)statuses[k.replace("st_","")]=j.status.indicator||j.status.description}
 }
 if(Object.keys(statuses).length)f.service_status=statuses;
 return f;
}

async function detectAll({timeout=4000,concurrency=10}={}){
 const t0=performance.now();
 const results=await parallel(NETWORKS, async net=>{
  const rsp=await request(net.url,timeout);
  return {id:net.id,cat:net.cat,role:net.role,url:net.url,...rsp};
 }, concurrency);
 const ok=results.filter(x=>x.ok).length;
 const facts=extractFacts(results);
 // Health par catégorie
 const byCat={};for(const x of results){byCat[x.cat]=byCat[x.cat]||{ok:0,n:0};byCat[x.cat].n++;if(x.ok)byCat[x.cat].ok++}
 for(const k of Object.keys(byCat))byCat[k].pct=r(100*byCat[k].ok/byCat[k].n);
 const lat=results.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 const p50=lat.length?lat[Math.floor(lat.length*.5)]:null;
 const p95=lat.length?lat[Math.floor(lat.length*.95)]||lat.at(-1):null;
 const pct=results.length?ok/results.length:0;
 const health=r(Math.max(0,Math.min(100,100*pct - (p95&&p95>2500?10:0))));
 const state={
  engine:"TRILLIONX_NETWORK_AUTODETECT",
  version:"3.0",
  ts:new Date().toISOString(),
  policy:{passive:true,read_only:true,no_auth:true,no_port_scan:true,real_only:true},
  total_networks:NETWORKS.length,
  scan_duration_ms:r(performance.now()-t0),
  summary:{ok:`${ok}/${results.length}`,p50_ms:p50,p95_ms:p95,health,
   verdict: health>=85?"NETWORKS_GOOD" : health>=60?"NETWORKS_PARTIAL" : "NETWORKS_DEGRADED",
   facts_extracted:Object.keys(facts).length},
  by_category:byCat,
  facts,
  results:results.map(x=>({id:x.id,cat:x.cat,role:x.role,ok:x.ok,status:x.status,ms:x.ms,bytes:x.bytes,error:x.error||null}))
 };
 try{fs.writeFileSync(LIVE_FILE,JSON.stringify(state,null,2))}catch(e){}
 return state;
}

function getLive(){
 try{return JSON.parse(fs.readFileSync(LIVE_FILE,"utf8"))}catch{return null}
}

function getFact(key){
 const s=getLive();return s&&s.facts?s.facts[key]:undefined;
}

let _timer=null;
function startAutoRefresh(intervalMs=60000,opts={}){
 if(_timer)return _timer;
 const loop=async()=>{try{await detectAll(opts)}catch(e){}};
 loop();
 _timer=setInterval(loop,intervalMs);
 if(_timer.unref)_timer.unref();
 return _timer;
}
function stopAutoRefresh(){if(_timer){clearInterval(_timer);_timer=null}}

module.exports={NETWORKS,detectAll,getLive,getFact,startAutoRefresh,stopAutoRefresh,extractFacts,request,LIVE_FILE};

// Si exécuté directement: lance une détection one-shot
if(require.main===module){
 detectAll({timeout:Number(process.argv[2]||4000),concurrency:Number(process.argv[3]||10)})
  .then(s=>{console.log("[autodetect]",s.summary.ok,"facts:",Object.keys(s.facts).length,"health:",s.summary.health,"verdict:",s.summary.verdict);
   console.log("[facts]",JSON.stringify(s.facts,null,2).slice(0,2000));
   console.log("[file]",LIVE_FILE);
  }).catch(e=>{console.error(e);process.exit(1)});
}
