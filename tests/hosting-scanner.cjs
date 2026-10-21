const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  https = require("node:https"),
  crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
if (process.argv[2] === "--client") {
  process.env.COCKPIT_SCAN_URL = process.argv[3];
  process.env.COCKPIT_SCAN_TOKEN = "scanner-test-token";
  require("../server-scanner.cjs")(process.argv[4], true)
    .then(() => console.log("200"))
    .catch((error) => console.log(error.status || 500));
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-scanner-"));
  const openssl =
    process.env.OPENSSL ||
    (process.platform === "win32"
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl");
  const generated = spawnSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(directory, "key.pem"),
      "-out",
      path.join(directory, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    generated.status,
    0,
    generated.error?.message || generated.stderr,
  );
  const file = path.join(directory, "document");
  fs.writeFileSync(file, "%PDF-1.4 test only");
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  const server = https.createServer(
    {
      key: fs.readFileSync(path.join(directory, "key.pem")),
      cert: fs.readFileSync(path.join(directory, "cert.pem")),
    },
    (req, res) => {
      const chunks = [];
      req.on("data", (b) => chunks.push(b));
      req.on("end", () => {
        assert.equal(req.headers.authorization, "Bearer scanner-test-token");
        assert.equal(req.headers["x-content-sha256"], hash);
        assert.ok(Buffer.concat(chunks).equals(fs.readFileSync(file)));
        if (req.url === "/redirect") {
          res.writeHead(302, { Location: "/clean" });
          res.end();
          return;
        }
        if (req.url === "/huge") {
          res.end("x".repeat(70000));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            clean: req.url === "/pending" ? undefined : req.url !== "/bad",
            sha256: req.url === "/wrong" ? "wrong" : hash,
          }),
        );
      });
    },
  );
  function call(url, trusted = true) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      delete env.NODE_EXTRA_CA_CERTS;
      if (trusted) env.NODE_EXTRA_CA_CERTS = path.join(directory, "cert.pem");
      const child = spawn(
        process.execPath,
        [__filename, "--client", url, file],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let text = "",
        errors = "";
      child.stdout.on("data", (b) => (text += b));
      child.stderr.on("data", (b) => (errors += b));
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve(text.trim()) : reject(Error(errors)),
      );
    });
  }
  (async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = "https://127.0.0.1:" + server.address().port;
    for (const [endpoint, expected] of [
      ["/clean", "200"],
      ["/bad", "415"],
      ["/wrong", "503"],
      ["/pending", "503"],
      ["/redirect", "503"],
      ["/huge", "503"],
    ])
      assert.equal(await call(base + endpoint), expected, endpoint);
    assert.equal(
      await call(base + "/clean", false),
      "503",
      "untrusted TLS certificate",
    );
    assert.equal(
      await call("http://127.0.0.1/scan"),
      "503",
      "insecure transport",
    );
    console.log(
      "HTTPS-Scanner geprüft: Bytes/Hash/Token, Freigabe, Malware-Abweisung, unklare Antworten, Redirects, Antwortlimit und TLS-Prüfung.",
    );
  })()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => server.close());
}
