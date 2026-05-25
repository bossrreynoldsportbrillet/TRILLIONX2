const { realMemory, streamComputeBuffer, streamComputeFile } = require("../memory_fabric/trillionx_stream_compute.js");

const file = process.argv[2] || "app.js";

const result = {
  status:"TRILLIONX_STREAM_COMPUTE_READY",
  doctrine:"REAL_ONLY_OR_UNAVAILABLE",
  principle:"few KB in recognized RAM, scripts/files as cold memory, compact result back to recognized memory",
  real_memory: realMemory(),
  packet_test: streamComputeBuffer("BOOT_PACKET_64KB", 64*1024),
  file_test: streamComputeFile(file,{chunk_kb:32,limit_chunks:1024})
};

console.log(JSON.stringify(result,null,2));
