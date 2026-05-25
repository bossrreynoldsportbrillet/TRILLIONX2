"use strict";

/*
 TRILLIONX VIRTUAL MIRROR RAM 512GB
 - Mirrors recognized real memory into logical 512GB address space
 - Does NOT allocate 512GB
 - Uses lazy bank/page index
 - Optional disk spill
 - REAL_ONLY_OR_UNAVAILABLE
*/

const os = require("os");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const CFG_PATH = path.join(ROOT, "config/trillionx_virtual_mirror_ram_512gb.json");

function gb(bytes){ return +(bytes / 1024 / 1024 / 1024).toFixed(3); }
function mb(bytes){ return +(bytes / 1024 / 1024).toFixed(3); }
function now(){ return new Date().toISOString(); }

function loadConfig(){
  return JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
}

function ensureDir(p){
  fs.mkdirSync(p, { recursive:true });
}

function realMemory(){
  const total = os.totalmem();
  const free = os.freemem();
  return {
    total_bytes: total,
    free_bytes: free,
    used_bytes: total - free,
    total_gb: gb(total),
    free_gb: gb(free),
    used_gb: gb(total-free),
    source: "os.totalmem/os.freemem",
    host: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
}

function buildMirrorIndex(){
  const cfg = loadConfig();
  const real = realMemory();

  const logicalGB = cfg.mirror_fabric.logical_capacity_gb;
  const banks = cfg.mirror_fabric.bank_count;
  const bankGB = cfg.mirror_fabric.bank_size_gb;

  const mirrorRatio = +(logicalGB / Math.max(real.total_gb, 0.001)).toFixed(3);

  const bankList = [];
  for (let i=0;i<banks;i++){
    bankList.push({
      bank_id: `VMR_BANK_${String(i).padStart(2,"0")}`,
      logical_start_gb: +(i * bankGB).toFixed(3),
      logical_end_gb: +((i+1) * bankGB).toFixed(3),
      logical_size_gb: bankGB,
      allocation: "LAZY_NOT_ALLOCATED",
      backing: i === 0 ? "REAL_RAM_WINDOW_CACHE" : "DISK_SPILL_OR_INDEX_ONLY",
      status: "AVAILABLE_LOGICAL_MIRROR"
    });
  }

  return {
    time: now(),
    module: "TRILLIONX_VIRTUAL_MIRROR_RAM_512GB",
    doctrine: "REAL_ONLY_OR_UNAVAILABLE",
    truth: "512GB_LOGICAL_MIRROR_NOT_PHYSICAL_ALLOCATION",
    physical_reference_profile: cfg.physical_reference_profile,
    real_memory_detected: real,
    virtual_mirror: {
      logical_capacity_gb: logicalGB,
      bank_count: banks,
      bank_size_gb: bankGB,
      mirror_ratio_vs_real_ram: mirrorRatio,
      allocation_policy: cfg.mirror_fabric.allocation_policy,
      max_real_ram_cache_mb_codespaces: cfg.mirror_fabric.max_real_ram_cache_mb_codespaces,
      spill_to_disk: cfg.mirror_fabric.spill_to_disk,
      spill_dir: cfg.mirror_fabric.spill_dir
    },
    banks: bankList,
    safety: {
      no_512gb_malloc: true,
      no_fake_telemetry: true,
      no_destructive_delete: true,
      max_single_object_mb: cfg.mirror_fabric.max_single_object_mb,
      max_workers_safe: cfg.mirror_fabric.max_workers_safe
    }
  };
}

function writeIndex(){
  const cfg = loadConfig();
  const indexPath = path.join(ROOT, cfg.mirror_fabric.index_file);
  const spillDir = path.join(ROOT, cfg.mirror_fabric.spill_dir);
  ensureDir(path.dirname(indexPath));
  ensureDir(spillDir);
  const index = buildMirrorIndex();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return index;
}

class VirtualMirrorStore {
  constructor(){
    this.cfg = loadConfig();
    this.spillDir = path.join(ROOT, this.cfg.mirror_fabric.spill_dir);
    ensureDir(this.spillDir);
    this.hot = new Map();
    this.maxHotBytes = this.cfg.mirror_fabric.max_real_ram_cache_mb_codespaces * 1024 * 1024;
    this.hotBytes = 0;
  }

  _safeKey(key){
    return String(key).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0,128);
  }

  _spillPath(key){
    return path.join(this.spillDir, this._safeKey(key) + ".json.gz");
  }

  put(key, value){
    let raw = Buffer.from(JSON.stringify({
      time: now(),
      key,
      value
    }));

    const maxObj = this.cfg.mirror_fabric.max_single_object_mb * 1024 * 1024;
    if (raw.length > maxObj) {
      return {
        ok:false,
        reason:"OBJECT_TOO_LARGE_FOR_SAFE_MIRROR",
        size_mb: mb(raw.length),
        max_single_object_mb: this.cfg.mirror_fabric.max_single_object_mb
      };
    }

    if (this.hotBytes + raw.length <= this.maxHotBytes) {
      this.hot.set(key, raw);
      this.hotBytes += raw.length;
      return {
        ok:true,
        tier:"HOT_REAL_RAM_WINDOW",
        key,
        size_mb: mb(raw.length),
        hot_used_mb: mb(this.hotBytes)
      };
    }

    const gz = zlib.gzipSync(raw);
    fs.writeFileSync(this._spillPath(key), gz);
    return {
      ok:true,
      tier:"DISK_SPILL_COMPRESSED",
      key,
      raw_mb: mb(raw.length),
      gzip_mb: mb(gz.length),
      path: this._spillPath(key)
    };
  }

  get(key){
    if (this.hot.has(key)) {
      return {
        ok:true,
        tier:"HOT_REAL_RAM_WINDOW",
        value: JSON.parse(this.hot.get(key).toString()).value
      };
    }

    const p = this._spillPath(key);
    if (!fs.existsSync(p)) {
      return { ok:false, reason:"NOT_FOUND" };
    }

    const raw = zlib.gunzipSync(fs.readFileSync(p));
    return {
      ok:true,
      tier:"DISK_SPILL_COMPRESSED",
      value: JSON.parse(raw.toString()).value
    };
  }

  stats(){
    const files = fs.existsSync(this.spillDir) ? fs.readdirSync(this.spillDir).filter(x=>x.endsWith(".json.gz")) : [];
    let spillBytes = 0;
    for (const f of files) {
      try { spillBytes += fs.statSync(path.join(this.spillDir,f)).size; } catch {}
    }
    return {
      module:"VirtualMirrorStore",
      doctrine:"REAL_ONLY_OR_UNAVAILABLE",
      logical_mirror_gb:this.cfg.mirror_fabric.logical_capacity_gb,
      physical_allocation_gb_claim:false,
      hot_entries:this.hot.size,
      hot_used_mb:mb(this.hotBytes),
      hot_limit_mb:this.cfg.mirror_fabric.max_real_ram_cache_mb_codespaces,
      spill_files:files.length,
      spill_used_mb:mb(spillBytes)
    };
  }
}

module.exports = {
  realMemory,
  buildMirrorIndex,
  writeIndex,
  VirtualMirrorStore
};

if (require.main === module) {
  const index = writeIndex();
  const store = new VirtualMirrorStore();
  store.put("BOOT_TEST", {
    message:"Virtual mirror RAM active",
    logical:"512GB",
    physical:"recognized memory only",
    safe:true
  });
  console.log(JSON.stringify({
    index_summary: {
      doctrine:index.doctrine,
      truth:index.truth,
      real_memory_detected:index.real_memory_detected,
      virtual_mirror:index.virtual_mirror,
      bank_count:index.banks.length
    },
    store_stats: store.stats()
  }, null, 2));
}
