"use strict";
const TRILLIONS_PLUGIN_CATALOG = {
  version:"TRILLIONS_PLUGIN_CATALOG_V1_ADDITIVE",
  policy:["ALLOWLIST_ONLY","NO_AUTO_INSTALL_UNKNOWN_PACKAGE","REAL_OR_UNAVAILABLE","NO_FAKE_BACKEND","NO_FAKE_HARDWARE","NO_FAKE_AI","NO_FAKE_SIMD","PLUGIN_MUST_HAVE_MANIFEST","PLUGIN_MUST_HAVE_HEALTH_ROUTE","PLUGIN_MUST_HAVE_AUDIT_ROUTE"],
  plugins:[
    {id:"plugin-loader",status:"CORE_NATIVE",category:"architecture",dependencies:[],routes:["/api/plugins","/api/plugins/catalog","/api/plugins/audit"]},
    {id:"worker-pool",status:"RECOMMENDED",category:"worker_pool",dependencies:["piscina","workerpool","bullmq","p-queue"],routes:["/api/plugins/worker-pool","/api/plugins/worker-pool/audit"]},
    {id:"observability",status:"RECOMMENDED",category:"observability",dependencies:["pino","prom-client","express-prom-bundle","@opentelemetry/sdk-node","@opentelemetry/auto-instrumentations-node"],routes:["/api/plugins/observability","/api/plugins/observability/metrics"]},
    {id:"compression",status:"CORE_NATIVE",category:"compression",dependencies:["node:zlib"],routes:["/api/plugins/compression","/api/plugins/compression/benchmark","/api/plugins/compression/gzip","/api/plugins/compression/brotli"]},
    {id:"media-codecs",status:"OPTIONAL_CONNECTOR",category:"media",dependencies:["ffmpeg-static","fluent-ffmpeg","sharp","jimp"],routes:["/api/plugins/media","/api/plugins/media/ffmpeg","/api/plugins/media/probe"]},
    {id:"native-compute",status:"OPTIONAL_CONNECTOR",category:"native_compute",dependencies:["node-addon-api","napi-rs"],routes:["/api/plugins/native-compute","/api/plugins/native-compute/napi","/api/plugins/native-compute/wasm","/api/plugins/native-compute/simd"]},
    {id:"ai-provider-router",status:"OPTIONAL_CONNECTOR",category:"ai",dependencies:["openai","@anthropic-ai/sdk","@google/genai","ollama","langchain","llamaindex","onnxruntime-node","@xenova/transformers"],routes:["/api/plugins/ai","/api/plugins/ai/providers","/api/plugins/meta-ai"]},
    {id:"blockchain-stratum",status:"OPTIONAL_CONNECTOR",category:"blockchain",dependencies:["ethers","viem","web3","bitcoinjs-lib"],routes:["/api/plugins/blockchain","/api/plugins/stratum"]},
    {id:"storage-cache",status:"RECOMMENDED",category:"storage",dependencies:["better-sqlite3","lmdb","level","ioredis","lru-cache"],routes:["/api/plugins/storage","/api/plugins/cache"]},
    {id:"security-allowlist",status:"RECOMMENDED",category:"security",dependencies:["helmet","express-rate-limit","zod","ajv","semver"],routes:["/api/plugins/security","/api/plugins/security/audit"]}
  ]
};
module.exports={TRILLIONS_PLUGIN_CATALOG};
