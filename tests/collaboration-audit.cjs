const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto");
process.env.NODE_ENV = "development";
process.env.COCKPIT_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "cockpit-audit-"),
);
process.env.COCKPIT_MAIL_DISABLED = "0";
const store = require("../server-security.cjs"),
  service = require("../server-collaboration.cjs");
let server;
(async () => {
  const { seed } = await import("../src/data/seed.js");
  const data = seed();
  const password = "AuditTestPasswort2026!",
    salt = crypto.randomBytes(16).toString("hex"),
    passwordHash =
      salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
  data.users = [
    {
      id: "main",
      name: "Main",
      initials: "MA",
      role: "Admin",
      systemRole: "main",
    },
    {
      id: "smtp",
      name: "SMTP",
      initials: "SM",
      role: "Administrator",
      systemPermissions: ["smtp"],
    },
    {
      id: "plain",
      name: "Normal Admin",
      initials: "NA",
      role: "Administrator",
    },
    { id: "member", name: "Member", initials: "ME", role: "WVM" },
  ].map((u) => ({
    ...u,
    email: u.id + "@example.ch",
    passwordHash,
    mustChangePassword: false,
  }));
  data.entries = [];
  data.accountVersion = 2;
  store.persist({ revision: 1, data });
  const api = require("../server-api.cjs");
  server = http.createServer((req, res) => api(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const tokens = Object.fromEntries(
    data.users.map((u) => [u.id, store.tokenFor(u, { setHeader() {} })]),
  );
  async function call(
    route,
    method = "GET",
    payload,
    who = "main",
    headers = {},
  ) {
    const r = await fetch(base + "/api/" + route, {
      method,
      headers: {
        ...(who ? { Authorization: "Bearer " + tokens[who] } : {}),
        "Content-Type": "application/json",
        ...headers,
      },
      body:
        payload === undefined
          ? undefined
          : Buffer.isBuffer(payload) || typeof payload === "string"
            ? payload
            : JSON.stringify(payload),
    });
    return {
      status: r.status,
      value: r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : Buffer.from(await r.arrayBuffer()),
    };
  }
  async function ok(...args) {
    const r = await call(...args);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value;
  }
  async function mutate(fn, who = "main", status = 200) {
    const s = await ok("state", "GET", undefined, who);
    fn(s.data);
    const r = await call(
      "state",
      "PUT",
      { revision: s.revision, data: s.data },
      who,
    );
    assert.equal(r.status, status, JSON.stringify(r.value));
    return r.value;
  }
  await ok("state");
  for (const action of [
    (u) => (u.password = "AnderePasswort2026!"),
    (u) => (u.active = false),
  ])
    await mutate(
      (d) => action(d.users.find((u) => u.id === "smtp")),
      "plain",
      403,
    );
  for (const action of [
    (d) => (d.users.find((u) => u.id === "main").active = false),
    (d) => (d.users = d.users.filter((u) => u.id !== "main")),
  ])
    await mutate(action, "main", 400);
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "member").systemRole = "admin";
    },
    "main",
    400,
  );
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "member").email = false;
    },
    "main",
    400,
  );
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "main").systemPermissions = null;
    },
    "main",
    400,
  );
  const config = {
    host: "smtp.example.ch",
    port: 587,
    username: "sender@example.ch",
    password: "audit-secret",
    senderName: "Audit",
    senderEmail: "sender@example.ch",
    replyTo: "",
    encryption: "starttls",
    enabled: true,
    baseUrl: "https://cockpit.example.ch",
  };
  await ok("mail", "PUT", config);
  for (const [endpoint, method] of [
    ["contacts", "GET"],
    ["contacts/images", "POST"],
    ["contacts/test", "PUT"],
    ["contacts/test", "DELETE"],
    ["mail", "GET"],
    ["mail", "PUT"],
    ["mail/test", "POST"],
  ])
    assert.equal(
      (await call(endpoint, method, method === "GET" ? undefined : {}, null))
        .status,
      401,
      endpoint,
    );
  for (const endpoint of ["mail", "contacts/test"])
    assert.equal((await call(endpoint, "PUT", "null")).status, 400);
  assert.equal(
    (await call("mail", "PUT", { ...config, clearPassword: "false" })).status,
    400,
  );
  assert.equal(
    (await call("mail", "PUT", { ...config, clearPassword: true })).status,
    400,
  );
  assert.equal(
    (await call("mail", "PUT", '{"password":"do-not-echo-secret"')).status,
    400,
  );
  const cookieResult = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Main", password }),
  });
  const cookie = cookieResult.headers.get("set-cookie").split(";")[0];
  for (const [endpoint, method] of [
    ["contacts/images", "POST"],
    ["contacts/test", "PUT"],
    ["contacts/test", "DELETE"],
    ["mail", "PUT"],
    ["mail/test", "POST"],
  ])
    assert.equal(
      (await call(endpoint, method, {}, null, { Cookie: cookie })).status,
      403,
      endpoint + " requires CSRF",
    );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal(
    (
      await call(
        "contacts/images",
        "POST",
        Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]),
      )
    ).status,
    413,
  );
  process.env.COCKPIT_CONTACT_IMAGE_QUOTA_MB = "0.000001";
  assert.equal((await call("contacts/images", "POST", png)).status, 413);
  delete process.env.COCKPIT_CONTACT_IMAGE_QUOTA_MB;
  process.env.COCKPIT_SCAN_URL = "http://invalid.local";
  assert.equal((await call("contacts/images", "POST", png)).status, 503);
  delete process.env.COCKPIT_SCAN_URL;
  assert.equal(
    fs
      .readdirSync(path.join(store.root, "files"))
      .filter((x) => x.includes(".upload-")).length,
    0,
    "failed uploads cleaned",
  );
  // Revoke permissions while a request body is still arriving.
  async function revokeDuringRequest(route, method, payload, change) {
    const original = store.read();
    let seen = 0,
      ready;
    const arrived = new Promise((r) => (ready = r)),
      session = store.session;
    store.session = (...args) => {
      const u = session(...args);
      if (u?.id === "smtp" && ++seen === 2) ready();
      return u;
    };
    const bytes = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(JSON.stringify(payload));
    const response = new Promise((resolve, reject) => {
      const req = http.request(
        base + "/api/" + route,
        {
          method,
          headers: {
            Authorization: "Bearer " + tokens.smtp,
            "Transfer-Encoding": "chunked",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.write(bytes.subarray(0, 1));
      arrived.then(() => {
        store.session = session;
        const next = store.read();
        change(next.data.users.find((u) => u.id === "smtp"));
        next.revision++;
        store.persist(next);
        req.end(bytes.subarray(1));
      });
    });
    try {
      assert.equal(await response, 403);
    } finally {
      store.session = session;
      store.persist(original);
    }
  }
  await revokeDuringRequest(
    "mail",
    "PUT",
    config,
    (u) => (u.systemPermissions = []),
  );
  await revokeDuringRequest(
    "contacts/images",
    "POST",
    png,
    (u) => (u.leadership = false),
  );
  const before = store.read().data,
    plant = before.plants.find((p) => p.active && !p.deleted);
  await mutate((d) =>
    d.entries.push({
      id: "assignment",
      title: "Audit",
      siteId: plant.siteId,
      plantId: plant.id,
      description: "Aufgabe",
      status: "Pendenz",
      priority: "Mittel",
      dueDate: "2030-01-01",
      assigneeIds: ["member"],
      attachments: [],
      nextSteps: "",
    }),
  );
  await mutate((d) => (d.entries[0].assigneeIds = []));
  await mutate((d) => (d.entries[0].assigneeIds = ["member"]));
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) n FROM mail_outbox WHERE status='pending' AND kind='Aufgabenzuweisung'",
      )
      .get().n,
    1,
    "removed then re-added assignment cancels old pending event",
  );
  const nodemailer = require("nodemailer"),
    real = nodemailer.createTransport;
  let deliveries = 0;
  nodemailer.createTransport = () => ({
    sendMail: async (message) => {
      assert.ok(message.signal instanceof AbortSignal);
      deliveries++;
    },
  });
  process.env.COCKPIT_MAIL_DISABLED = "1";
  assert.equal(
    (await call("mail/test", "POST", { to: "to@example.ch" })).status,
    403,
  );
  await service.worker();
  assert.equal(deliveries, 0);
  process.env.COCKPIT_MAIL_DISABLED = "0";
  await service.worker();
  assert.equal(deliveries, 1);
  await service.worker();
  assert.equal(deliveries, 1);
  // Controlled failures are persisted even when decryption fails before transport creation.
  await mutate((d) => (d.entries[0].assigneeIds = ["member", "plain"]));
  const validSettings = service.settings();
  store.db
    .prepare("UPDATE mail_settings SET json=? WHERE id=1")
    .run(JSON.stringify({ ...validSettings, password: "broken-ciphertext" }));
  await service.worker();
  assert.equal(
    store.db
      .prepare("SELECT count(*) n FROM mail_outbox WHERE status='retry'")
      .get().n,
    1,
  );
  store.db
    .prepare("UPDATE mail_settings SET json=? WHERE id=1")
    .run(JSON.stringify(validSettings));
  store.db
    .prepare("UPDATE mail_outbox SET next_attempt=0 WHERE status='retry'")
    .run();
  await mutate((d) => d.entries[0].assigneeIds.push("smtp"));
  let firstRecipient, releaseBatch, enteredBatch;
  const batchEntered = new Promise((r) => (enteredBatch = r)),
    batchGate = new Promise((r) => (releaseBatch = r)),
    beforeBatch = deliveries;
  nodemailer.createTransport = () => ({
    sendMail: async (message) => {
      deliveries++;
      firstRecipient = message.to;
      enteredBatch();
      await batchGate;
    },
  });
  const batch = service.worker();
  await batchEntered;
  const cancelled = store.db
    .prepare(
      "SELECT user_id FROM mail_outbox WHERE status IN ('pending','retry')",
    )
    .all()
    .find((r) => r.user_id + "@example.ch" !== firstRecipient).user_id;
  await mutate(
    (d) =>
      (d.entries[0].assigneeIds = d.entries[0].assigneeIds.filter(
        (id) => id !== cancelled,
      )),
  );
  releaseBatch();
  await batch;
  assert.equal(
    deliveries,
    beforeBatch + 1,
    "cancellation during an active batch is respected",
  );
  await mutate((d) => d.entries[0].assigneeIds.push(cancelled));
  const beforeConcurrent = deliveries;
  let release, entered;
  const enteredPromise = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  nodemailer.createTransport = () => ({
    sendMail: async () => {
      deliveries++;
      entered();
      await gate;
    },
  });
  const first = service.worker();
  await enteredPromise;
  const owner = store.db.prepare("SELECT owner FROM mail_worker").get().owner;
  assert.ok(owner);
  await service.worker();
  assert.equal(
    deliveries,
    beforeConcurrent + 1,
    "concurrent worker cannot send",
  );
  store.db
    .prepare("UPDATE mail_worker SET owner=?,lease=?")
    .run("replacement-worker", Date.now() + 300000);
  release();
  await first;
  assert.equal(
    store.db.prepare("SELECT owner FROM mail_worker").get().owner,
    "replacement-worker",
    "old worker does not release replacement lock",
  );
  store.db.prepare("UPDATE mail_worker SET lease=0,owner=NULL").run();
  nodemailer.createTransport = () => ({
    sendMail: async () => {
      throw Object.assign(Error("test failure"), { code: "EAUTH" });
    },
  });
  store.db
    .prepare(
      "UPDATE mail_outbox SET attempts=7,next_attempt=0 WHERE status IN ('pending','retry')",
    )
    .run();
  await service.worker();
  assert.ok(
    store.db
      .prepare(
        "SELECT event_key FROM mail_outbox WHERE status='failed' AND attempts=8",
      )
      .get(),
    "retry limit terminates after eight attempts",
  );
  nodemailer.createTransport = real;
  // Zurich midnight, using a fresh isolated state snapshot for deterministic checks.
  const saved = store.read();
  store.persist({
    ...saved,
    data: {
      ...saved.data,
      entries: [
        {
          ...saved.data.entries[0],
          id: "midnight",
          assigneeIds: ["member"],
          participants: [],
          createdById: undefined,
          updatedById: undefined,
          createdBy: undefined,
          updatedBy: undefined,
          history: [],
          dueDate: "2026-11-12",
        },
      ],
    },
  });
  service.overdue(new Date("2026-11-12T22:59:59Z"));
  assert.equal(
    store.db
      .prepare("SELECT count(*) n FROM mail_outbox WHERE entry_id='midnight'")
      .get().n,
    0,
  );
  service.overdue(new Date("2026-11-12T23:00:00Z"));
  assert.equal(
    store.db
      .prepare("SELECT count(*) n FROM mail_outbox WHERE entry_id='midnight'")
      .get().n,
    1,
  );
  store.persist(saved);
  const restarted = require("node:child_process").spawnSync(
    process.execPath,
    [
      "-e",
      "require('./server-collaboration.cjs');require('./server-collaboration.cjs').migrate()",
    ],
    { cwd: path.resolve(__dirname, ".."), env: process.env, encoding: "utf8" },
  );
  assert.equal(restarted.status, 0, restarted.stderr);
  const cliState = store.read();
  cliState.data.entries[0].dueDate = "2020-01-01";
  store.persist(cliState);
  const cli = require("node:child_process").spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../tools/mail-worker.cjs")],
    {
      env: { ...process.env, COCKPIT_MAIL_DISABLED: "1" },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(
    store.db
      .prepare(
        "SELECT event_key FROM mail_outbox WHERE kind='Überfällige Pendenz' AND entry_id='assignment'",
      )
      .get(),
    "CLI schedules overdue work without a browser",
  );
  console.log(
    "Passed: privileged reset protection, anonymous/CSRF/schema/size/quota checks, scanner policy, mid-request revocation, reassignment cancellation, mail kill switch, decryption retry, worker ownership/concurrency, Zurich midnight and restart migration.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => server?.close());
