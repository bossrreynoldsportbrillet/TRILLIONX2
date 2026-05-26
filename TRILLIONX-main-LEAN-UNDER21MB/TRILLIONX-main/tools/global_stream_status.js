const { scanAll } = require("../memory_fabric/trillionx_global_stream_fabric.js");

const result = scanAll({
  file_limit: 3000,
  chunk_kb: 16,
  max_chunks: 256
});

console.log(JSON.stringify(result, null, 2));
