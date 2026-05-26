const fs=require("fs"),os=require("os"),cp=require("child_process"),crypto=require("crypto"),zlib=require("zlib");
fs.mkdirSync("data",{recursive:true});
const sh=(c,t=5000)=>{try{return cp.execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:t}).trim()}catch{return""}};
const has=c=>!!sh(`command -v ${c} 2>/dev/null`);
const flags=(()=>{try{return fs.readFileSync("/proc/cpuinfo","utf8")}catch{return""}})();
const f=k=>new RegExp("\\b"+k+"\\b").test(flags);
const list=(cmd)=>sh(cmd,8000).split("\n").filter(Boolean).slice(0,500);

function ffmpegDetect(){
 const ok=has("ffmpeg"), fp=has("ffprobe");
 const out={ffmpeg:ok,ffprobe:fp,version:ok?sh("ffmpeg -version | head -1"):"UNAVAILABLE"};
 if(ok){
  out.codecs=list("ffmpeg -hide_banner -codecs 2>/dev/null | tail -n +11");
  out.formats=list("ffmpeg -hide_banner -formats 2>/dev/null | tail -n +5");
  out.protocols=list("ffmpeg -hide_banner -protocols 2>/dev/null");
  out.filters=list("ffmpeg -hide_banner -filters 2>/dev/null | tail -n +9");
 } else {
  out.note="FFmpeg non installé/exposé. Catalogue logiciel préparé, backend réel indisponible.";
 }
 return out;
}
function networkDetect(){
 const ifs=os.networkInterfaces();
 const interfaces=[];
 for(const [name,arr] of Object.entries(ifs))for(const x of arr||[])interfaces.push({name,family:x.family,address:x.address,internal:x.internal,cidr:x.cidr,mac:x.mac});
 return {
  interfaces,
  ip_route:sh("ip route 2>/dev/null || route -n 2>/dev/null"),
  listening:sh("ss -lntup 2>/dev/null | head -120 || netstat -lntup 2>/dev/null | head -120"),
  tools:{curl:has("curl"),wget:has("wget"),openssl:has("openssl"),ip:has("ip"),ss:has("ss"),ping:has("ping"),traceroute:has("traceroute"),dig:has("dig"),nslookup:has("nslookup")}
 };
}
const iana_like_protocol_catalog=[
 {num:1,key:"ICMP",class:"network_control"},
 {num:2,key:"IGMP",class:"multicast"},
 {num:4,key:"IPv4-in-IP",class:"encapsulation"},
 {num:6,key:"TCP",class:"transport"},
 {num:17,key:"UDP",class:"transport"},
 {num:41,key:"IPv6",class:"encapsulation"},
 {num:47,key:"GRE",class:"tunnel"},
 {num:50,key:"ESP",class:"ipsec"},
 {num:51,key:"AH",class:"ipsec"},
 {num:58,key:"IPv6-ICMP",class:"network_control"},
 {num:88,key:"EIGRP",class:"routing"},
 {num:89,key:"OSPF",class:"routing"},
 {num:103,key:"PIM",class:"multicast"},
 {num:105,key:"SCPS",class:"space_satellite_transport"},
 {num:115,key:"L2TP",class:"tunnel"},
 {num:132,key:"SCTP",class:"transport"},
 {num:136,key:"UDPLite",class:"transport"}
];
const satellite_catalog=[
 {name:"SAT-MON",type:"satellite_monitoring",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"SCPS-TP",type:"space_transport",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"CCSDS_TM_TC",type:"space_packets",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"DVB-S",type:"satellite_broadcast",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"DVB-S2",type:"satellite_broadcast",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"DVB-S2X",type:"satellite_broadcast",status:"CATALOG_ONLY_UNLESS_BACKEND"},
 {name:"GNSS",type:"position_time_signal",status:"CATALOG_ONLY_UNLESS_RECEIVER"},
 {name:"NTP",type:"time_sync_network",status:"SOFTWARE_AVAILABLE_IF_NETWORK"},
 {name:"PTP_IEEE1588",type:"precision_time_network",status:"CATALOG_ONLY_UNLESS_HW"},
 {name:"STARLINK_LIKE_IP_BACKHAUL",type:"satellite_ip_backhaul",status:"CATALOG_ONLY_NO_PROVIDER_ACCESS"}
];
const media_catalog={
 video:["h264","hevc/h265","av1","vp8","vp9","mpeg2video","prores","dnxhd","theora","rawvideo"],
 audio:["aac","mp3","opus","vorbis","flac","alac","pcm","ac3","eac3","dts"],
 image:["png","jpeg","webp","gif","bmp","tiff","avif"],
 subtitles:["srt","ass","webvtt","dvdsub","mov_text"],
 containers:["mp4","mkv","webm","mov","avi","mpegts","flv","ogg","wav","flac"]
};
const crypto_compression={
 node_crypto_hashes:crypto.getHashes().slice(0,200),
 node_crypto_ciphers:crypto.getCiphers().slice(0,200),
 zlib:{gzip:true,deflate:true,brotli:!!zlib.brotliCompressSync},
 cpu_accel:{aes:f("aes"),sha_ni:f("sha_ni"),pclmulqdq:f("pclmulqdq"),avx:f("avx"),avx2:f("avx2"),avx512f:f("avx512f")}
};
const repo_scan=(()=>{
 let files=0, api=0, codecs=0, networks=0;
 function walk(d,depth=0){
  if(depth>5)return;
  let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return}
  for(const e of ents){
   if([".git","node_modules","_TRILLIONX_SNAPSHOT_KEEP"].includes(e.name))continue;
   const p=d+"/"+e.name;
   if(e.isDirectory())walk(p,depth+1);
   else if(/\.(js|json|md|txt|html)$/i.test(e.name)){
    files++;
    let s="";try{s=fs.readFileSync(p,"utf8").slice(0,500000)}catch{}
    api+=(s.match(/\/api\//g)||[]).length;
    codecs+=(s.match(/codec|ffmpeg|audio|video|h264|hevc|av1|opus|webgpu|cuda|vulkan/gi)||[]).length;
    networks+=(s.match(/tcp|udp|http|https|websocket|socket|satellite|starlink|scps|ccsds|network|port/gi)||[]).length;
   }
  }
 }
 walk(".");
 return {files,api_mentions:api,codec_mentions:codecs,network_mentions:networks};
})();
const ff=ffmpegDetect(), net=networkDetect();
const real_layers={
 ffmpeg_real:ff.ffmpeg,
 ffprobe_real:ff.ffprobe,
 network_real:true,
 satellite_real:false,
 gpu_media_real:has("nvidia-smi")||has("vulkaninfo"),
 crypto_real:true,
 compression_real:true
};
const report={
 engine:"TRILLIONX_CODEX_CODECS_NETWORK_SATELLITE_CATALOG",
 ts:new Date().toISOString(),
 target:"TRILLIONX",
 host_role:"CODESPACES_SUPPORT_ONLY",
 real_layers,
 ffmpeg:ff,
 network:net,
 protocol_catalog:iana_like_protocol_catalog,
 satellite_catalog,
 media_catalog,
 crypto_compression,
 repo_scan,
 activation_policy:{
  media_codecs:ff.ffmpeg?"REAL_FFMPEG_BACKEND":"CATALOG_READY_FFMPEG_NOT_EXPOSED",
  network_codecs:"REAL_LOCAL_NETWORK_STACK_PLUS_PROTOCOL_CATALOG",
  satellite:"CATALOG_READY_REAL_SAT_BACKEND_REQUIRED",
  crypto:"REAL_NODE_CRYPTO_AND_CPU_FLAGS",
  compression:"REAL_NODE_ZLIB_BROTLI"
 },
 truth_policy:{
  real_only:true,
  no_fake_satellite:true,
  no_fake_gpu_codec:true,
  no_fake_provider_access:true,
  catalogs_are_capability_maps_not_physical_links:true
 }
};
const file=`data/trillionx_codex_codecs_network_satellite_${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify(report,null,2));
fs.writeFileSync("data/trillionx_codex_codecs_network_satellite_latest.json",JSON.stringify(report,null,2));
console.log("=== TRILLIONX CODEX/CODECS/NETWORK/SATELLITE CATALOG ===");
console.log("FFMPEG:",ff.ffmpeg?"REAL":"NOT_EXPOSED");
console.log("NETWORK INTERFACES:",net.interfaces.length);
console.log("PROTOCOL CATALOG:",iana_like_protocol_catalog.length);
console.log("SATELLITE CATALOG:",satellite_catalog.length);
console.log("CRYPTO HASHES:",crypto_compression.node_crypto_hashes.length);
console.log("CIPHERS:",crypto_compression.node_crypto_ciphers.length);
console.log("REPO SCAN:",JSON.stringify(repo_scan));
console.log("VERDICT:",report.activation_policy);
console.log("REPORT =",file);
