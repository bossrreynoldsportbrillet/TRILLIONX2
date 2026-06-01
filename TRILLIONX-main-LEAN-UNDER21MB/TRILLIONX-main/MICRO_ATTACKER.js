#!/usr/bin/env node
// μ-packet attacker: fragmente les attaques en micro-bursts avec yield
const http = require('http');
const CLONES = parseInt(process.env.CLONES || 60);
const ATTACK_N = parseInt(process.env.ATTACK_N || 500);
const BURST_SIZE = parseInt(process.env.BURST_SIZE || 30);
const YIELD_MS = parseInt(process.env.YIELD_MS || 2);
const PORT_START = parseInt(process.env.PORT_START || 3161);
const SPAWN_WAVE_MS = parseInt(process.env.SPAWN_WAVE_MS || 30);
const HEARTBEAT_MS = 500;
const MASTER_PORT = 3160;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const yield_ = () => new Promise(r => setImmediate(r));

let masterAlive = true;
let panic = false;
let killedCount = 0;
let opsCompleted = 0;
let opsFailed = 0;
const startTime = Date.now();

// Heartbeat master fabric
const heartbeat = setInterval(() => {
  http.get(`http://127.0.0.1:${MASTER_PORT}/api/memory-fabric`, res => {
    if (res.statusCode !== 200) { masterAlive = false; panic = true; }
    res.resume();
  }).on('error', () => { masterAlive = false; panic = true; })
    .setTimeout(2000, () => { masterAlive = false; });
}, HEARTBEAT_MS);

async function microBurst(port, n) {
  for (let i = 0; i < n; i++) {
    if (panic) return;
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/memory-stress?n=1`, res => {
          res.resume();
          res.on('end', () => { opsCompleted++; resolve(); });
        });
        req.on('error', () => { opsFailed++; resolve(); });
        req.setTimeout(3000, () => { req.destroy(); opsFailed++; resolve(); });
      });
    } catch (e) { opsFailed++; }
  }
}

async function attackClone(idx, port) {
  const bursts = Math.ceil(ATTACK_N / BURST_SIZE);
  for (let b = 0; b < bursts; b++) {
    if (panic) return;
    const n = Math.min(BURST_SIZE, ATTACK_N - b * BURST_SIZE);
    await microBurst(port, n);
    await sleep(YIELD_MS);
    await yield_();
  }
}

async function main() {
  console.log(`========================================================`);
  console.log(`  μ-PACKET ATTACKER`);
  console.log(`========================================================`);
  console.log(`CLONES=${CLONES} ATTACK_N=${ATTACK_N} BURST_SIZE=${BURST_SIZE} YIELD=${YIELD_MS}ms`);
  console.log(`Total ops planned: ${CLONES * ATTACK_N}`);
  console.log(`Master target: port ${MASTER_PORT}`);
  console.log(`========================================================`);

  const attackPromises = [];
  for (let i = 0; i < CLONES; i++) {
    if (panic) break;
    attackPromises.push(attackClone(i, MASTER_PORT));
    await sleep(SPAWN_WAVE_MS);
    if (i % 10 === 9) await yield_();
  }

  await Promise.all(attackPromises);
  clearInterval(heartbeat);

  const dur = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(``);
  console.log(`========================================================`);
  console.log(`  μ-PACKET VERDICT`);
  console.log(`========================================================`);
  console.log(`Duration         : ${dur}s`);
  console.log(`Ops completed    : ${opsCompleted}`);
  console.log(`Ops failed       : ${opsFailed}`);
  console.log(`Ops/sec          : ${(opsCompleted / dur).toFixed(0)}`);
  console.log(`Master alive     : ${masterAlive ? 'YES' : 'NO'}`);
  console.log(`Panic triggered  : ${panic ? 'YES' : 'NO'}`);
  console.log(`========================================================`);

  process.exit(panic || !masterAlive ? 1 : 0);
}

process.on('SIGTERM', () => { panic = true; clearInterval(heartbeat); process.exit(2); });
main().catch(e => { console.error('FATAL', e); process.exit(3); });
