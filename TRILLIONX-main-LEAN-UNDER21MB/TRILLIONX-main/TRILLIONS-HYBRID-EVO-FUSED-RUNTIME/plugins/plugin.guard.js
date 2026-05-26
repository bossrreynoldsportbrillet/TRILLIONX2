"use strict";
const ALLOWLIST = new Set([
  "node:zlib","node:crypto","node:fs","node:os","node:worker_threads",
  "piscina","workerpool","bullmq","p-queue","pino","prom-client","express-prom-bundle",
  "@opentelemetry/sdk-node","@opentelemetry/auto-instrumentations-node",
  "ffmpeg-static","fluent-ffmpeg","sharp","jimp","node-addon-api","napi-rs",
  "openai","@anthropic-ai/sdk","@google/genai","ollama","langchain","llamaindex","onnxruntime-node","@xenova/transformers",
  "ethers","viem","web3","bitcoinjs-lib","better-sqlite3","lmdb","level","ioredis","lru-cache",
  "helmet","express-rate-limit","zod","ajv","semver"
]);
function statusForPackage(name){return ALLOWLIST.has(name)?"ALLOWLISTED":"BLOCKED_UNTRUSTED";}
function guardManifest(manifest){
  const deps=(manifest.dependencies||[]).map(name=>({name,status:statusForPackage(name)}));
  const blocked=deps.filter(d=>d.status!=="ALLOWLISTED");
  return {ok:blocked.length===0, deps, blocked, policy:["ALLOWLIST_ONLY","NO_AUTO_INSTALL_UNKNOWN_PACKAGE","REAL_OR_UNAVAILABLE","NO_FAKE_BACKEND"]};
}
module.exports={ALLOWLIST,statusForPackage,guardManifest};
