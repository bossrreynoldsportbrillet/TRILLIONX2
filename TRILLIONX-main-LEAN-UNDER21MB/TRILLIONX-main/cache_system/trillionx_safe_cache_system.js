"use strict";

/*
 TRILLIONX SAFE CACHE SYSTEM
 - Bounded RAM cache
 - No fake 512GB allocation
 - Safe for Codespaces
*/

class SafeCache {
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries || 512;
    this.maxValueChars = opts.maxValueChars || 60000;
    this.map = new Map();
  }

  set(key, value) {
    let v = value;
    if (typeof v !== "string") v = JSON.stringify(v);
    if (v.length > this.maxValueChars) {
      v = v.slice(0, this.maxValueChars) + "\n...TRUNCATED_BY_TRILLIONX_SAFE_CACHE...";
    }
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
    this.map.set(key, { time: Date.now(), value: v });
    return true;
  }

  get(key) {
    return this.map.get(key)?.value ?? null;
  }

  stats() {
    let chars = 0;
    for (const v of this.map.values()) chars += v.value.length;
    return {
      entries: this.map.size,
      approx_chars: chars,
      approx_mb: +(chars / 1024 / 1024).toFixed(3),
      max_entries: this.maxEntries,
      max_value_chars: this.maxValueChars,
      doctrine: "SAFE_BOUNDED_CACHE_NO_FAKE_RAM"
    };
  }

  clear() {
    const n = this.map.size;
    this.map.clear();
    return n;
  }
}

module.exports = { SafeCache };
