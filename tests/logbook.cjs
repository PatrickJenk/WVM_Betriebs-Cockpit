const assert = require("node:assert/strict");
(async () => {
  const { createLogbook } = await import("../src/features/logbook.js"),
    { seed, sites, networks } = await import("../src/data/seed.js");
  global.crypto = require("node:crypto").webcrypto;
  const data = seed();
  data.users = [
    {
      id: "admin",
      name: "WVM-admin",
      initials: "ADM",
      role: "Admin",
      company: "WVM",
    },
  ];
  const user = data.users[0];
  const nodes = new Map(),
    field = (value) => ({ value, files: [], innerHTML: "" });
  const form = {
    elements: {
      networkId: field(""),
      siteId: field(""),
      plantId: field(""),
      title: field("Arbeit"),
      description: field("Feststellung"),
      status: field("Erledigt"),
      priority: field("Hoch"),
      dueDate: field(""),
      nextSteps: field(""),
      files: field(""),
    },
    querySelector: (key) => node(key),
  };
  const node = (key) => {
    if (key === "#entry-form") return form;
    if (!nodes.has(key)) nodes.set(key, {});
    return nodes.get(key);
  };
  let html = "";
  const context = {
    data,
    user,
    networks,
    sites,
    $: node,
    esc: String,
    icon: () => "",
    overdue: () => false,
    site: (id) => sites.find((s) => s.id === id),
    network: (id) => networks.find((n) => n.id === id),
    plant: (id) => data.plants.find((p) => p.id === id)?.name,
    fmt: () => "date",
    time: () => "time",
    options: (pairs, selected) =>
      pairs
        .map((pair) => {
          const [value, label] = Array.isArray(pair) ? pair : [pair, pair];
          return `<option value="${value}">${label}</option>`;
        })
        .join(""),
    show: (value) => (html = value),
    modal: { close() {}, querySelectorAll: () => [] },
    save: () => true,
    shell() {},
    toast() {},
    putFile: async () => {},
    getState: () => ({ current: null }),
    isVisible: () => true,
  };
  const api = createLogbook(context);
  const before = Date.now();
  api.entryForm();
  const after = Date.now();
  assert.ok(html.includes('name="networkId"'));
  assert.ok(html.includes("readonly"));
  assert.ok(html.includes("Gering"));
  form.elements.networkId.value = "marzili";
  form.elements.networkId.onchange();
  assert.ok(form.elements.siteId.innerHTML.includes("holzikofen"));
  assert.ok(!form.elements.siteId.innerHTML.includes("lilien"));
  form.elements.siteId.value = "holzikofen";
  data.plants.find((p) => p.id === "holzikofen-1").active = false;
  form.elements.siteId.onchange();
  assert.ok(form.elements.plantId.innerHTML.includes("holzikofen-0"));
  assert.ok(!form.elements.plantId.innerHTML.includes("holzikofen-1"));
  form.elements.plantId.value = "holzikofen-0";
  await form.onsubmit({ preventDefault() {} });
  const entry = data.entries[0];
  assert.equal(entry.priority, "Hoch");
  assert.ok(
    Date.parse(entry.occurredAt) >= before &&
      Date.parse(entry.occurredAt) <= after,
  );
  api.entryForm(entry.id);
  assert.ok(!html.includes('name="siteId"'));
  assert.ok(!html.includes('name="title"'));
  assert.ok(html.includes('name="status"'));
  assert.ok(html.includes('name="priority"'));
  form.elements.description.value = "Zusatz";
  await form.onsubmit({ preventDefault() {} });
  const edited = data.entries[0];
  assert.ok(edited.description.startsWith("Feststellung"));
  assert.ok(edited.description.includes("Zusatz"));
  assert.equal(edited.occurredAt, entry.occurredAt);
  assert.equal(edited.title, entry.title);
  assert.equal(edited.priority, "Hoch");
  api.entryForm(edited.id);
  form.elements.description.value = "";
  form.elements.status.value = "Pendenz";
  form.elements.priority.value = "Gering";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(data.entries[0].status, "Pendenz");
  assert.equal(data.entries[0].priority, "Gering");
  assert.equal(data.entries[0].completedAt, null);
  const samples = seed().entries;
  for (const [index, color, label] of [
    [0, "company-wvm", "PJ"],
    [1, "company-epc", "MM"],
    [2, "company-wvm", "2"],
    [3, "company-epc", "2"],
    [4, "company-mixed", "2"],
  ]) {
    data.entries = samples;
    api.entryDetail(samples[index].id);
    assert.ok(html.includes(`class="person ${color}"`));
    assert.ok(html.includes(`>${label}</summary>`));
  }
  console.log(
    "Passed: dependent network/site/plants, active plant selection, opening timestamp, always-visible priority and append-only edit form.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
