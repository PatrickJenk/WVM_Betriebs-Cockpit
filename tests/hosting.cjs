const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib"),
  net = require("node:net");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { prepare } = require("../tools/prepare-infomaniak.cjs");
const { createPackage } = require("../tools/package-infomaniak.cjs");
const { crc32 } = require("../tools/zip.cjs");
assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
const project = path.resolve(__dirname, "..");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-hosting-"));
const source = path.join(fixture, "source");
fs.mkdirSync(source);
process.env.COCKPIT_DATA_DIR = source;
process.env.NODE_ENV = "development";
const store = require("../server-security.cjs");
const hash = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
};
let child;
let base;
const origin = "https://betrieb.waermeverbund.ch";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function unpack(archive, target) {
  const bytes = fs.readFileSync(archive);
  const names = [];
  let offset = 0;
  fs.mkdirSync(target, { recursive: true });
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18),
      length = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
    assert.ok(!name.split("/").includes(".."));
    const start = offset + 30 + length + extra;
    const value = zlib.inflateRawSync(bytes.subarray(start, start + size));
    assert.equal(crc32(value), bytes.readUInt32LE(offset + 14));
    const dest = path.join(target, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, value);
    names.push(name);
    offset = start + size;
  }
  return names;
}
async function call(url, method = "GET", payload, session = {}, headers = {}) {
  const r = await fetch(base + url, {
    method,
    headers: {
      "X-Forwarded-Proto": "https",
      ...(method !== "GET"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
      ...headers,
    },
    body:
      payload === undefined
        ? undefined
        : Buffer.isBuffer(payload)
          ? payload
          : JSON.stringify(payload),
  });
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  if (r.headers.get("set-cookie"))
    session.cookie = r.headers.get("set-cookie").split(";")[0];
  if (r.headers.get("x-csrf-token"))
    session.csrf = r.headers.get("x-csrf-token");
  return { status: r.status, value, headers: r.headers };
}
async function start(directory, port) {
  let log = "";
  child = spawn(process.execPath, ["server-hosting.cjs"], {
    cwd: directory,
    env: {
      ...process.env,
      COCKPIT_DATA_DIR: path.join(directory, "hosting-data"),
      COCKPIT_ORIGIN: origin,
      PORT: String(port),
      HOST: "127.0.0.1",
      COCKPIT_MFA_ENABLED: "0",
      COCKPIT_SCAN_MODE: "",
      COCKPIT_MAX_FILE_MB: "0.01",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => (log += b));
  child.stderr.on("data", (b) => (log += b));
  base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    try {
      await call("/");
      return;
    } catch {
      await wait(100);
    }
    if (child.exitCode !== null) throw Error(log);
  }
  throw Error("Hosting server did not start: " + log);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill();
  await done;
  child = null;
}
(async () => {
  const { seed, initializeStations, initializeDocumentFolders } =
    await import("../src/data/seed.js");
  const data = seed();
  initializeStations(data);
  initializeDocumentFolders(data);
  const adminHash = hash("OldAdminLocal123!");
  data.users = [
    {
      id: "admin",
      name: "WVM-admin",
      initials: "ADM",
      role: "Admin",
      company: "WVM",
      passwordHash: adminHash,
      mustChangePassword: false,
    },
    {
      id: "retired",
      name: "Alte Person",
      initials: "ALT",
      role: "WVM",
      company: "WVM",
      passwordHash: hash("OldMemberPassword123!"),
    },
  ];
  const plant = data.plants.find((p) => p.active && !p.deleted);
  data.documents = [
    {
      id: "existing-pdf",
      name: "Bestehend.pdf",
      siteId: plant.siteId,
      uploadedById: "retired",
      uploadedBy: "ALT",
    },
  ];
  data.entries = [
    {
      id: "entry",
      siteId: plant.siteId,
      plantId: plant.id,
      title: "Unverändert",
      description: "Originaltext",
      status: "Pendenz",
      priority: "Mittel",
      createdById: "retired",
      createdBy: "ALT",
      createdAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
      attachments: [],
    },
  ];
  fs.writeFileSync(path.join(source, "secret.key"), crypto.randomBytes(32));
  const pdf = Buffer.from("%PDF-1.4 original");
  fs.writeFileSync(path.join(source, "files/existing-pdf"), pdf);
  store.persist({ revision: 1, data });
  store.db
    .prepare("INSERT INTO uploads VALUES(?,?,?,?,?)")
    .run("existing-pdf", "retired", pdf.length, "application/pdf", Date.now());
  store.db
    .prepare("INSERT INTO mention_reads VALUES(?,?)")
    .run("retired", "entry");
  const reset = prepare(source);
  assert.ok(fs.existsSync(path.join(reset.backup, "cockpit.sqlite")));
  const prepared = store.read();
  assert.equal(prepared.data.users.length, 1);
  assert.equal(prepared.data.users[0].passwordHash, adminHash);
  assert.equal(prepared.data.entries[0].createdByName, "Alte Person");
  assert.equal(prepared.data.entries[0].description, "Originaltext");
  assert.equal(prepared.data.documents[0].uploadedByName, "Alte Person");
  assert.ok(!JSON.stringify(prepared.data.retiredUsers).includes("password"));
  const result = createPackage({
    source,
    output: path.join(fixture, "package"),
  });
  const directory = path.join(fixture, "unpacked");
  const names = unpack(result.archive, directory);
  assert.ok(names.includes("hosting-data/cockpit.sqlite"));
  assert.ok(
    !names.some((n) =>
      /Einrichtung-NUR|before-infomaniak|node_modules|\.git\//.test(n),
    ),
  );
  assert.ok(
    fs
      .readFileSync(path.join(directory, "hosting-data/files/existing-pdf"))
      .equals(pdf),
  );
  const updates = unpack(result.update, path.join(fixture, "update"));
  assert.ok(!updates.some((n) => n.startsWith("hosting-data/")));
  const setupCode = fs
    .readFileSync(result.codeFile, "utf8")
    .match(/gültig 30 Tage\):\n([^\n]+)/)[1];
  assert.ok(
    !fs
      .readFileSync(path.join(directory, "hosting-data/cockpit.sqlite"))
      .includes(Buffer.from(setupCode)),
  );
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  await start(directory, port);
  assert.match((await call("/")).value, /sicher einrichten/);
  assert.equal((await call("/api/state")).status, 403);
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "OldAdminLocal123!",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/hosting-setup", "POST", {
        setupCode: "wrong",
        currentPassword: "OldAdminLocal123!",
        password: "NewHostingAdminSecure123!",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/hosting-setup", "POST", {
        setupCode,
        currentPassword: "wrong",
        password: "NewHostingAdminSecure123!",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/hosting-setup", "POST", {
        setupCode,
        currentPassword: "OldAdminLocal123!",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/hosting-setup", "POST", {
        setupCode,
        currentPassword: "OldAdminLocal123!",
        password: "OldAdminLocal123!",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/hosting-setup",
        "POST",
        {
          setupCode,
          currentPassword: "OldAdminLocal123!",
          password: "NewHostingAdminSecure123!",
        },
        {},
        { Origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/hosting-setup", "POST", {
        setupCode,
        currentPassword: "OldAdminLocal123!",
        password: "NewHostingAdminSecure123!",
      })
    ).status,
    200,
  );
  for (let i = 0; i < 80; i++) {
    try {
      const r = await call("/api/session");
      if (r.status === 200) break;
    } catch {}
    await wait(100);
  }
  const admin = {};
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "OldAdminLocal123!",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/login",
        "POST",
        { name: "WVM-admin", password: "NewHostingAdminSecure123!" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "Alte Person",
        password: "OldMemberPassword123!",
      })
    ).status,
    401,
  );
  const online = await call("/api/state", "GET", undefined, admin);
  assert.equal(online.status, 200);
  assert.equal(online.value.data.documents.length, 1);
  assert.equal(online.value.data.users[0].hostingPasswordChangeRequired, false);
  assert.equal(
    (
      await call(
        "/api/files/new-pdf",
        "PUT",
        Buffer.from("%PDF-1.4 upload"),
        admin,
      )
    ).status,
    200,
    "Production hosting explicitly allows uploads without a scanner",
  );
  assert.equal(
    (await call("/api/files/anonymous", "PUT", Buffer.from("%PDF-1.4 upload")))
      .status,
    401,
  );
  assert.equal(
    (
      await call("/api/files/no-csrf", "PUT", Buffer.from("%PDF-1.4 upload"), {
        cookie: admin.cookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/files/invalid",
        "PUT",
        Buffer.from("<html>unsafe</html>"),
        admin,
      )
    ).status,
    415,
  );
  assert.equal(
    (await call("/api/files/oversize", "PUT", Buffer.alloc(12000, 65), admin))
      .status,
    413,
  );
  assert.match(
    (await call("/api/files/existing-pdf", "GET", undefined, admin)).value,
    /^%PDF-/,
  );
  assert.equal(
    (
      await call(
        "/api/hosting-setup",
        "POST",
        {
          setupCode,
          currentPassword: "OldAdminLocal123!",
          password: "another",
        },
        admin,
      )
    ).status,
    404,
  );
  const db = new DatabaseSync(
    path.join(directory, "hosting-data/cockpit.sqlite"),
  );
  assert.equal(db.prepare("SELECT used FROM hosting_setup").get().used, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM mention_reads").get().n, 1);
  db.close();
  await stop();
  await start(directory, port);
  assert.ok(!(await call("/")).value.includes("sicher einrichten"));
  assert.equal(
    (
      await call("/api/login", "POST", {
        name: "WVM-admin",
        password: "NewHostingAdminSecure123!",
      })
    ).status,
    200,
  );
  assert.equal(
    store.read().data.users[0].passwordHash,
    adminHash,
    "Packaging and remote setup never change local admin password",
  );
  console.log(
    "Hosting geprüft: Kontenarchiv, unverändertes lokales Admin-Passwort, ZIP/CRC und Datenübernahme, Einrichtungscode + altes Passwort, Pflichtwechsel, gesperrte Betriebsdaten vor Einrichtung, Einmaligkeit, Neustart und bestehende Dokumente.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    store.db.close();
  });
