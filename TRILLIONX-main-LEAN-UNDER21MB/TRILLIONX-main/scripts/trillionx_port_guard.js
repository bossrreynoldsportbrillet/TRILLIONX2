const net = require("net");
const port = Number(process.env.PORT || 3000);
const s = net.createServer();
s.once("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[TRILLIONX] Port ${port} déjà occupé. Ferme l'ancien node app.js ou lance: lsof -ti:${port} | xargs -r kill -9`);
    process.exit(98);
  }
  console.error(err);
  process.exit(1);
});
s.once("listening", () => s.close(() => {
  console.log(`[TRILLIONX] Port ${port} libre.`);
  process.exit(0);
}));
s.listen(port, "0.0.0.0");
