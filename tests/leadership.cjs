const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-leadership-"));
process.env.COCKPIT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const store = require("../server-security.cjs");
const password = "TestPasswort2026!";
const salt = crypto.randomBytes(16).toString("hex");
const passwordHash =
  salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
let child, base;
async function call(route, method = "GET", payload, token) {
  const response = await fetch(base + "/api" + route, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    value:
      bytes.length &&
      response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(bytes)
        : bytes,
    headers: response.headers,
  };
}
async function ok(route, method, payload, token) {
  const result = await call(route, method, payload, token);
  assert.equal(result.status, 200, JSON.stringify(result.value));
  return result.value;
}
async function review(m, token) {
  return ok(
    "/leadership/meetings/" + m.id,
    "PUT",
    {
      ...m,
      items: m.items.map((i) => ({
        ...i,
        note: "Vertrauliche Besprechung ÄÖÜ",
        decision: "Massnahme prüfen",
        reviewed: true,
      })),
    },
    token,
  );
}
async function operational(token, change) {
  const state = await ok("/state", "GET", undefined, token);
  change(state.data);
  return ok("/state", "PUT", state, token);
}
(async () => {
  const { seed } = await import("../src/data/seed.js");
  const { canLead } = await import("../src/features/leadership.js");
  assert.equal(canLead({ role: "EPC", company: "WVM" }), false);
  assert.equal(canLead({ role: "WVM" }), true);
  const data = seed();
  data.users = [
    { id: "admin", name: "Admin", initials: "AD", role: "Admin" },
    { id: "wvm", name: "Betriebsleitung", initials: "BL", role: "WVM" },
    { id: "epc", name: "EPC", initials: "EP", role: "EPC" },
  ].map((u) => ({
    ...u,
    email: u.id + "@example.test",
    passwordHash,
    mustChangePassword: false,
    active: true,
  }));
  data.accountVersion = 2;
  data.entries = data.entries.slice(0, 3);
  data.entries[0].status = "Erledigt";
  data.entries[0].completedAt = "2020-01-01T00:00:00Z";
  data.entries[0].updatedAt = "2020-01-01T00:00:00Z";
  store.persist({ revision: 1, data });
  const net = require("node:net");
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  base = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, [path.resolve(__dirname, "../server.cjs")], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (b) => (errors += b));
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(Error("Server " + code + errors)));
  });
  const login = async (name) =>
    (await ok("/login", "POST", { name, password })).token;
  const admin = await login("Admin"),
    wvm = await login("Betriebsleitung"),
    epc = await login("EPC");
  await operational(admin, () => {}); // Persist the legacy seed's default structure before baseline capture.
  const mismatchedTab = await fetch(base + "/api/leadership", {
    headers: { Authorization: "Bearer " + wvm, "X-Cockpit-Account": "admin" },
  });
  assert.equal(mismatchedTab.status, 409);
  const cookieLogin = await call("/login", "POST", {
    name: "Betriebsleitung",
    password,
  });
  const noCsrf = await fetch(base + "/api/leadership/meetings", {
    method: "POST",
    headers: {
      Cookie: cookieLogin.headers.get("set-cookie").split(";")[0],
      Origin: base,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(noCsrf.status, 403);
  assert.equal((await call("/leadership")).status, 401);
  for (const [route, method] of [
    ["/leadership", "GET"],
    ["/leadership/meetings", "POST"],
    ["/leadership/tasks", "POST"],
    ["/leadership/meetings/missing/pdf", "HEAD"],
  ]) {
    assert.equal(
      (await call(route, method, method === "POST" ? {} : undefined, epc))
        .status,
      404,
    );
  }
  const before = await ok("/state", "GET", undefined, epc);
  let m = await ok("/leadership/meetings", "POST", {}, wvm);
  assert.equal(
    (await ok("/leadership/meetings", "POST", {}, admin)).id,
    m.id,
    "Only one shared draft",
  );
  assert.equal(m.items.length, 2);
  assert.ok(m.items.every((i) => i.status !== "Erledigt"));
  assert.equal(
    (await call(`/leadership/meetings/${m.id}`, "GET", undefined, epc)).status,
    404,
  );
  const task = await ok(
    "/leadership/tasks",
    "POST",
    {
      title: "Vertrauliche Aufgabe",
      description: "Nur WVM",
      responsibleId: "wvm",
      status: "Pendenz",
      priority: "Hoch",
      dueDate: "2026-12-01",
      meetingId: m.id,
      sourceEntryId: "seed-1",
    },
    wvm,
  );
  assert.equal(
    (
      await call(
        "/leadership/tasks/" + task.id,
        "PUT",
        { ...task, responsibleId: "epc" },
        wvm,
      )
    ).status,
    400,
  );
  m = await review(m, wvm);
  assert.equal(
    (
      await call(
        `/leadership/meetings/${m.id}/close`,
        "POST",
        { version: m.version },
        wvm,
      )
    ).status,
    409,
    "New task requires refresh before closure",
  );
  m = await ok(
    `/leadership/meetings/${m.id}/refresh`,
    "POST",
    { version: m.version },
    wvm,
  );
  assert.ok(m.items.some((i) => i.kind === "task"));
  assert.equal(
    m.items.find((i) => i.id === "seed-1").note,
    "Vertrauliche Besprechung ÄÖÜ",
  );
  m = await review(m, wvm);
  const stale = m;
  m = await review(m, wvm);
  assert.equal(
    (await call(`/leadership/meetings/${m.id}`, "PUT", stale, wvm)).status,
    409,
  );
  const stateBeforeClose = await ok("/state", "GET", undefined, epc);
  m = await ok(
    `/leadership/meetings/${m.id}/close`,
    "POST",
    { version: m.version },
    wvm,
  );
  assert.equal(m.status, "closed");
  const pdf = await call(
    `/leadership/meetings/${m.id}/pdf`,
    "GET",
    undefined,
    wvm,
  );
  assert.equal(pdf.status, 200);
  assert.equal(pdf.value.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.headers.get("content-disposition"), /^attachment/);
  assert.deepEqual(
    (await call(`/leadership/meetings/${m.id}/pdf`, "GET", undefined, wvm))
      .value,
    pdf.value,
  );
  assert.equal(
    (await call(`/leadership/meetings/${m.id}/pdf`, "GET", undefined, epc))
      .status,
    404,
  );
  assert.equal(
    (await call(`/leadership/meetings/${m.id}`, "PUT", m, wvm)).status,
    409,
  );
  const epcState = await ok("/state", "GET", undefined, epc);
  assert.equal(epcState.revision, stateBeforeClose.revision);
  assert.equal(epcState.revision, before.revision);
  assert.ok(!JSON.stringify(epcState).includes("Vertrauliche"));
  assert.ok(
    !JSON.stringify(await ok("/audit", "GET", undefined, admin)).includes(
      "meeting.closed",
    ),
  );
  // Done tasks appear once as changed, then disappear from the next draft.
  let t = await ok(
    "/leadership/tasks/" + task.id,
    "PUT",
    { ...task, status: "Erledigt" },
    wvm,
  );
  assert.equal(
    (await call("/leadership/tasks/" + task.id, "PUT", task, wvm)).status,
    409,
  );
  await operational(admin, (d) => {
    d.entries.find((e) => e.id === "seed-1").status = "Erledigt";
  });
  let next = await ok("/leadership/meetings", "POST", {}, wvm);
  assert.equal(next.previousId, m.id);
  assert.equal(next.items.find((i) => i.id === task.id).change, "Geändert");
  assert.equal(next.items.find((i) => i.id === "seed-1").status, "Erledigt");
  assert.equal(next.items.find((i) => i.id === "seed-2").change, "Offen");
  next = await review(next, wvm);
  await operational(admin, (d) => {
    d.entries.find((e) => e.id === "seed-2").description +=
      "\nNeue Feststellung";
  });
  assert.equal(
    (
      await call(
        `/leadership/meetings/${next.id}/close`,
        "POST",
        { version: next.version },
        wvm,
      )
    ).status,
    409,
  );
  next = await ok(
    `/leadership/meetings/${next.id}/refresh`,
    "POST",
    { version: next.version },
    wvm,
  );
  assert.equal(next.items.find((i) => i.id === "seed-2").reviewed, false);
  next = await review(next, wvm);
  next = await ok(
    `/leadership/meetings/${next.id}/close`,
    "POST",
    { version: next.version },
    wvm,
  );
  let third = await ok("/leadership/meetings", "POST", {}, wvm);
  assert.deepEqual(
    third.items.map((i) => i.id),
    ["seed-2"],
  );
  // A changed completed item returns; an unchanged one does not.
  t = await ok(
    "/leadership/tasks/" + task.id,
    "PUT",
    { ...t, description: "Nachtrag zum erledigten Auftrag" },
    wvm,
  );
  third = await ok(
    `/leadership/meetings/${third.id}/refresh`,
    "POST",
    { version: third.version },
    wvm,
  );
  assert.ok(third.items.some((i) => i.id === t.id));
  assert.ok(!third.items.some((i) => i.id === "seed-1"));
  const route = "/leadership/jourfix/wvm";
  assert.deepEqual(
    (await ok("/leadership/jourfix", "GET", undefined, admin)).access,
    ["epc", "wvm"],
  );
  assert.equal((await call(route, "GET", undefined, epc)).status, 404);
  assert.equal(
    (await call(route + "/settings", "PUT", { access: ["epc"] }, wvm)).status,
    404,
  );
  await ok(route + "/settings", "PUT", { access: ["epc"] }, admin);
  assert.deepEqual(
    (await ok("/state", "GET", undefined, epc)).data.jourfixAccess,
    ["wvm"],
  );
  const draft = await ok(route, "POST", undefined, epc);
  assert.equal(
    (await call("/leadership/jourfix/epc/" + draft.id, "GET", undefined, admin))
      .status,
    404,
  );
  const payload = {
    ...draft,
    time: "09:15",
    people: [{ id: "epc", status: "Anwesend", mail: true }],
    items: [
      {
        title: "Offener Eintrag",
        responsible: "Betrieb",
        status: "Terminieren",
        due: "2026-12-31",
        networks: ["marzili", "buchsee"],
      },
      {
        title: "Erledigt",
        responsible: "",
        status: "Erledigt",
        due: "",
        networks: ["*"],
      },
    ],
  };
  const save = await ok(route + "/" + draft.id, "PUT", payload, admin);
  assert.equal(
    (await call(route + "/" + draft.id, "PUT", payload, epc)).status,
    409,
  );
  const close = await ok(route + "/" + draft.id + "/close", "POST", save, epc);
  assert.equal(close.queued, 1);
  const protocol = await ok(
    route + "/" + draft.id + "/pdf",
    "GET",
    undefined,
    epc,
  );
  assert.equal(protocol.subarray(0, 5).toString(), "%PDF-");
  assert.equal(
    (await call(route + "/" + draft.id + "/close", "POST", save, epc)).status,
    409,
  );
  assert.equal(
    store.db
      .prepare("SELECT count(*) AS n FROM mail_outbox WHERE entry_id=?")
      .get(draft.id).n,
    1,
  );
  const nextDraft = await ok(route, "POST", undefined, epc);
  assert.deepEqual(
    nextDraft.items.map((p) => p.title),
    ["Offener Eintrag"],
  );
  assert.deepEqual(nextDraft.items[0].networks, ["marzili", "buchsee"]);
  await ok(route + "/settings", "PUT", { access: [] }, admin);
  assert.equal(
    (await call(route + "/" + draft.id + "/pdf", "GET", undefined, epc)).status,
    404,
  );
  const exchange = "/leadership/jourfix/epc";
  await ok(exchange + "/settings", "PUT", { access: ["wvm", "epc"] }, admin);
  await ok(exchange + "/agenda", "POST", { title: "Erstes Traktandum" }, epc);
  assert.equal((await call(exchange, "POST", undefined, epc)).status, 403);
  const prep = await ok(exchange, "POST", undefined, wvm);
  const exchangeMeeting = exchange + "/" + prep.id;
  assert.equal(prep.open, false);
  assert.equal(prep.agendaItems[0].title, "Erstes Traktandum");
  assert.equal(
    (await call(exchangeMeeting, "GET", undefined, epc)).status,
    403,
  );
  await ok(exchange + "/agenda", "POST", { title: "Zweites Traktandum" }, epc);
  const shared = await ok(
    exchangeMeeting,
    "PATCH",
    {
      publish: true,
      changes: {
        time: { base: "", value: "14:00" },
        people: {
          base: [],
          value: [
            { id: "epc", status: "Offen" },
            { id: "wvm", status: "Anwesend" },
          ],
        },
      },
    },
    wvm,
  );
  assert.equal(shared.open, true);
  assert.equal(shared.agendaItems.length, 2);
  const key = "note:" + shared.agendaItems[0].id;
  await ok(
    exchangeMeeting,
    "PATCH",
    { changes: { [key]: { base: "", value: "Notiz aus EPC" } } },
    epc,
  );
  const merged = await ok(
    exchangeMeeting,
    "PATCH",
    { changes: { summary: { base: "", value: "Gemeinsam ergänzt" } } },
    wvm,
  );
  assert.equal(merged.agendaItems[0].notes, "Notiz aus EPC");
  assert.equal(merged.summary, "Gemeinsam ergänzt");
  assert.equal(
    (
      await call(
        exchangeMeeting,
        "PATCH",
        { changes: { [key]: { base: "", value: "Veraltete Eingabe" } } },
        wvm,
      )
    ).status,
    409,
  );
  const order = merged.agendaItems.map((item) => item.id);
  const reordered = await ok(
    exchangeMeeting,
    "PATCH",
    {
      changes: { agendaOrder: { base: order, value: [...order].reverse() } },
    },
    wvm,
  );
  assert.equal(reordered.agendaItems[0].title, "Zweites Traktandum");
  assert.equal(reordered.agendaItems[1].notes, "Notiz aus EPC");
  const archived = await ok(exchangeMeeting + "/close", "POST", reordered, wvm);
  assert.equal(archived.queued, 2);
  assert.equal(archived.chair, "");
  assert.equal((await ok(exchange, "GET", undefined, epc)).upcoming.length, 0);
  assert.equal(
    (await call(exchangeMeeting, "DELETE", undefined, wvm)).status,
    404,
  );
  await ok(exchangeMeeting, "DELETE", undefined, admin);
  assert.equal(
    (await call(exchangeMeeting + "/pdf", "GET", undefined, admin)).status,
    404,
  );
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) AS n FROM mail_outbox WHERE entry_id=? AND status='skipped'",
      )
      .get(prep.id).n,
    2,
  );
  // Private archive and exact PDF bytes survive backup/restore.
  const backup = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../tools/backup.cjs")],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(backup.status, 0, backup.stderr);
  const restored = path.join(root, "restored");
  const restore = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../tools/restore.cjs"), backup.stdout.trim()],
    { env: { ...process.env, COCKPIT_DATA_DIR: restored }, encoding: "utf8" },
  );
  assert.equal(restore.status, 0, restore.stderr);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(restored, "cockpit.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    store.db.prepare("SELECT pdf FROM leadership_meetings WHERE id=?").get(m.id)
      .pdf,
    null,
    "PDF is not stored on the website",
  );
  assert.deepEqual(
    Buffer.from(
      db.prepare("SELECT pdf FROM leadership_meetings WHERE id=?").get(draft.id)
        .pdf,
    ),
    protocol,
  );
  const restoredMeeting = db
    .prepare("SELECT json,pdf FROM leadership_meetings WHERE id=?")
    .get(m.id);
  assert.equal(
    restoredMeeting.pdf,
    null,
    "Backups contain meeting data, not PDF files",
  );
  assert.deepEqual(
    await require("../server-leadership-pdf.cjs").generate(
      JSON.parse(restoredMeeting.json),
    ),
    pdf.value,
    "PDF can be generated again from the closed meeting",
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM leadership_tasks").get().n,
    1,
  );
  assert.ok(
    db.prepare("SELECT count(*) AS n FROM leadership_audit").get().n > 0,
  );
  db.close();
  if (process.env.COCKPIT_PDF_PREVIEW)
    fs.writeFileSync(process.env.COCKPIT_PDF_PREVIEW, pdf.value);
  third = await review(third, wvm);
  await operational(admin, (d) => {
    d.entries = d.entries.filter((e) => e.id !== "seed-2");
  });
  third = await ok(
    `/leadership/meetings/${third.id}/refresh`,
    "POST",
    { version: third.version },
    wvm,
  );
  const removed = third.items.find((i) => i.id === "seed-2");
  assert.equal(removed.removed, true);
  assert.equal(removed.reviewed, false);
  assert.equal(removed.note, "Vertrauliche Besprechung ÄÖÜ");
  await require("./leadership-ui.cjs")({
    base,
    token: wvm,
    meetingId: third.id,
  });
  await operational(admin, (d) => {
    d.users.find((u) => u.id === "wvm").role = "EPC";
  });
  assert.equal(
    (await call("/leadership", "GET", undefined, wvm)).status,
    401,
    "Role changes revoke the old leadership session",
  );
  console.log(
    "Passed: WVM/EPC isolation, private state/revisions/audit, agenda baselines, changes and completions, concurrency, immutable PDF, backup/restore.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    child?.kill();
    store.db.close();
  });
