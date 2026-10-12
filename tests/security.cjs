const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-security-")),
  servers = [];
const hash = (p) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(p, salt, 32).toString("hex");
};
async function start(port, extra = {}) {
  const p = spawn(process.execPath, [path.join(__dirname, "../server.cjs")], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      COCKPIT_MFA_ENABLED: "1",
      PORT: String(port),
      COCKPIT_DATA_DIR: root,
      COCKPIT_MAX_FILE_MB: "0.01",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  servers.push(p);
  await new Promise((resolve, reject) => {
    let errors = "";
    p.stderr.on("data", (b) => (errors += b));
    p.stdout.once("data", resolve);
    p.once("exit", (code) => reject(Error("Server " + code + ": " + errors)));
    p.once("error", reject);
  });
  return p;
}
async function call(route, method = "GET", payload, session = {}, extra = {}) {
  const r = await fetch("http://127.0.0.1:" + (session.port || 4180) + route, {
    method,
    headers: {
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
      ...(payload !== undefined && !Buffer.isBuffer(payload)
        ? { "Content-Type": "application/json" }
        : {}),
      ...extra,
    },
    body:
      payload === undefined
        ? undefined
        : Buffer.isBuffer(payload)
          ? payload
          : JSON.stringify(payload),
  });
  const cookie = r.headers.get("set-cookie")?.split(";")[0],
    csrf = r.headers.get("x-csrf-token");
  if (cookie) session.cookie = cookie;
  if (csrf) session.csrf = csrf;
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { status: r.status, value, headers: r.headers };
}
function otp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    bytes = [];
  for (const c of secret) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto
      .createHmac("sha1", Buffer.from(bytes))
      .update(counter)
      .digest(),
    offset = h.at(-1) & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
let scanner;
(async () => {
  const { seed } = await import("../src/data/seed.js"),
    { initializeAccounts } = await import("../src/auth/accounts.js");
  const data = seed();
  initializeAccounts(data);
  data.users = data.users.map((u) => ({
    ...u,
    passwordHash: hash(u.id === "admin" ? "9876" : "ChangeMe123"),
  }));
  const originalHash = data.users.find((u) => u.id === "admin").passwordHash;
  const archive = {
    ...data.entries[0],
    id: "archived",
    createdAt: "2026-01-01T12:00:00Z",
    updatedAt: "2026-01-01T12:00:00Z",
    completedAt: "2026-01-01T12:00:00Z",
    attachments: [{ id: "archive-pdf", name: "alt.pdf" }],
  };
  data.entries.push(archive);
  data.documents.push({
    id: "existing-pdf",
    siteId: "eiger",
    name: "vorhanden.pdf",
    uploadedById: "admin",
    uploadedBy: "ADM",
  });
  fs.mkdirSync(path.join(root, "files"));
  fs.writeFileSync(
    path.join(root, "files", "existing-pdf"),
    "%PDF-1.4 existing",
  );
  fs.writeFileSync(path.join(root, "files", "archive-pdf"), "%PDF-1.4 archive");
  fs.writeFileSync(
    path.join(root, "state.json"),
    JSON.stringify({ revision: 42, data }),
  );
  const child = await start(4180);
  assert.ok(fs.existsSync(path.join(root, "cockpit.sqlite")));
  assert.ok(
    fs
      .readdirSync(path.join(root, "backups"))
      .some((n) => n.startsWith("before-sqlite-")),
  );
  assert.equal(
    fs.readFileSync(path.join(root, "files", "existing-pdf"), "utf8"),
    "%PDF-1.4 existing",
  );
  const anon = await call("/api/bootstrap", "POST", {
    local: { users: [{ id: "evil" }] },
  });
  assert.equal(anon.status, 200);
  assert.deepEqual(anon.value.data.users, []);
  assert.deepEqual(anon.value.data.documents, []);
  assert.equal((await call("/api/state")).status, 401);
  const admin = {};
  const login = await call(
    "/api/login",
    "POST",
    { name: "WVM-admin", password: "9876" },
    admin,
  );
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.match(login.value.token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(login.value).includes(originalHash));
  assert.equal(
    (
      await call("/api/state", "GET", undefined, admin, {
        Origin: "https://evil.test",
      })
    ).status,
    403,
  );
  let snapshot = (await call("/api/state", "GET", undefined, admin)).value;
  assert.equal(
    (await call("/api/state", "PUT", snapshot, { cookie: admin.cookie }))
      .status,
    403,
  );
  assert.equal(
    (
      await call("/api/state", "PUT", snapshot, admin, {
        "X-CSRF-Token": "wrong",
      })
    ).status,
    403,
  );
  snapshot.data.documents.push({ id: "../../secret", siteId: "eiger" });
  assert.equal((await call("/api/state", "PUT", snapshot, admin)).status, 400);
  snapshot = (await call("/api/state", "GET", undefined, admin)).value;
  snapshot.data.folders[0].parentId = snapshot.data.folders[0].id;
  assert.equal((await call("/api/state", "PUT", snapshot, admin)).status, 400);
  const member = {};
  assert.equal(
    (
      await call(
        "/api/login",
        "POST",
        { name: "Patrick Jenk", password: "ChangeMe123" },
        member,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/state", "GET", undefined, member)).status,
    403,
  );
  assert.equal(
    (await call("/api/files/existing-pdf", "GET", undefined, member)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/password",
        "POST",
        { password: "PatrickSecure123" },
        member,
      )
    ).status,
    200,
  );
  snapshot = (await call("/api/state", "GET", undefined, member)).value;
  assert.ok(!snapshot.data.entries.some((e) => e.id === "archived"));
  assert.equal(
    (await call("/api/files/archive-pdf", "GET", undefined, member)).status,
    404,
  );
  assert.equal(
    (await call("/api/files/archive-pdf", "DELETE", undefined, member)).status,
    409,
  );
  assert.ok(fs.existsSync(path.join(root, "files", "archive-pdf")));
  snapshot.data.entries.find((e) => e.id === "seed-1").description +=
    "\nErgänzt";
  assert.equal((await call("/api/state", "PUT", snapshot, member)).status, 200);
  assert.ok(
    (await call("/api/state", "GET", undefined, admin)).value.data.entries.some(
      (e) => e.id === "archived",
    ),
  );
  assert.equal(
    (
      await call(
        "/api/files/active-html",
        "PUT",
        Buffer.from("<html><script>alert(1)</script></html>"),
        member,
      )
    ).status,
    415,
  );
  assert.equal(
    (await call("/api/files/too-big", "PUT", Buffer.alloc(12000, 65), member))
      .status,
    413,
  );
  assert.equal(
    (await call("/api/files/staged", "PUT", Buffer.from("%PDF-1.4 own"), admin))
      .status,
    200,
  );
  assert.equal(
    (await call("/api/files/staged", "DELETE", undefined, member)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/files/staged",
        "PUT",
        Buffer.from("%PDF-1.4 replace"),
        member,
      )
    ).status,
    403,
  );
  const oldSession = { ...member };
  assert.equal((await call("/api/logout", "POST", {}, member)).status, 200);
  assert.equal(
    (await call("/api/state", "GET", undefined, oldSession)).status,
    401,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call("/api/login", "POST", {
          name: "unknown",
          password: "incorrect",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "unknown",
        password: "incorrect",
      })
    ).status,
    429,
  );
  const early = spawnSync(
    process.execPath,
    [path.join(__dirname, "../server.cjs")],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        COCKPIT_DATA_DIR: root,
        COCKPIT_ORIGIN: "https://cockpit.test",
        PORT: "4181",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /unsicheres Passwort/);
  assert.equal(
    (
      await call(
        "/api/password",
        "POST",
        { password: "AdminSecurePassword123", currentPassword: "9876" },
        admin,
      )
    ).status,
    200,
  );
  const setup = await call(
    "/api/mfa/setup",
    "POST",
    { password: "AdminSecurePassword123" },
    admin,
  );
  assert.equal(setup.status, 200);
  const confirmed = await call(
    "/api/mfa/confirm",
    "POST",
    { code: otp(setup.value.secret) },
    admin,
  );
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.value.recoveryCodes.length, 8);
  assert.ok(!JSON.stringify(confirmed.value.data).includes(setup.value.secret));
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "AdminSecurePassword123",
        code: "000000",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/login",
        "POST",
        {
          name: "WVM-admin",
          password: "AdminSecurePassword123",
          code: otp(setup.value.secret),
        },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "AdminSecurePassword123",
        code: otp(setup.value.secret),
      })
    ).status,
    401,
  );
  const recovery = confirmed.value.recoveryCodes[0];
  assert.equal(
    (
      await call(
        "/api/login",
        "POST",
        {
          name: "WVM-admin",
          password: "AdminSecurePassword123",
          code: recovery,
        },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "AdminSecurePassword123",
        code: recovery,
      })
    ).status,
    401,
  );
  const audit = (await call("/api/audit", "GET", undefined, admin)).value
    .events;
  assert.ok(audit.some((e) => e.action === "auth.mfa.enabled"));
  assert.ok(!JSON.stringify(audit).includes("AdminSecurePassword123"));
  const backup = spawnSync(
    process.execPath,
    [path.join(__dirname, "../tools/backup.cjs")],
    {
      env: { ...process.env, COCKPIT_DATA_DIR: root, NODE_ENV: "development" },
      encoding: "utf8",
    },
  );
  assert.equal(backup.status, 0, backup.stderr);
  const backupPath = backup.stdout.trim(),
    restored = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-restored-"));
  const restore = spawnSync(
    process.execPath,
    [path.join(__dirname, "../tools/restore.cjs"), backupPath],
    {
      env: {
        ...process.env,
        COCKPIT_DATA_DIR: restored,
        NODE_ENV: "development",
      },
      encoding: "utf8",
    },
  );
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(
    fs.readFileSync(path.join(restored, "files", "existing-pdf"), "utf8"),
    "%PDF-1.4 existing",
  );
  const { DatabaseSync } = require("node:sqlite"),
    db = new DatabaseSync(path.join(restored, "cockpit.sqlite"));
  assert.equal(db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
  assert.ok(
    JSON.parse(db.prepare("SELECT json FROM state").get().json).data.users.find(
      (u) => u.id === "admin",
    ).mfaSecret,
  );
  db.close();
  const prepared = (await call("/api/state", "GET", undefined, admin)).value;
  prepared.data.users.find((u) => u.id === "mm").password =
    "MarcelTemporaryPassword123";
  assert.equal((await call("/api/state", "PUT", prepared, admin)).status, 200);
  const prod = await start(4181, {
    NODE_ENV: "production",
    COCKPIT_ORIGIN: "https://cockpit.test",
    COCKPIT_TRUST_PROXY: "1",
  });
  const p = { port: 4181 },
    proxy = { Origin: "https://cockpit.test", "X-Forwarded-Proto": "https" };
  assert.equal(
    (await call("/api/session", "GET", undefined, { port: 4181 })).status,
    403,
  );
  const logged = await call(
    "/api/login",
    "POST",
    {
      name: "WVM-admin",
      password: "AdminSecurePassword123",
      code: confirmed.value.recoveryCodes[1],
    },
    p,
    proxy,
  );
  assert.equal(logged.status, 200);
  assert.ok(!logged.value.token);
  assert.match(logged.headers.get("set-cookie"), /Secure/);
  const newAdminState = (await call("/api/state", "GET", undefined, p, proxy))
    .value;
  newAdminState.data.users.push({
    id: "second-admin",
    name: "Zweiter Admin",
    initials: "ZADM",
    role: "Admin",
    company: "WVM",
    password: "SecondTemporaryPassword123",
    mustChangePassword: true,
  });
  assert.equal(
    (await call("/api/state", "PUT", newAdminState, p, proxy)).status,
    200,
  );
  const newcomer = { port: 4181 };
  const first = await call(
    "/api/login",
    "POST",
    { name: "Zweiter Admin", password: "SecondTemporaryPassword123" },
    newcomer,
    proxy,
  );
  assert.equal(first.status, 200);
  assert.deepEqual(first.value.data.documents, []);
  const newPassword = await call(
    "/api/password",
    "POST",
    { password: "SecondSecurePassword123" },
    newcomer,
    proxy,
  );
  assert.equal(newPassword.status, 200);
  assert.equal(newPassword.value.data.users[0].mustSetupMfa, true);
  assert.equal(
    (await call("/api/state", "GET", undefined, newcomer, proxy)).status,
    403,
  );
  const secondSetup = await call(
    "/api/mfa/setup",
    "POST",
    { password: "SecondSecurePassword123" },
    newcomer,
    proxy,
  );
  assert.equal(secondSetup.status, 200);
  assert.equal(
    (
      await call(
        "/api/mfa/confirm",
        "POST",
        { code: otp(secondSetup.value.secret) },
        newcomer,
        proxy,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/state", "GET", undefined, newcomer, proxy)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/files/no-scanner",
        "PUT",
        Buffer.from("%PDF-1.4 new"),
        p,
        proxy,
      )
    ).status,
    503,
  );
  assert.equal(
    (await call("/__dev/revision", "GET", undefined, p, proxy)).status,
    404,
  );
  assert.equal(
    (await call("/dev-reload.js", "GET", undefined, p, proxy)).status,
    404,
  );
  const page = await call("/", "GET", undefined, p, proxy);
  assert.ok(!page.value.includes("dev-reload.js"));
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  scanner = net.createServer((socket) => {
    let pending = Buffer.alloc(0),
      command = false,
      contents = [];
    socket.on("data", (bytes) => {
      pending = Buffer.concat([pending, bytes]);
      if (!command) {
        const end = pending.indexOf(0);
        if (end < 0) return;
        assert.equal(pending.subarray(0, end).toString(), "zINSTREAM");
        pending = pending.subarray(end + 1);
        command = true;
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (pending.length < 4 + length) return;
        if (!length) {
          const infected = Buffer.concat(contents).includes(
            Buffer.from("EICAR"),
          );
          socket.end(
            "stream: " +
              (infected ? "Eicar-Test-Signature FOUND" : "OK") +
              "\0",
          );
          return;
        }
        contents.push(pending.subarray(4, 4 + length));
        pending = pending.subarray(4 + length);
      }
    });
  });
  await new Promise((resolve) => scanner.listen(0, "127.0.0.1", resolve));
  process.env.COCKPIT_CLAMAV_HOST = "127.0.0.1";
  process.env.COCKPIT_CLAMAV_PORT = String(scanner.address().port);
  const scan = require("../server-scanner.cjs"),
    clean = path.join(root, "clean-test"),
    bad = path.join(root, "bad-test");
  fs.writeFileSync(clean, "clean");
  fs.writeFileSync(bad, "EICAR");
  await scan(clean, true);
  await assert.rejects(
    () => scan(bad, true),
    (e) => e.status === 415,
  );
  console.log(
    "Passed: migration/file preservation, anonymous isolation, cookie/CSRF/origin controls, forced password change, path/cycle attacks, archived file rights, upload ownership/limits, logout/rate limit, MFA/recovery/replay, backup/restore, production HTTPS/dev isolation and scanner protocol.",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    servers.forEach((s) => s.kill());
    scanner?.close();
  });
setTimeout(() => {
  servers.forEach((s) => s.kill());
  scanner?.close();
  process.exitCode = 1;
  console.error("Security test timeout");
}, 45000).unref();
