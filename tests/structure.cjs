const assert = require("node:assert/strict");
(async () => {
  const { createStructure } = await import("../src/admin/structure.js");
  const { siteTabs, structureImpact } =
    await import("../src/services/structure.js");
  const data = {
    structure: {
      networks: [{ id: "n", name: "Verbund" }],
      sites: [],
      groups: [],
      sections: [],
    },
    plants: [],
    folders: [],
    documents: [],
    entries: [],
  };
  const nodes = new Map();
  let html = "",
    saved = 0,
    allow = true,
    result;
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, {});
    return nodes.get(key);
  };
  global.document = {
    querySelector: (key) =>
      html.includes(`id="${key.slice(1)}"`) ? node(key) : null,
    querySelectorAll: () => [],
  };
  const settings = {
    data,
    user: { role: "Admin" },
    esc: String,
    options: () => "",
    show: (s) => {
      html = s;
    },
    modal: { close() {} },
    save: () => {
      saved++;
      return allow;
    },
    shell() {},
    toast() {},
    onStructureChange: (r) => (result = r),
  };
  const api = createStructure(settings);
  function submit(values) {
    node("#structure-form").onsubmit({
      preventDefault() {},
      currentTarget: {
        elements: Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, { value: v }]),
        ),
      },
    });
  }
  const fields = (name, group = "", network = "n", type = "") => ({
    itemName: name,
    network,
    group,
    type,
    address: "Bern",
  });
  api.form("sites", null, { heatNetworkId: "n" });
  submit(fields("Neue Zentrale"));
  const sid = data.structure.sites[0].id;
  assert.equal(data.plants[0].siteId, sid);
  api.form("sections", null, { siteId: sid });
  submit({ itemName: "Arbeitsrapporte", position: "2" });
  const reports = data.structure.sections.find((s) => !s.builtin);
  assert.equal(data.folders[0].sectionId, reports.id);
  assert.equal(result.tab, reports.id);
  assert.deepEqual(
    siteTabs(data, sid).map((t) => t.name),
    ["Logbuch", "Dokumente", "Arbeitsrapporte"],
  );
  data.documents.push({
    id: "report-file",
    siteId: sid,
    folderId: data.folders[0].id,
    name: "Rapport.pdf",
  });
  api.form("sections", reports.id, { siteId: sid });
  submit({ itemName: "Rapporte", position: "0" });
  assert.deepEqual(
    siteTabs(data, sid).map((t) => t.name),
    ["Rapporte", "Logbuch", "Dokumente"],
  );
  assert.equal(data.documents[0].folderId, data.folders[0].id);
  api.moveTab(sid, reports.id, 1);
  assert.deepEqual(
    siteTabs(data, sid).map((t) => t.key),
    ["log", reports.id, "docs"],
  );
  api.form("sections", "log", { siteId: sid });
  submit({ itemName: "Betriebslogbuch", position: "0" });
  assert.equal(siteTabs(data, sid)[0].name, "Betriebslogbuch");
  api.remove("sections", "docs", sid);
  assert.equal(siteTabs(data, sid).length, 3);
  node("#structure-cancel").onclick();
  assert.equal(siteTabs(data, sid).length, 3);
  api.remove("sections", "docs", sid);
  node("#structure-confirm-delete").onclick();
  assert.deepEqual(
    siteTabs(data, sid).map((t) => t.key),
    ["log", reports.id],
  );
  assert.equal(data.documents.length, 1);
  api.form("sections", "docs", { siteId: sid });
  submit({ itemName: "Unterlagen", position: "1" });
  assert.deepEqual(
    siteTabs(data, sid).map((t) => t.name),
    ["Betriebslogbuch", "Unterlagen", "Rapporte"],
  );
  assert.equal(
    data.structure.sections.filter((s) => s.builtin === "docs").length,
    1,
  );
  const duplicateSaves = saved;
  api.form("sections", null, { siteId: sid });
  submit({ itemName: "Rapporte", position: "3" });
  assert.equal(saved, duplicateSaves);
  api.form("groups", null, { networkId: "n" });
  submit(fields("Nord"));
  const group = data.structure.groups[0].id;
  api.form("groups", null, { networkId: "n", parentId: group });
  submit(fields("Technik", group));
  const child = data.structure.groups[1].id;
  api.form("sites", sid);
  submit(fields("Neue Zentrale", child, "n", "mbus"));
  assert.equal(data.structure.sites[0].type, "mbus");
  assert.equal(data.structure.sites[0].groupId, child);
  api.form("networks");
  submit({ itemName: "Zweiter Verbund" });
  const n2 = data.structure.networks[1].id;
  api.form("groups", group);
  submit(fields("Nord", "", n2));
  assert.ok(data.structure.groups.every((g) => g.networkId === n2));
  assert.equal(data.structure.sites[0].heatNetworkId, n2);
  // Failed saves must not detach the form from the current data. Retrying the same form works.
  api.form("networks");
  allow = false;
  submit({ itemName: "Erneut versuchen" });
  assert.equal(data.structure.networks.length, 2);
  allow = true;
  submit({ itemName: "Erneut versuchen" });
  assert.equal(data.structure.networks.length, 3);
  data.entries.push({
    id: "entry",
    siteId: sid,
    attachments: [{ id: "attachment" }],
  });
  const impact = structureImpact(data, "networks", n2);
  assert.equal(impact.groups.size, 2);
  assert.equal(impact.documents.length, 1);
  assert.equal(impact.attachments.length, 1);
  api.remove("networks", n2);
  assert.ok(html.includes("1 Dokumente, 1 Logbucheinträge"));
  assert.equal(data.structure.sites.length, 1);
  allow = false;
  node("#structure-confirm-delete").onclick();
  assert.equal(data.structure.sites.length, 1);
  allow = true;
  node("#structure-confirm-delete").onclick();
  assert.equal(data.structure.sites.length, 0);
  assert.equal(data.structure.groups.length, 0);
  assert.equal(data.structure.sections.length, 0);
  for (const key of ["folders", "plants", "documents", "entries"])
    assert.equal(data[key].length, 0);
  assert.ok(!data.structure.networks.some((n) => n.id === n2));
  // Independent custom register removal must leave other registers and documents intact.
  data.structure.sites.push({ id: "s", name: "Site", heatNetworkId: "n" });
  data.structure.sections.push({ id: "r", siteId: "s", name: "Reports" });
  data.folders.push(
    { id: "r-folder", siteId: "s", sectionId: "r" },
    { id: "docs-folder", siteId: "s" },
  );
  data.documents.push(
    { id: "r-doc", siteId: "s", folderId: "r-folder" },
    { id: "docs-doc", siteId: "s", folderId: "docs-folder" },
  );
  api.remove("sections", "r", "s");
  node("#structure-confirm-delete").onclick();
  assert.deepEqual(
    data.documents.map((d) => d.id),
    ["docs-doc"],
  );
  api.remove("sites", "s");
  node("#structure-confirm-delete").onclick();
  assert.equal(data.structure.sites.length, 0);
  data.structure.groups.push({ id: "empty", name: "Empty", networkId: "n" });
  api.remove("groups", "empty");
  node("#structure-confirm-delete").onclick();
  assert.equal(data.structure.groups.length, 0);
  for (const role of ["WVM", "EPC"]) {
    const before = JSON.stringify(data),
      calls = saved,
      forbidden = createStructure({ ...settings, user: { role } });
    for (const kind of ["networks", "sites", "groups", "sections"]) {
      forbidden.form(kind);
      forbidden.remove(kind, "n");
    }
    forbidden.moveTab(sid, "log", 1);
    forbidden.manage();
    forbidden.manageTabs(sid);
    assert.equal(JSON.stringify(data), before);
    assert.equal(saved, calls);
  }
  console.log(
    "Passed: all structure CRUD, nested moves, immediate report opening, tab rename/order/hide/restore, delete confirmations/cascades, failed-save retry and admin-only controls.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
