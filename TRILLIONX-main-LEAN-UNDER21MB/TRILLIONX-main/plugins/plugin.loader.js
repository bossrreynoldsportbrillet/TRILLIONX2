"use strict";
const {TRILLIONS_PLUGIN_CATALOG}=require("./plugin.registry");
const {guardManifest}=require("./plugin.guard");
function listPlugins(){return TRILLIONS_PLUGIN_CATALOG.plugins.map(p=>({...p,guard:guardManifest(p)}));}
function auditPlugins(){
  const plugins=listPlugins();
  return {time:new Date().toISOString(),version:TRILLIONS_PLUGIN_CATALOG.version,total:plugins.length,ok:plugins.every(p=>p.guard.ok),blocked:plugins.filter(p=>!p.guard.ok),plugins,policy:TRILLIONS_PLUGIN_CATALOG.policy};
}
function registerPluginRoutes(app,ctx={}){
  const plugins=listPlugins();
  app.get('/api/plugins',(req,res)=>res.json({time:new Date().toISOString(),status:'PLUGIN_SYSTEM_ACTIVE_ADDITIVE',total:plugins.length,plugins:plugins.map(p=>({id:p.id,status:p.status,category:p.category,routes:p.routes}))}));
  app.get('/api/plugins/catalog',(req,res)=>res.json(TRILLIONS_PLUGIN_CATALOG));
  app.get('/api/plugins/audit',(req,res)=>res.json(auditPlugins()));
  for(const p of plugins){
    const base='/api/plugins/'+p.id;
    if(!ctx.routeExists || !ctx.routeExists(base)) app.get(base,(req,res)=>res.json({time:new Date().toISOString(),plugin:p.id,status:p.status,category:p.category,guard:p.guard,mode:'CATALOG_REGISTERED',honesty:'REAL_OR_UNAVAILABLE; no package is auto-installed'}));
    const audit=base+'/audit';
    if(!ctx.routeExists || !ctx.routeExists(audit)) app.get(audit,(req,res)=>res.json({time:new Date().toISOString(),plugin:p.id,audit:p.guard,dependencies:p.dependencies||[],routes:p.routes,install_policy:'manual_only_allowlist'}));
  }
}
module.exports={listPlugins,auditPlugins,registerPluginRoutes};
