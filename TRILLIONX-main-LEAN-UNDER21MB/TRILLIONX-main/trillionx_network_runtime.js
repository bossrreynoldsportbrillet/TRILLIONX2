"use strict";
const http=require("http");
const auto=require("./trillionx_network_autodetect");
const PORT=Number(process.env.NETWORKS_PORT||3050);
const INTERVAL=Number(process.env.NETWORKS_INTERVAL_MS||60000);

auto.startAutoRefresh(INTERVAL,{timeout:4000,concurrency:10});

const json=(res,code,obj)=>{res.statusCode=code;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("access-control-allow-origin","*");res.end(JSON.stringify(obj,null,2))};

http.createServer(async(req,res)=>{
 const u=req.url||"/";
 try{
  if(u==="/"||u==="/api/networks"){
   const live=auto.getLive();
   return json(res,200,{engine:"TRILLIONX_NETWORK_RUNTIME",routes:[
    "/api/networks/live","/api/networks/facts","/api/networks/health","/api/networks/categories",
    "/api/networks/fact/:key","/api/networks/results","/api/networks/refresh"],
    live_present:!!live, last_ts:live&&live.ts});
  }
  if(u==="/api/networks/live")return json(res,200,auto.getLive()||{error:"no_live_yet"});
  if(u==="/api/networks/facts")return json(res,200,(auto.getLive()||{}).facts||{});
  if(u==="/api/networks/results")return json(res,200,(auto.getLive()||{}).results||[]);
  if(u==="/api/networks/categories")return json(res,200,(auto.getLive()||{}).by_category||{});
  if(u==="/api/networks/health")return json(res,200,(auto.getLive()||{}).summary||{});
  if(u.startsWith("/api/networks/fact/")){
   const k=decodeURIComponent(u.split("/").pop());
   return json(res,200,{key:k,value:auto.getFact(k)??null});
  }
  if(u==="/api/networks/refresh"){
   const s=await auto.detectAll({timeout:4000,concurrency:10});
   return json(res,200,{refreshed:true,summary:s.summary,facts_count:Object.keys(s.facts).length});
  }
  json(res,404,{error:"not_found",path:u});
 }catch(e){json(res,500,{error:e.message})}
}).listen(PORT,"127.0.0.1",()=>{
 console.log(`[networks-runtime] http://127.0.0.1:${PORT}  refresh=${INTERVAL}ms  networks=${auto.NETWORKS.length}`);
});
