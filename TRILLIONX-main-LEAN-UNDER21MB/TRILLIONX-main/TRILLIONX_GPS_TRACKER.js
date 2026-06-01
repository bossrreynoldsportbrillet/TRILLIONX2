// TRILLIONX_GPS_TRACKER.js v1.0
// Geolocation tracker for TX3 v1.4 fabric
// Source: ipapi.co (IP-based, ~1-5km precision)
// Future-ready: source field allows switch to termux-location later

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const FABRIC_HOST = "127.0.0.1";
const FABRIC_PORT = 3160;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MOVEMENT_THRESHOLD_M = 500;   // alert if >500m move
const LOG_DIR = path.join(__dirname, "runtime_state", "gps_tracker");
const LOG_FILE = path.join(LOG_DIR, "gps_timeline.jsonl");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let lastPosition = null;
let tickCount = 0;

// Haversine distance in meters
function distMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fetchIpGeo() {
  return new Promise((resolve, reject) => {
    https.get("https://ipapi.co/json/", (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(body);
          if (j.latitude == null || j.longitude == null) {
            return reject(new Error("no coords in response"));
          }
          resolve({
            lat: j.latitude,
            lon: j.longitude,
            city: j.city,
            region: j.region,
            country: j.country_code,
            postal: j.postal,
            timezone: j.timezone,
            ip: j.ip
          });
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function postToFabric(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: FABRIC_HOST,
      port: FABRIC_PORT,
      path: "/api/gps/store",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      },
      timeout: 5000
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("fabric timeout")); });
    req.write(data);
    req.end();
  });
}

function logLocal(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

async function tick() {
  tickCount++;
  const ts = new Date().toISOString();
  try {
    const geo = await fetchIpGeo();
    const entry = {
      ts,
      tick: tickCount,
      source: "ip_geoloc",
      provider: "ipapi.co",
      lat: geo.lat,
      lon: geo.lon,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      postal: geo.postal,
      ip: geo.ip,
      movement: null,
      status: "stationary"
    };

    if (lastPosition) {
      const d = distMeters(lastPosition.lat, lastPosition.lon, geo.lat, geo.lon);
      entry.movement = Math.round(d);
      if (d > MOVEMENT_THRESHOLD_M) {
        entry.status = "MOVING";
        console.log(`[${ts}] 🚨 MOVEMENT DETECTED: ${Math.round(d)}m from last position`);
      } else {
        entry.status = "stationary";
      }
    } else {
      entry.status = "first_fix";
    }

    logLocal(entry);

    try {
      const r = await postToFabric(entry);
      console.log(`[${ts}] ✅ tick=${tickCount} ${geo.city} (${geo.lat}, ${geo.lon}) → fabric ${r.status} | ${entry.status}${entry.movement !== null ? ` (Δ=${entry.movement}m)` : ""}`);
    } catch (e) {
      console.log(`[${ts}] ⚠️  tick=${tickCount} fabric DOWN (${e.message}) — logged locally only`);
    }

    lastPosition = { lat: geo.lat, lon: geo.lon };

  } catch (e) {
    console.log(`[${ts}] ❌ tick=${tickCount} fetch failed: ${e.message}`);
    logLocal({ ts, tick: tickCount, error: e.message });
  }
}

console.log("=".repeat(60));
console.log("TRILLIONX GPS TRACKER v1.0");
console.log("=".repeat(60));
console.log(`Fabric target  : http://${FABRIC_HOST}:${FABRIC_PORT}/api/gps/store`);
console.log(`Interval       : ${INTERVAL_MS / 1000}s`);
console.log(`Movement alert : >${MOVEMENT_THRESHOLD_M}m`);
console.log(`Local log      : ${LOG_FILE}`);
console.log(`Source         : ipapi.co (IP geoloc, ~1-5km precision)`);
console.log("=".repeat(60));

// First tick immediate, then every INTERVAL_MS
tick();
setInterval(tick, INTERVAL_MS);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n[SHUTDOWN] ${tickCount} ticks completed. Log: ${LOG_FILE}`);
  process.exit(0);
});
