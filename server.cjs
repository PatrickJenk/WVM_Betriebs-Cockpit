const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const api = require("./server-api.cjs");
const security = require("./server-security.cjs");
const maintenance = require("./server-backup.cjs").maintenance;
try {
  maintenance();
} catch (error) {
  console.error("Sicherung fehlgeschlagen: " + error.message);
  if (security.production) throw error;
}
setInterval(() => {
  try {
    maintenance();
  } catch (error) {
    console.error("Sicherung fehlgeschlagen: " + error.message);
  }
}, 3600000).unref();
const publicRoot = path.join(__dirname, "public");
const sourceRoot = path.join(__dirname, "src");
const lan = process.argv.includes("--lan");
const host =
  process.env.HOST || (lan || security.production ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT || (lan ? 4175 : 4173));
const startedAt = Date.now();
function revision(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return revision(file);
      const stat = fs.statSync(file);
      return entry.name + ":" + stat.mtimeMs + ":" + stat.size;
    })
    .join("|");
}
const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  png: "image/png",
};
http
  .createServer(
    { requestTimeout: 120000, headersTimeout: 15000, maxHeaderSize: 16384 },
    async (req, res) => {
      security.headers(res);
      if (await api(req, res)) return;
      res.setHeader("Cache-Control", "no-store");
      if (req.url.split("?")[0] === "/__dev/revision" && !security.production) {
        try {
          const crypto = require("node:crypto");
          const version = crypto
            .createHash("sha256")
            .update(startedAt + revision(sourceRoot) + revision(publicRoot))
            .digest("hex");
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ version }));
        } catch {
          res.writeHead(503);
          return res.end();
        }
      }
      let file, root;
      try {
        const url = decodeURIComponent(req.url.split("?")[0]);
        const isSource = url.startsWith("/src/");
        root = isSource ? sourceRoot : publicRoot;
        file = path.resolve(
          root,
          isSource ? url.slice(5) : url.slice(1) || "index.html",
        );
      } catch {
        res.writeHead(400);
        return res.end("Ungültige Adresse");
      }
      if (file === root) file = path.join(root, "index.html");
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      if (
        ![
          ".js",
          ".css",
          ".html",
          ".png",
          ".jpg",
          ".jpeg",
          ".svg",
          ".ico",
          ".woff2",
        ].includes(path.extname(file)) ||
        (security.production && file === path.join(publicRoot, "dev-reload.js"))
      ) {
        res.writeHead(404);
        return res.end();
      }
      fs.readFile(file, (err, bytes) => {
        if (err) {
          res.writeHead(404);
          return res.end("Nicht gefunden");
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(
          "Content-Type",
          types[path.extname(file).slice(1)] || "application/octet-stream",
        );
        if (security.production && file === path.join(publicRoot, "index.html"))
          bytes = Buffer.from(
            bytes
              .toString("utf8")
              .replace(/\s*<script src="\/dev-reload.js" defer><\/script>/, ""),
          );
        res.end(bytes);
      });
    },
  )
  .on("error", (err) => {
    console.error(
      err.code === "EADDRINUSE"
        ? "Port " +
            port +
            " ist bereits belegt. Die laufende Demo öffnen oder zuerst stoppen."
        : err.message,
    );
    process.exitCode = 1;
  })
  .listen(port, host, () => {
    console.log(
      "Cockpit: http://localhost:" +
        port +
        "\nProjekt: " +
        __dirname +
        (security.production
          ? "\nProduktionsmodus."
          : "\nAutomatisches Neuladen bei gespeicherten Änderungen aktiv."),
    );
    if (lan) {
      const interfaces = require("node:os").networkInterfaces();
      for (const addresses of Object.values(interfaces)) {
        for (const address of addresses || []) {
          if (address.family === "IPv4" && !address.internal) {
            console.log("Im Netzwerk: http://" + address.address + ":" + port);
          }
        }
      }
    }
  });
