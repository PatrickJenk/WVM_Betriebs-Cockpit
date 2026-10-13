const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-shared-")),
  servers = [];
async function start(port) {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "../server.cjs")],
    {
      env: { ...process.env, PORT: String(port), COCKPIT_DATA_DIR: storage },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servers.push(child);
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(Error("server exit " + code)));
  });
}
async function call(port, url, method = "GET", payload, token) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: response.status, value: await response.json() };
}
(async () => {
  await start(4176);
  await start(4177);
  const { seed } = await import("../src/data/seed.js");
  const local = seed();
  const boot = await call(4176, "/api/bootstrap", "POST", { local });
  assert.equal(boot.status, 200);
  assert.deepEqual(boot.value.data.users, []);
  assert.deepEqual(boot.value.data.entries, []);
  const login = await call(4176, "/api/login", "POST", {
    name: "WVM-admin",
    password: "9876",
  });
  assert.equal(login.status, 200);
  const admin = login.value.token;
  assert.equal((await fetch("http://127.0.0.1:4176/api/handbook")).status, 401);
  const handbook = await fetch("http://127.0.0.1:4176/api/handbook", {
    headers: { Authorization: "Bearer " + admin },
  });
  assert.equal(handbook.status, 200);
  assert.equal(handbook.headers.get("content-type"), "application/pdf");
  assert.match(handbook.headers.get("content-disposition"), /^inline/);
  assert.equal(
    Buffer.from(await handbook.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  const handbookDownload = await fetch(
    "http://127.0.0.1:4177/api/handbook?download=1",
    { headers: { Authorization: "Bearer " + admin } },
  );
  assert.match(
    handbookDownload.headers.get("content-disposition"),
    /^attachment/,
  );

  let snapshot = (await call(4177, "/api/state", "GET", undefined, admin))
    .value; // Token und Daten zwischen Serverprozessen nutzbar.
  snapshot.data.structure.networks.push({
    id: "demo-network",
    name: "Demo Verbund",
  });
  snapshot.data.structure.groups.push({
    id: "demo-group",
    name: "Nord",
    networkId: "demo-network",
    parentId: null,
  });
  snapshot.data.structure.sites.push({
    id: "demo-site",
    name: "Demo Zentrale",
    heatNetworkId: "demo-network",
    groupId: "demo-group",
    address: "Bern",
  });
  snapshot.data.structure.sections.push({
    id: "demo-reports",
    name: "Arbeitsrapporte",
    siteId: "demo-site",
  });
  snapshot.data.folders.push({
    id: "test-folder",
    siteId: "eiger",
    parentId: null,
    name: "Gemeinsam",
  });
  let saved = await call(4176, "/api/state", "PUT", snapshot, admin);
  assert.equal(saved.status, 200);
  const sharedStructure = (
    await call(4177, "/api/state", "GET", undefined, admin)
  ).value;
  assert.equal(
    sharedStructure.data.structure.sites.find((s) => s.id === "demo-site")
      .groupId,
    "demo-group",
  );
  const cyclic = structuredClone(sharedStructure);
  cyclic.data.structure.groups[0].parentId = "demo-group";
  assert.equal(
    (await call(4176, "/api/state", "PUT", cyclic, admin)).status,
    400,
  );
  const add = async (token, id) => {
    const response = await fetch(`http://127.0.0.1:4176/api/files/${id}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
      body: "PDF-Test",
    });
    assert.equal(response.status, 200);
    const state = (await call(4176, "/api/state", "GET", undefined, token))
      .value;
    state.data.documents.push({
      id,
      siteId: "eiger",
      folderId: "test-folder",
      name: id + ".pdf",
      uploadedAt: new Date().toISOString(),
      fileSize: 8,
      mimeType: "application/pdf",
    });
    const result = await call(4176, "/api/state", "PUT", state, token);
    assert.equal(result.status, 200);
  };
  await add(admin, "admin-file");
  const other = (await call(4177, "/api/state", "GET", undefined, admin)).value;
  assert.equal(other.data.documents[0].uploadedById, "admin");
  const binary = await fetch("http://127.0.0.1:4177/api/files/admin-file", {
    headers: { Authorization: "Bearer " + admin },
  });
  assert.equal(await binary.text(), "PDF-Test");
  let member = (
    await call(4177, "/api/login", "POST", {
      name: "Patrick Jenk",
      password: "ChangeMe123",
    })
  ).value;
  const password = await call(
    4177,
    "/api/password",
    "POST",
    { password: "PatrickNew123" },
    member.token,
  );
  assert.equal(password.status, 200);
  member.token = password.value.token;
  assert.equal(
    password.value.data.users.find((u) => u.id === "pj").mustChangePassword,
    false,
  );
  assert.equal(
    (
      await call(4176, "/api/login", "POST", {
        name: "Patrick Jenk",
        password: "ChangeMe123",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(4176, "/api/login", "POST", {
        name: "Patrick Jenk",
        password: "PatrickNew123",
      })
    ).status,
    200,
  );
  const memberStructure = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  assert.ok(
    memberStructure.data.structure.sections.some(
      (s) => s.id === "demo-reports",
    ),
  );
  memberStructure.data.structure.networks.push({
    id: "forbidden",
    name: "Verboten",
  });
  assert.equal(
    (await call(4177, "/api/state", "PUT", memberStructure, member.token))
      .status,
    403,
  );
  const remove = async (token, id) => {
    const state = (await call(4177, "/api/state", "GET", undefined, token))
      .value;
    state.data.documents = state.data.documents.filter((d) => d.id !== id);
    return call(4177, "/api/state", "PUT", state, token);
  };
  assert.equal((await remove(member.token, "admin-file")).status, 403);
  for (const field of ["name", "folderId"]) {
    const denied = (
      await call(4176, "/api/state", "GET", undefined, member.token)
    ).value;
    denied.data.documents.find((d) => d.id === "admin-file")[field] =
      field === "name" ? "Umbenannt.pdf" : "anderer-ordner";
    assert.equal(
      (await call(4176, "/api/state", "PUT", denied, member.token)).status,
      403,
    );
  }
  await add(member.token, "member-file");
  const own = (await call(4176, "/api/state", "GET", undefined, member.token))
    .value;
  own.data.documents.find((d) => d.id === "member-file").name =
    "Eigene Datei.pdf";
  assert.equal(
    (await call(4176, "/api/state", "PUT", own, member.token)).status,
    200,
  );
  let epc = (
    await call(4176, "/api/login", "POST", {
      name: "Marcel Maibach",
      password: "ChangeMe123",
    })
  ).value;
  assert.equal(
    (await call(4176, "/api/state", "GET", undefined, epc.token)).status,
    403,
  );
  epc = (
    await call(
      4176,
      "/api/password",
      "POST",
      { password: "MarcelNew123" },
      epc.token,
    )
  ).value;
  assert.equal((await remove(epc.token, "member-file")).status, 403);
  assert.equal((await remove(member.token, "member-file")).status, 200);
  assert.equal(
    (
      await fetch("http://127.0.0.1:4176/api/files/member-file", {
        headers: { Authorization: "Bearer " + admin },
      })
    ).status,
    404,
  );
  const stale = (await call(4176, "/api/state", "GET", undefined, admin)).value;
  assert.equal((await remove(admin, "admin-file")).status, 200);
  assert.equal(
    (await call(4177, "/api/state", "PUT", stale, admin)).status,
    409,
  );
  const hacked = (
    await call(4176, "/api/state", "GET", undefined, member.token)
  ).value;
  hacked.data.users.find((u) => u.id === "admin").password = "hacked-password";
  assert.equal(
    (await call(4176, "/api/state", "PUT", hacked, member.token)).status,
    403,
  );
  const attachmentUpload = await fetch(
    "http://127.0.0.1:4176/api/files/log-attachment",
    {
      method: "PUT",
      headers: { Authorization: "Bearer " + admin },
      body: "Log photo",
    },
  );
  assert.equal(attachmentUpload.status, 200);
  const entryState = (await call(4176, "/api/state", "GET", undefined, admin))
    .value;
  entryState.data.entries.push({
    id: "delete-test",
    title: "Original",
    description: "Ursprünglicher Text mit @Patrick Jenk",
    siteId: "eiger",
    plantId: "eiger-0",
    priority: "Mittel",
    status: "Erledigt",
    createdAt: "2026-01-01T12:00:00Z",
    occurredAt: "2026-01-01T12:00:00Z",
    attachments: [{ id: "log-attachment" }],
    history: [],
  });
  assert.equal(
    (await call(4176, "/api/state", "PUT", entryState, admin)).status,
    200,
  );
  const mentioned = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value.data.entries.find((e) => e.id === "delete-test");
  assert.deepEqual(
    mentioned.mentions.map((p) => p.id),
    ["pj"],
  );
  const seen = await call(
    4176,
    "/api/mentions/seen",
    "POST",
    { ids: ["delete-test", "seed-0"] },
    member.token,
  );
  assert.equal(seen.status, 200);
  assert.ok(seen.value.mentionSeen.includes("delete-test"));
  assert.equal(
    (
      await call(4177, "/api/state", "GET", undefined, member.token)
    ).value.mentionSeen.includes("delete-test"),
    true,
  );
  assert.equal(
    (
      await call(4177, "/api/state", "GET", undefined, admin)
    ).value.mentionSeen.includes("delete-test"),
    false,
  );
  assert.equal(
    (await call(4176, "/api/mentions/seen", "POST", { ids: [] })).status,
    401,
  );
  const forged = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  forged.data.entries.find((e) => e.id === "delete-test").mentions = [
    { id: "mm", name: "Marcel Maibach" },
  ];
  assert.equal(
    (await call(4177, "/api/state", "PUT", forged, member.token)).status,
    200,
  );
  assert.deepEqual(
    (
      await call(4177, "/api/state", "GET", undefined, member.token)
    ).value.data.entries
      .find((e) => e.id === "delete-test")
      .mentions.map((p) => p.id),
    ["pj"],
  );
  const supplement = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  supplement.data.entries.find((e) => e.id === "delete-test").description +=
    "\nNeue Feststellung von Patrick";
  assert.equal(
    (await call(4177, "/api/state", "PUT", supplement, member.token)).status,
    200,
  );
  const second = (await call(4177, "/api/state", "GET", undefined, epc.token))
    .value;
  second.data.entries.find((e) => e.id === "delete-test").description +=
    "\nNeue Feststellung von Marcel";
  assert.equal(
    (await call(4177, "/api/state", "PUT", second, epc.token)).status,
    200,
  );
  const everyone = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  const transparent = everyone.data.entries.find((e) => e.id === "delete-test");
  assert.deepEqual(
    transparent.participants.map((p) => p.name).sort(),
    ["WVM-admin", "Patrick Jenk", "Marcel Maibach"].sort(),
  );
  assert.ok(!transparent.history);
  transparent.title = "Umbenannt";
  assert.equal(
    (await call(4177, "/api/state", "PUT", everyone, member.token)).status,
    403,
  );
  const replaced = (await call(4177, "/api/state", "GET", undefined, admin))
    .value;
  replaced.data.entries.find((e) => e.id === "delete-test").description =
    "Alter Text entfernt";
  assert.equal(
    (await call(4177, "/api/state", "PUT", replaced, admin)).status,
    403,
  );
  const statusUpdate = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  const statusEntry = statusUpdate.data.entries.find(
    (e) => e.id === "delete-test",
  );
  statusEntry.status = "Pendenz";
  statusEntry.priority = "Hoch";
  assert.equal(
    (await call(4177, "/api/state", "PUT", statusUpdate, member.token)).status,
    200,
  );
  const statusResult = (
    await call(4176, "/api/state", "GET", undefined, member.token)
  ).value.data.entries.find((e) => e.id === "delete-test");
  assert.equal(statusResult.priority, "Hoch");
  assert.equal(statusResult.status, "Pendenz");
  assert.equal(statusResult.completedAt, null);
  const nonAdminDelete = (
    await call(4177, "/api/state", "GET", undefined, member.token)
  ).value;
  nonAdminDelete.data.entries = nonAdminDelete.data.entries.filter(
    (e) => e.id !== "delete-test",
  );
  assert.equal(
    (await call(4177, "/api/state", "PUT", nonAdminDelete, member.token))
      .status,
    403,
  );
  const adminDelete = (await call(4177, "/api/state", "GET", undefined, admin))
    .value;
  adminDelete.data.entries = adminDelete.data.entries.filter(
    (e) => e.id !== "delete-test",
  );
  assert.equal(
    (await call(4177, "/api/state", "PUT", adminDelete, admin)).status,
    200,
  );
  assert.ok(
    !(
      await call(4176, "/api/state", "GET", undefined, admin)
    ).value.data.entries.some((e) => e.id === "delete-test"),
  );
  assert.ok(!fs.existsSync(path.join(storage, "files", "log-attachment")));
  const restarted = servers[1];
  const stopped = new Promise((resolve) => restarted.once("exit", resolve));
  restarted.kill();
  await stopped;
  await start(4177);
  assert.equal(
    (
      await call(4177, "/api/login", "POST", {
        name: "Patrick Jenk",
        password: "PatrickNew123",
      })
    ).status,
    200,
  );
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(storage, "cockpit.sqlite"));
  const disk = db.prepare("SELECT json FROM state WHERE id=1").get().json;
  db.close();
  assert.ok(!disk.includes('"password":'));
  assert.ok(!disk.includes("PatrickNew123"));
  assert.equal((await call(4177, "/api/state")).status, 401);
  console.log(
    "Passed: shared metadata and binaries across servers, authenticated sessions, hashed passwords, owner/admin deletion and concurrent-write protection.",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => servers.forEach((s) => s.kill()));
setTimeout(() => {
  servers.forEach((s) => s.kill());
  process.exitCode = 1;
  console.error("Shared test timeout");
}, 20000).unref();
