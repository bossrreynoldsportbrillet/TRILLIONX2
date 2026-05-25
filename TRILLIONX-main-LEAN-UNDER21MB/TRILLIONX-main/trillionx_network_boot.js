"use strict";
const auto=require("./trillionx_network_autodetect");
auto.startAutoRefresh(Number(process.env.NETWORKS_INTERVAL_MS||60000),{timeout:4000,concurrency:10});
module.exports=auto;
