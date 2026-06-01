const http = require('http');

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 10,
});

const TOTAL = 10000;
const CONCURRENCY = 10;
let done = 0, errors = 0;
const start = Date.now();

function makeRequest() {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port: 3160,
      path: '/api/memory-stress',
      agent: agent,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) done++;
        else errors++;
        resolve();
      });
    });
    req.on('error', () => { errors++; resolve(); });
  });
}

async function worker() {
  while (done + errors < TOTAL) {
    await makeRequest();
  }
}

(async () => {
  await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
  const dur = (Date.now() - start) / 1000;
  console.log(`${done} OK, ${errors} erreurs en ${dur.toFixed(2)}s`);
  console.log(`Throughput: ${(done/dur).toFixed(0)} req/s`);
  console.log(`Latence moyenne: ${((dur*1000)/done).toFixed(2)} ms/req`);
})();
