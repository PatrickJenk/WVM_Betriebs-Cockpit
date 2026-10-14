// Prüft die echte lokale Auslieferung inklusive aller Quellmodule und Logos.
const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os");
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-http-"));
const server = spawn(
  process.execPath,
  [path.join(__dirname, "../server.cjs")],
  {
    env: { ...process.env, PORT: "4174", COCKPIT_DATA_DIR: testStorage },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.stdout.once("data", async () => {
  try {
    for (const route of [
      "/",
      "/dev-reload.js",
      "/src/app.js",
      "/src/features/logbook.js",
      "/src/features/dashboard.js",
      "/src/features/documents.js",
      "/src/admin/administration.js",
      "/src/admin/structure.js",
      "/src/admin/management.js",
      "/src/auth/accounts.js",
      "/src/data/seed.js",
      "/src/services/repository.js",
      "/src/services/ids.js",
      "/src/services/structure.js",
      "/src/services/entry-status.js",
      "/src/services/mentions.js",
      "/src/styles/styles.css",
      "/assets/marzili-logo.png",
      "/assets/ewb-logo.png",
    ]) {
      const response = await fetch("http://127.0.0.1:4174" + route);
      assert.equal(response.status, 200, route);
      assert.ok((await response.arrayBuffer()).byteLength > 0, route);
    }
    const revision = await fetch("http://127.0.0.1:4174/__dev/revision");
    assert.equal(revision.headers.get("cache-control"), "no-store");
    const initialVersion = (await revision.json()).version;
    assert.match(initialVersion, /^[a-f0-9]{64}$/);
    const fs = require("node:fs");
    const fixture = path.join(__dirname, "../public/reload-check.tmp");
    try {
      fs.writeFileSync(fixture, "reload check");
      const changed = await fetch("http://127.0.0.1:4174/__dev/revision");
      assert.notEqual((await changed.json()).version, initialVersion);
    } finally {
      if (fs.existsSync(fixture)) fs.unlinkSync(fixture);
    }
    const blocked = await fetch("http://127.0.0.1:4174/package.json");
    assert.equal(blocked.status, 404);
    console.log(
      "Passed: real HTTP server, all modules, styles and both logos.",
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
});
setTimeout(() => {
  if (server.exitCode === null) {
    server.kill();
    console.error("HTTP-Prüfung hat Zeitlimit überschritten.");
    process.exitCode = 1;
  }
}, 10000).unref();
