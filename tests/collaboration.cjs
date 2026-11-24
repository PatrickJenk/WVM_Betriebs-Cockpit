const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-collaboration-"));
process.env.COCKPIT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const store = require("../server-security.cjs"),
  service = require("../server-collaboration.cjs");
let server;
(async () => {
  const { seed } = await import("../src/data/seed.js");
  const data = seed();
  const salt = crypto.randomBytes(16).toString("hex"),
    password = "TestPasswort2026!",
    passwordHash =
      salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
  data.users = [
    { id: "main", name: "Hauptadmin", initials: "HA", role: "Admin" },
    { id: "admin2", name: "Admin Zwei", initials: "AZ", role: "Administrator" },
    { id: "member", name: "Mitglied", initials: "MI", role: "WVM" },
    {
      id: "optout",
      name: "Ohne Mail",
      initials: "OM",
      role: "EPC",
      notificationsEnabled: false,
    },
  ].map((u) => ({
    ...u,
    passwordHash,
    mustChangePassword: false,
    email: u.id + "@example.ch",
    active: true,
  }));
  data.entries = [];
  data.accountVersion = 2;
  store.persist({ revision: 1, data });
  const api = require("../server-api.cjs");
  server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const tokens = Object.fromEntries(
    data.users.map((u) => [u.id, store.tokenFor(u, { setHeader() {} })]),
  );
  async function call(route, method = "GET", value, who = "main", extra = {}) {
    const response = await fetch(base + "/api/" + route, {
      method,
      headers: {
        Authorization: "Bearer " + tokens[who],
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
        ...extra,
      },
      body:
        value === undefined
          ? undefined
          : Buffer.isBuffer(value)
            ? value
            : JSON.stringify(value),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: response.headers,
      value: response.headers.get("content-type")?.includes("json")
        ? JSON.parse(bytes)
        : bytes,
    };
  }
  const ok = async (...args) => {
    const r = await call(...args);
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value;
  };
  const snapshot = await ok("state");
  assert.equal(snapshot.data.users[0].systemRole, "main");
  const generalPdf = Buffer.from("%PDF-1.4\n");
  const generalId = "general-documentation-test";
  const generalDocument = {
    id: generalId,
    siteId: "general-documentation",
    name: "Anleitung.pdf",
    folderId: null,
  };
  await ok("files/" + generalId, "PUT", generalPdf, "member");
  const memberState = await ok("state", "GET", undefined, "member");
  memberState.data.documents.push(generalDocument);
  assert.equal((await call("state", "PUT", memberState, "member")).status, 403);
  const adminState = await ok("state");
  adminState.data.documents.push(generalDocument);
  await ok("state", "PUT", adminState);
  const reader = await call(
    "files/" + generalId + "?inline=1",
    "GET",
    undefined,
    "optout",
  );
  assert.equal(reader.status, 200);
  assert.equal(reader.headers.get("content-disposition"), "inline");
  assert.deepEqual(reader.value, generalPdf);
  const download = await call("files/" + generalId, "GET", undefined, "optout");
  assert.match(download.headers.get("content-disposition"), /^attachment/);
  const attemptDelete = await ok("state", "GET", undefined, "member");
  attemptDelete.data.documents = attemptDelete.data.documents.filter(
    (d) => d.id !== generalId,
  );
  assert.equal(
    (await call("state", "PUT", attemptDelete, "member")).status,
    403,
  );
  const deleteState = await ok("state");
  deleteState.data.documents = deleteState.data.documents.filter(
    (d) => d.id !== generalId,
  );
  await ok("state", "PUT", deleteState);
  const revision = store.read().revision;
  await ok("state");
  assert.equal(store.read().revision, revision, "migration idempotent");
  assert.equal((await call("mail", "GET", undefined, "member")).status, 403);
  assert.equal((await call("mail", "GET", undefined, "admin2")).status, 403);
  assert.equal(
    (
      await call("contacts", "GET", undefined, "member", {
        "X-Cockpit-Account": "main",
      })
    ).status,
    409,
  );
  const c = {
    version: 0,
    organization: "WVM",
    name: "Test Kontakt",
    function: "Betrieb",
    email: "kontakt@example.ch",
    phone: "+41 31 123 45 67",
    availability: "Mo–Fr 08–17 Uhr",
  };
  assert.equal((await call("contacts/test", "PUT", c, "optout")).status, 403);
  assert.equal(
    (
      await call(
        "contacts/incomplete",
        "PUT",
        { ...c, availability: " " },
        "member",
      )
    ).status,
    400,
  );
  await ok("contacts/test", "PUT", c, "member");
  assert.equal(
    (await ok("contacts", "GET", undefined, "member")).contacts[0].name,
    c.name,
  );
  assert.equal((await call("contacts/test", "PUT", c)).status, 409);
  assert.equal(
    (await call("contacts/invalid", "PUT", { ...c, email: "invalid" })).status,
    400,
  );
  assert.equal(
    (await call("contacts/images", "POST", Buffer.from("<svg/>"))).status,
    415,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII=",
    "base64",
  );
  const image = await ok("contacts/images", "POST", png);
  await ok("contacts/test", "PUT", {
    ...c,
    version: 1,
    imageId: image.id,
    organization: "EWB",
  });
  const photo = await call(
    "contacts/images/" + image.id,
    "GET",
    undefined,
    "member",
  );
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.deepEqual(photo.value, png);
  await ok(
    "contacts/reorder-test",
    "PUT",
    { ...c, organization: "EWB" },
    "member",
  );
  const order = { organization: "EWB", ids: ["reorder-test", "test"] };
  assert.equal(
    (await call("contacts/order", "PUT", order, "member")).status,
    403,
  );
  await ok("contacts/order", "PUT", order, "admin2");
  const orderedContacts = (await ok("contacts", "GET", undefined, "member"))
    .contacts;
  assert.equal(orderedContacts.find((c) => c.id === "reorder-test").order, 0);
  assert.equal(orderedContacts.find((c) => c.id === "test").order, 1);
  await ok("contacts/reorder-test", "DELETE", { version: 2 }, "member");
  async function mutate(fn, who = "main", expected = 200) {
    const s = await ok("state", "GET", undefined, who);
    fn(s.data);
    const r = await call(
      "state",
      "PUT",
      { revision: s.revision, data: s.data },
      who,
    );
    assert.equal(r.status, expected, JSON.stringify(r.value));
    return r.value;
  }
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "admin2").systemPermissions = ["smtp"];
    },
    "admin2",
    403,
  );
  await mutate(
    (d) => {
      d.users[0].systemRole = "admin";
    },
    "main",
    400,
  );
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "main").password = "AnderePasswort123!";
    },
    "admin2",
    403,
  );
  await mutate(
    (d) => {
      d.users.find((u) => u.id === "member").email = "invalid";
    },
    "main",
    400,
  );
  await mutate((d) => {
    d.users.find((u) => u.id === "admin2").systemPermissions = ["smtp"];
  });
  await ok("mail", "GET", undefined, "admin2");
  const config = {
    host: "smtp.example.ch",
    port: 587,
    username: "mail@example.ch",
    password: "secret-for-test",
    encryption: "starttls",
    senderName: "Cockpit",
    senderEmail: "mail@example.ch",
    replyTo: "reply@example.ch",
    enabled: false,
    baseUrl: "https://cockpit.example.ch",
    template: {
      subject: "{{art}} | {{titel}}",
      body: "{{titel}}\n{{beschreibung}}\n{{link}}",
      signature: "Betriebsteam Wärmeverbund",
    },
  };
  await ok("mail", "PUT", config);
  const safe = (await ok("mail")).settings;
  assert.equal(safe.password, undefined);
  assert.equal(safe.passwordSet, true);
  assert.ok(!JSON.stringify(service.exportData()).includes("secret-for-test"));
  assert.equal(store.decrypt(service.settings().password), config.password);
  await ok("mail", "PUT", { ...config, password: "" });
  assert.equal(store.decrypt(service.settings().password), config.password);
  assert.equal(
    (await call("mail", "PUT", { ...config, baseUrl: "javascript:alert(1)" }))
      .status,
    400,
  );
  const preview = await ok("mail/preview", "POST", {
    template: config.template,
  });
  assert.match(preview.subject, /Aufgabenzuweisung \| Aschebehälter/);
  assert.match(preview.text, /Betriebsteam Wärmeverbund$/);
  assert.equal((await call("mail/preview", "POST", {}, "member")).status, 403);
  const plant = store.read().data.plants.find((p) => p.active && !p.deleted);
  const entry = {
    id: "entry-mail",
    siteId: plant.siteId,
    plantId: plant.id,
    title: "SMTP-Testpendenz",
    description: "Bitte @Mitglied prüfen",
    status: "Pendenz",
    dueDate: "2020-01-01",
    nextSteps: "",
    attachments: [],
    assigneeIds: ["member"],
    ccIds: ["optout"],
  };
  await mutate((d) => d.entries.push(entry));
  const count = () =>
    store.db.prepare("SELECT count(*) AS n FROM mail_outbox").get().n;
  assert.equal(count(), 1);
  assert.deepEqual(
    store.db
      .prepare("SELECT user_id,kind FROM mail_outbox ORDER BY user_id")
      .all()
      .map(({ user_id, kind }) => [user_id, kind]),
    [["member", "Aufgabenzuweisung"]],
  );
  await mutate(() => {});
  assert.equal(count(), 1, "same save does not duplicate");
  service.overdue(new Date("2026-11-13T12:00:00Z"));
  const total = count();
  service.overdue();
  assert.equal(count(), total, "overdue deduplicated");
  await mutate((d) => {
    d.entries[0].dueDate = "2030-01-01";
  });
  service.overdue();
  assert.equal(count(), total);
  await mutate((d) => {
    d.entries[0].dueDate = "2020-01-01";
  });
  service.overdue();
  assert.ok(count() > total, "new due date cycle");
  const nodemailer = require("nodemailer"),
    real = nodemailer.createTransport,
    sent = [];
  let fail = true;
  nodemailer.createTransport = (options) => {
    assert.equal(options.requireTLS, true);
    assert.equal(options.auth.pass, config.password);
    const stream = real({ streamTransport: true, buffer: true });
    return {
      sendMail: async (message) => {
        if (fail) {
          fail = false;
          throw Object.assign(Error("must not leak credentials"), {
            code: "EAUTH",
          });
        }
        const result = await stream.sendMail(message);
        sent.push(result.message.toString());
        return result;
      },
    };
  };
  const testFailure = await call("mail/test", "POST", {
    to: "test@example.ch",
  });
  assert.equal(testFailure.status, 502);
  assert.match(testFailure.value.error, /Anmeldung/);
  assert.ok(!testFailure.value.error.includes("credentials"));
  await ok("mail/test", "POST", { to: "test@example.ch" });
  assert.match(sent[0], /Der SMTP-Mailversand funktioniert/);
  await service.worker();
  assert.equal(sent.length, 1, "disabled delivery does not process queue");
  await ok("mail", "PUT", { ...config, password: "", enabled: true });
  fail = true;
  await service.worker();
  assert.ok(
    store.db.prepare("SELECT * FROM mail_outbox WHERE status='retry'").get(),
    "failed mail scheduled for retry",
  );
  assert.ok(!JSON.stringify(service.exportData()).includes("credentials"));
  store.db
    .prepare("UPDATE mail_outbox SET next_attempt=0 WHERE status='retry'")
    .run();
  await service.worker();
  await service.worker();
  assert.ok(
    sent.some((s) => s.includes("/#entry/entry-mail")),
    "direct entry link",
  );
  assert.ok(
    sent.some((s) => s.includes("Betriebsteam")),
    "configured signature in body",
  );
  assert.ok(
    !sent.some((s) => s.includes("optout@example.ch")),
    "opt-out respected",
  );
  const sentCount = sent.length;
  await service.worker();
  assert.equal(sent.length, sentCount, "no duplicate delivery");
  await mutate((d) => {
    d.entries[0].ccIds = [];
  });
  const n = count();
  await mutate((d) => {
    d.entries[0].ccIds = ["admin2", "main"];
  });
  assert.equal(count(), n + 1, "one message queued with all recipients");
  const beforeGroup = sent.length;
  await service.worker();
  const groupMessages = sent.slice(beforeGroup);
  assert.equal(groupMessages.length, 1);
  assert.match(groupMessages[0], /^To: .*member@example\.ch/m);
  assert.match(groupMessages[0], /^Cc: .*admin2@example\.ch/m);
  assert.match(groupMessages[0].split(/\r?\n\r?\n/)[0], /main@example\.ch/);
  await mutate((d) => {
    d.entries[0].status = "Erledigt";
  });
  service.overdue();
  const completedCount = count();
  service.overdue();
  assert.equal(count(), completedCount, "completed ignored");
  const cookie = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hauptadmin", password }),
  });
  const cookieHeader = cookie.headers.get("set-cookie").split(";")[0];
  const noCsrf = await fetch(base + "/api/contacts/test", {
    method: "DELETE",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 2 }),
  });
  assert.equal(noCsrf.status, 403);
  await ok("contacts/test", "DELETE", { version: 3 });
  assert.equal((await ok("contacts")).contacts.length, 0);
  await ok("contacts/test", "PUT", { ...c, imageId: image.id });
  const backup = require("../server-backup.cjs").backup();
  const restored = path.join(root, "restored");
  const result = require("node:child_process").spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../tools/restore.cjs"), backup],
    { env: { ...process.env, COCKPIT_DATA_DIR: restored }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const { DatabaseSync } = require("node:sqlite"),
    restoredDb = new DatabaseSync(path.join(restored, "cockpit.sqlite"));
  assert.equal(
    restoredDb.prepare("SELECT count(*) AS n FROM contacts").get().n,
    1,
  );
  assert.deepEqual(
    Buffer.from(
      restoredDb
        .prepare("SELECT bytes FROM contact_images WHERE id=?")
        .get(image.id).bytes,
    ),
    png,
  );
  assert.equal(
    restoredDb.prepare("SELECT count(*) AS n FROM mail_outbox").get().n,
    count(),
  );
  restoredDb.close();
  nodemailer.createTransport = real;
  console.log(
    "Passed: contact CRUD/images/conflicts, SMTP encryption/test/errors, permissions/CSRF/main-admin protection, assignment/mention deduplication, overdue cycles, opt-out, retries, MIME messages and backup/restore.",
  );
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.close();
  });
