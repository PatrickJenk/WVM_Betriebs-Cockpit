// Real local SMTP sockets: TLS/STARTTLS, certificate checks, auth and API/worker delivery.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  net = require("node:net"),
  tls = require("node:tls"),
  http = require("node:http"),
  crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
if (process.argv[2] === "--client") {
  (async () => {
    const [port, encryption, expectFailure, password] = process.argv.slice(3);
    const store = require("../server-security.cjs");
    const { seed } = await import("../src/data/seed.js");
    const data = seed();
    data.users = [
      {
        id: "admin",
        name: "SMTP Admin",
        initials: "SA",
        role: "Admin",
        systemRole: "main",
        passwordHash: "test-hash",
        email: "receiver@example.ch",
        mustChangePassword: false,
      },
    ];
    data.entries = [];
    data.accountVersion = 2;
    store.persist({ revision: 1, data });
    const api = require("../server-api.cjs"),
      service = require("../server-collaboration.cjs");
    const token = store.tokenFor(data.users[0], { setHeader() {} });
    const server = http.createServer((req, res) => api(req, res));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const base = "http://127.0.0.1:" + server.address().port;
      async function call(route, method = "GET", payload) {
        const r = await fetch(base + "/api/" + route, {
          method,
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        return { status: r.status, value: await r.json() };
      }
      assert.equal(
        (
          await call("mail", "PUT", {
            host: "127.0.0.1",
            port: Number(port),
            username: "sender@example.ch",
            password,
            encryption,
            senderName: "Cockpit Test",
            senderEmail: "sender@example.ch",
            replyTo: "reply@example.ch",
            baseUrl: "https://cockpit.example.ch",
            enabled: true,
          })
        ).status,
        200,
      );
      const test = await call("mail/test", "POST", {
        to: "receiver@example.ch",
      });
      if (expectFailure === "yes") {
        assert.equal(test.status, 502);
        assert.ok(!JSON.stringify(test).includes(password));
        return;
      }
      assert.equal(test.status, 200, JSON.stringify(test));
      const snapshot = (await call("state")).value,
        p = snapshot.data.plants.find((p) => p.active && !p.deleted);
      snapshot.data.entries.push({
        id: "smtp-entry",
        siteId: p.siteId,
        plantId: p.id,
        title: "SMTP Integration",
        description: "Realer lokaler Versand",
        status: "Pendenz",
        priority: "Hoch",
        dueDate: "2030-01-01",
        nextSteps: "",
        attachments: [],
        assigneeIds: ["admin"],
      });
      const saved = await call("state", "PUT", {
        revision: snapshot.revision,
        data: snapshot.data,
      });
      assert.equal(saved.status, 200, JSON.stringify(saved));
      const route = "leadership/jourfix/wvm";
      const draft = await call(route, "POST");
      assert.equal(draft.status, 200);
      const closed = await call(
        route + "/" + draft.value.id + "/close",
        "POST",
        {
          ...draft.value,
          time: "08:30",
          people: [{ id: "admin", status: "Anwesend", mail: true }],
        },
      );
      assert.equal(closed.status, 200, JSON.stringify(closed.value));
      assert.equal(closed.value.queued, 1);
      await service.worker();
      assert.equal(
        store.db
          .prepare("SELECT count(*) AS n FROM mail_outbox WHERE status='sent'")
          .get().n,
        2,
      );
      await service.worker();
      assert.equal(
        store.db.prepare("SELECT count(*) AS n FROM mail_outbox").get().n,
        2,
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
} else {
  (async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-smtp-"));
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
        path.join(root, "key.pem"),
        "-out",
        path.join(root, "cert.pem"),
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
    const options = {
      key: fs.readFileSync(path.join(root, "key.pem")),
      cert: fs.readFileSync(path.join(root, "cert.pem")),
    };
    const messages = [],
      sockets = new Set();
    let authOverPlain = false;
    function attach(socket, secured, allowStarttls = true, greeting = true) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      if (greeting) socket.write("220 localhost test SMTP\r\n");
      let pending = "",
        body = null,
        authorized = false;
      const receive = (bytes) => {
        pending += bytes.toString();
        let index;
        while ((index = pending.indexOf("\r\n")) >= 0) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 2);
          if (body !== null) {
            if (line === ".") {
              messages.push(body);
              body = null;
              socket.write("250 accepted\r\n");
            } else body += line + "\r\n";
            continue;
          }
          if (/^EHLO|^HELO/i.test(line))
            socket.write(
              "250-localhost\r\n" +
                (!secured && allowStarttls ? "250-STARTTLS\r\n" : "") +
                "250 AUTH PLAIN\r\n",
            );
          else if (/^STARTTLS/i.test(line)) {
            if (!allowStarttls) {
              socket.write("454 TLS unavailable\r\n");
              continue;
            }
            socket.removeListener("data", receive);
            socket.write("220 Ready for TLS\r\n");
            const secureSocket = new tls.TLSSocket(socket, {
              isServer: true,
              secureContext: tls.createSecureContext(options),
            });
            attach(secureSocket, true, false, false);
            return;
          } else if (/^AUTH PLAIN /i.test(line)) {
            if (!secured) authOverPlain = true;
            authorized =
              Buffer.from(line.slice(11), "base64").toString() ===
              "\0sender@example.ch\0test-smtp-secret";
            socket.write(
              authorized
                ? "235 authenticated\r\n"
                : "535 Authentication failed\r\n",
            );
          } else if (/^MAIL FROM|^RCPT TO/i.test(line))
            socket.write(
              authorized ? "250 OK\r\n" : "530 Authentication required\r\n",
            );
          else if (line === "DATA") {
            body = "";
            socket.write("354 End with dot\r\n");
          } else if (line === "QUIT") {
            socket.end("221 Bye\r\n");
          } else socket.write("250 OK\r\n");
        }
      };
      socket.on("data", receive);
    }
    const implicit = tls.createServer(options, (s) => attach(s, true)),
      starttls = net.createServer((s) => attach(s, false)),
      noTls = net.createServer((s) => attach(s, false, false));
    implicit.on("tlsClientError", () => {});
    const servers = [implicit, starttls, noTls];
    for (const s of servers)
      await new Promise((r) => s.listen(0, "127.0.0.1", r));
    async function client(
      server,
      encryption,
      trusted = true,
      badAuth = false,
      expectFailure = false,
    ) {
      const env = {
        ...process.env,
        NODE_ENV: "development",
        COCKPIT_DATA_DIR: fs.mkdtempSync(path.join(root, "data-")),
        COCKPIT_MAIL_DISABLED: "0",
      };
      delete env.NODE_TLS_REJECT_UNAUTHORIZED;
      delete env.NODE_EXTRA_CA_CERTS;
      if (trusted) env.NODE_EXTRA_CA_CERTS = path.join(root, "cert.pem");
      const child = spawn(
        process.execPath,
        [
          __filename,
          "--client",
          String(server.address().port),
          encryption,
          expectFailure ? "yes" : "no",
          badAuth ? "wrong-password" : "test-smtp-secret",
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let log = "";
      child.stdout.on("data", (b) => (log += b));
      child.stderr.on("data", (b) => (log += b));
      const timer = setTimeout(() => child.kill(), 30000);
      const code = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", resolve);
      });
      clearTimeout(timer);
      assert.equal(code, 0, log);
    }
    try {
      await client(implicit, "tls");
      await client(starttls, "starttls");
      assert.equal(
        messages.length,
        6,
        "two test mails, two automatic assignments and two PDF protocols",
      );
      assert.ok(messages.some((m) => m.includes("/#entry/smtp-entry")));
      assert.equal(
        messages.filter(
          (m) =>
            m.includes("Content-Type: application/pdf") &&
            m.includes("Content-Disposition: attachment"),
        ).length,
        2,
      );
      await client(implicit, "tls", false, false, true);
      await client(implicit, "tls", true, true, true);
      await client(noTls, "starttls", true, false, true);
      assert.equal(messages.length, 6, "failed TLS/auth never sends DATA");
      assert.equal(authOverPlain, false, "no plaintext credentials");
      console.log(
        "Passed: actual SMTP through API/worker, TLS and STARTTLS, trusted/untrusted certificates, authentication errors, enforced encryption and duplicate prevention.",
      );
    } finally {
      for (const socket of sockets) socket.destroy();
      for (const s of servers) await new Promise((r) => s.close(r));
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
