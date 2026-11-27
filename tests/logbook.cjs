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
      occurredAt: field("2026-11-17T10:45"),
      activity: field("Kontrollrundgang mit Ascheleerung"),
      title: field("Arbeit"),
      description: field("Feststellung"),
      status: field("Erledigt"),
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
  api.entryForm();
  assert.ok(html.includes('name="networkId"'));
  assert.ok(html.includes('type="datetime-local"'));
  assert.ok(html.includes("Kontrollrundgang ohne Ascheleerung"));
  assert.ok(html.includes("Störung"));
  assert.doesNotMatch(html, /Priorität/);
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
  assert.equal(entry.priority, undefined);
  assert.equal(entry.occurredAt, "2026-11-17T09:45:00.000Z");
  assert.equal(entry.activity, "Kontrollrundgang mit Ascheleerung");
  api.entryForm(entry.id);
  assert.ok(html.includes('name="siteId"'));
  assert.ok(html.includes('name="title"'));
  user.role = "WVM";
  api.entryForm(entry.id);
  assert.ok(!html.includes('name="siteId"'));
  assert.ok(!html.includes('name="title"'));
  assert.ok(html.includes('name="status"'));
  assert.doesNotMatch(html, /name="priority"/);
  form.elements.description.value = "Zusatz";
  form.elements.occurredAt.value = "2026-11-16T12:55";
  await form.onsubmit({ preventDefault() {} });
  const edited = data.entries[0];
  assert.ok(edited.description.startsWith("Feststellung"));
  assert.ok(edited.description.includes("Zusatz"));
  assert.equal(edited.occurredAt, "2026-11-16T11:55:00.000Z");
  assert.equal(edited.title, entry.title);
  api.entryForm(edited.id);
  form.elements.description.value = "";
  form.elements.status.value = "Pendenz";
  form.elements.activity.value = "Störung";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(data.entries[0].status, "Pendenz");
  assert.equal(data.entries[0].activity, "Störung");
  assert.equal(data.entries[0].completedAt, null);
  const samples = seed().entries;
  for (const [index, color, label] of [
    [0, "company-wvm", "PJ"],
    [1, "company-epc", "MM"],
    [2, "company-wvm", "PJ"],
    [3, "company-epc", "MM"],
    [4, "company-mixed", "PJ"],
  ]) {
    data.entries = samples;
    api.entryDetail(samples[index].id);
    assert.ok(html.includes(`class="person ${color}"`));
    assert.ok(html.includes(`>${label}</summary>`));
  }
  const { parseHTML } = require("linkedom");
  const { document } = parseHTML('<div id="entry-test"></div>');
  global.document = document;
  const storedDrafts = new Map();
  global.sessionStorage = {
    getItem: (key) => storedDrafts.get(key) ?? null,
    setItem: (key, value) => storedDrafts.set(key, value),
    removeItem: (key) => storedDrafts.delete(key),
  };
  data.users.push(
    { id: "alice", name: "Alice Beispiel", email: "alice@example.invalid" },
    { id: "bob", name: "Bob Beispiel", email: "bob@example.invalid" },
    { id: "cara", name: "Cara Beispiel", email: "cara@example.invalid" },
  );
  const domLogbook = createLogbook({
    ...context,
    getState: () => ({ current: "eiger" }),
    $: (selector) => document.querySelector(selector),
    show(value) {
      document.querySelector("#entry-test").innerHTML = value;
      const entryForm = document.querySelector("#entry-form");
      entryForm.elements = Object.fromEntries(
        Array.from(entryForm.querySelectorAll("[name]")).map((field) => [
          field.name,
          field,
        ]),
      );
      const grid = entryForm.querySelector(".form-grid");
      const insert = grid.insertAdjacentHTML.bind(grid);
      grid.insertAdjacentHTML = (position, markup) => {
        insert(position, markup);
        grid.querySelectorAll(".recipient-picker input").forEach((input) => {
          input.setCustomValidity = () => {};
        });
      };
    },
  });
  domLogbook.entryForm();
  assert.equal(document.querySelector('select[name="plantId"] optgroup'), null);
  assert.ok(
    document.querySelector('select[name="plantId"] option[value="eiger-0"]'),
  );
  const responsible = document.querySelector(
    '[data-recipient-picker="responsible"]',
  );
  const search = responsible.querySelector("input");
  search.onfocus();
  assert.equal(
    responsible.querySelectorAll(".recipient-choices button").length,
    4,
  );
  search.value = "alice@example";
  search.oninput();
  assert.equal(
    responsible.querySelectorAll(".recipient-choices button").length,
    1,
  );
  responsible.querySelector(".recipient-choices button").click();
  assert.match(
    responsible.querySelector(".recipient-selection").textContent,
    /Alice Beispiel/,
  );
  const cc = document.querySelector('[data-recipient-picker="cc"]');
  const ccSearch = cc.querySelector("input");
  for (const query of ["Bob", "@Cara"]) {
    ccSearch.value = query;
    ccSearch.oninput();
    cc.querySelector(".recipient-choices button").click();
  }
  assert.equal(cc.querySelectorAll(".recipient-selection button").length, 2);
  ccSearch.value = "Alice";
  ccSearch.oninput();
  assert.equal(cc.querySelectorAll(".recipient-choices button").length, 0);
  const description = document.querySelector('textarea[name="description"]');
  description.value = "Ungespeicherte Feststellung";
  description.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  domLogbook.entryForm();
  assert.equal(
    document.querySelector('textarea[name="description"]').value,
    "Ungespeicherte Feststellung",
  );
  assert.match(
    document.querySelector(
      '[data-recipient-picker="responsible"] .recipient-selection',
    ).textContent,
    /Alice Beispiel/,
  );
  assert.equal(
    document.querySelectorAll(
      '[data-recipient-picker="cc"] .recipient-selection button',
    ).length,
    2,
  );
  document.querySelector("#entry-form .cancel").click();
  assert.equal(storedDrafts.size, 0);
  console.log(
    "Passed: dependent network/site/plants, activity selection, timestamp correction and append-only description.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
