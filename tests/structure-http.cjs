const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-structure-")),
  port = 4184,
  base = `http://127.0.0.1:${port}`;
let child;
async function start() {
  child = spawn(process.execPath, [path.join(__dirname, "../server.cjs")], {
    env: { ...process.env, PORT: String(port), COCKPIT_DATA_DIR: storage },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(Error("Server exit " + code)));
  });
}
async function stop() {
  if (!child) return;
  const ended = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await ended;
  child = null;
}
async function call(url, method = "GET", payload, token) {
  const response = await fetch(base + url, {
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
  const { removeStructureItem, siteTabs } =
    await import("../src/services/structure.js");
  await start();
  await call("/api/session");
  const login = await call("/api/login", "POST", {
    name: "WVM-admin",
    password: "9876",
  });
  assert.equal(login.status, 200);
  const admin = login.value.token;
  const read = async (token) =>
    (await call("/api/state", "GET", undefined, token || admin)).value;
  const save = async (state) => {
    const saved = await call("/api/state", "PUT", state, admin);
    assert.equal(saved.status, 200, JSON.stringify(saved.value));
    return saved.value;
  };
  let state = await read();
  const st = state.data.structure;
  st.networks.push(
    { id: "demo-net", name: "Demoverbund" },
    { id: "demo-other", name: "Zweiter Verbund" },
  );
  st.groups.push(
    { id: "demo-group", name: "Nord", networkId: "demo-net", parentId: null },
    {
      id: "demo-child",
      name: "Technik",
      networkId: "demo-net",
      parentId: "demo-group",
    },
  );
  st.sites.push(
    {
      id: "demo-site",
      name: "Demozentrale",
      heatNetworkId: "demo-net",
      groupId: "demo-child",
      address: "Bern",
    },
    {
      id: "demo-sub",
      name: "Unterstation",
      heatNetworkId: "demo-net",
      type: "mbus",
      address: "Bern",
    },
  );
  state.data.plants.push({
    id: "demo-plant",
    siteId: "demo-site",
    name: "Allgemein",
    active: true,
  });
  st.sections.push(
    { id: "demo-tab", siteId: "demo-site", name: "Arbeitsrapporte", order: 2 },
    {
      id: "demo-log-tab",
      siteId: "demo-site",
      name: "Betriebslogbuch",
      builtin: "log",
      order: 0,
    },
    {
      id: "demo-docs-tab",
      siteId: "demo-site",
      name: "Unterlagen",
      builtin: "docs",
      order: 1,
    },
  );
  state.data.folders.push(
    {
      id: "demo-folder",
      siteId: "demo-site",
      sectionId: "demo-tab",
      parentId: null,
      name: "Rapporte",
    },
    {
      id: "demo-nested",
      siteId: "demo-site",
      sectionId: "demo-tab",
      parentId: "demo-folder",
      name: "Oktober",
    },
    { id: "demo-docs", siteId: "demo-site", parentId: null, name: "Schemas" },
  );
  state = await save(state);
  async function upload(id) {
    const response = await fetch(base + "/api/files/" + id, {
      method: "PUT",
      headers: { Authorization: "Bearer " + admin },
      body: "Demo document",
    });
    assert.equal(response.status, 200);
  }
  for (const id of ["demo-report-file", "demo-doc-file", "demo-attachment"])
    await upload(id);
  state = await read();
  state.data.documents.push(
    {
      id: "demo-report-file",
      siteId: "demo-site",
      folderId: "demo-nested",
      name: "Rapport.pdf",
    },
    {
      id: "demo-doc-file",
      siteId: "demo-site",
      folderId: "demo-docs",
      name: "Schema.pdf",
    },
  );
  state.data.entries.push({
    id: "demo-entry",
    siteId: "demo-site",
    plantId: "demo-plant",
    title: "Demo Log",
    description: "Demo",
    nextSteps: "",
    status: "Pendenz",
    priority: "Mittel",
    occurredAt: new Date().toISOString(),
    attachments: [{ id: "demo-attachment", name: "Foto.txt" }],
  });
  state = await save(state);
  const memberLogin = await call("/api/login", "POST", {
    name: "Patrick Jenk",
    password: "ChangeMe123",
  });
  const changed = await call(
    "/api/password",
    "POST",
    { password: "StructureDemo123" },
    memberLogin.value.token,
  );
  assert.equal(changed.status, 200);
  const member = changed.value.token;
  let memberState = await read(member);
  assert.equal(
    siteTabs(memberState.data, "demo-site")[2].name,
    "Arbeitsrapporte",
  );
  for (const kind of ["networks", "sites", "groups", "sections"]) {
    const denied = structuredClone(memberState);
    denied.data.structure[kind].find((x) => x.id.startsWith("demo")).name =
      "Verboten";
    assert.equal((await call("/api/state", "PUT", denied, member)).status, 403);
  }
  const invalid = await read();
  invalid.data.structure.sections.find((s) => s.id === "demo-tab").order = -1;
  assert.equal((await call("/api/state", "PUT", invalid, admin)).status, 400);
  const duplicate = await read();
  duplicate.data.structure.sections.push({
    id: "duplicate-tab",
    siteId: "demo-site",
    name: "Duplicate",
    builtin: "log",
  });
  assert.equal((await call("/api/state", "PUT", duplicate, admin)).status, 400);
  const cross = await read();
  cross.data.folders.find((f) => f.id === "demo-nested").parentId = "demo-docs";
  assert.equal((await call("/api/state", "PUT", cross, admin)).status, 400);
  const dangling = await read();
  dangling.data.structure.sites = dangling.data.structure.sites.filter(
    (s) => s.id !== "demo-sub",
  );
  dangling.data.folders.push({
    id: "orphan",
    siteId: "demo-sub",
    parentId: null,
    name: "Orphan",
  });
  assert.equal((await call("/api/state", "PUT", dangling, admin)).status, 400);
  state = await read();
  state.data.structure.networks.find((n) => n.id === "demo-net").name =
    "Umbenannt";
  state.data.structure.sites.find((s) => s.id === "demo-site").name =
    "Neue Bezeichnung";
  state.data.structure.groups
    .filter((g) => g.id.startsWith("demo"))
    .forEach((g) => (g.networkId = "demo-other"));
  state.data.structure.sites.find((s) => s.id === "demo-site").heatNetworkId =
    "demo-other";
  state.data.structure.sections.find((s) => s.id === "demo-tab").name =
    "Rapporte";
  state.data.structure.sections.find((s) => s.id === "demo-tab").order = 0;
  state.data.structure.sections.find((s) => s.id === "demo-log-tab").order = 1;
  state.data.structure.sections.find((s) => s.id === "demo-docs-tab").order = 2;
  state.data.folders.find((f) => f.id === "demo-nested").name = "2026";
  state = await save(state);
  await stop();
  await start();
  state = await read();
  assert.equal(
    state.data.structure.networks.find((n) => n.id === "demo-net").name,
    "Umbenannt",
  );
  assert.equal(
    state.data.structure.sites.find((s) => s.id === "demo-site").heatNetworkId,
    "demo-other",
  );
  assert.deepEqual(
    siteTabs(state.data, "demo-site").map((t) => t.name),
    ["Rapporte", "Betriebslogbuch", "Unterlagen"],
  );
  assert.equal(
    state.data.folders.find((f) => f.id === "demo-nested").name,
    "2026",
  );
  assert.equal(
    (
      await fetch(base + "/api/files/demo-report-file", {
        headers: { Authorization: "Bearer " + member },
      })
    ).status,
    200,
  );
  const incomplete = structuredClone(state);
  incomplete.data.structure.sections =
    incomplete.data.structure.sections.filter((s) => s.id !== "demo-tab");
  assert.equal(
    (await call("/api/state", "PUT", incomplete, admin)).status,
    400,
  );
  removeStructureItem(state.data, "sections", "demo-tab");
  state = await save(state);
  assert.equal(
    state.data.documents.find((d) => d.id === "demo-doc-file").name,
    "Schema.pdf",
  );
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-report-file")));
  memberState = await read(member);
  assert.ok(
    !siteTabs(memberState.data, "demo-site").some((t) => t.id === "demo-tab"),
  );
  removeStructureItem(state.data, "groups", "demo-group");
  state = await save(state);
  assert.ok(!state.data.structure.sites.some((s) => s.id === "demo-site"));
  assert.ok(state.data.structure.sites.some((s) => s.id === "demo-sub"));
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-doc-file")));
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-attachment")));
  removeStructureItem(state.data, "networks", "demo-net");
  state = await save(state);
  assert.ok(!state.data.structure.sites.some((s) => s.id === "demo-sub"));
  assert.ok(state.data.structure.networks.some((n) => n.id === "marzili"));
  await stop();
  await start();
  state = await read(member);
  assert.ok(!state.data.structure.networks.some((n) => n.id === "demo-net"));
  console.log(
    "Passed: structure CRUD and tab order on real SQLite/HTTP, restart persistence, member visibility/admin rights, reference validation and cascade file cleanup.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(stop);
setTimeout(() => {
  child?.kill();
  process.exitCode = 1;
  console.error("Structure HTTP test timeout");
}, 25000).unref();
