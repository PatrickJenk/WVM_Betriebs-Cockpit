const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
(async () => {
  const {
    seed,
    user,
    networks,
    sites,
    categories,
    stationIcon,
    stationLabel,
    initializeStations,
  } = await import("../src/data/seed.js");
  const { createAdministration } =
    await import("../src/admin/administration.js");
  const { initializeAccounts, createAccounts, isAdministrator } =
    await import("../src/auth/accounts.js");
  const { createLogbook } = await import("../src/features/logbook.js");
  const { createStructure } = await import("../src/admin/structure.js");
  const { siteTabs } = await import("../src/services/structure.js");
  const { createDocuments } = await import("../src/features/documents.js");
  const { createDashboard } = await import("../src/features/dashboard.js");
  const { uuid } = await import("../src/services/ids.js");
  const { isOverdue } = await import("../src/services/entry-status.js");
  const { entryMentions, mentionSummary } =
    await import("../src/services/mentions.js");
  const data = seed();
  global.sessionStorage = { removeItem() {} };
  initializeAccounts(data, user);
  // Nur der UI-Test verwendet einen lokalen Authentifizierungs-Dummy.
  data.users.forEach(
    (u) => (u.password = u.id === "admin" ? "9876" : "ChangeMe123"),
  );
  assert.equal(data.users.find((u) => u.id === "pj").role, "WVM");
  assert.equal(isAdministrator(data.users[0]), true);
  assert.equal(isAdministrator({ role: "WVM" }), false);
  assert.equal(isAdministrator({ role: "EPC" }), false);
  assert.equal(
    sites.find((s) => s.id === "linden1").address,
    "Forelstrasse 46, Ostermundigen",
  );
  assert.equal(
    sites.find((s) => s.id === "linden2").address,
    "Unterdorfstrasse 33, Ostermundigen",
  );
  const nodes = new Map();
  const node = (k) => {
    if (!nodes.has(k))
      nodes.set(k, {
        innerHTML: "",
        textContent: "",
        classList: { add() {}, remove() {}, toggle() {} },
        querySelector: (s) => node(k + s),
        querySelectorAll: () => [],
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        addEventListener() {},
      });
    return nodes.get(k);
  };
  const session = new Map(),
    context = {
      user: { ...user },
      uuid,
      isOverdue,
      entryMentions,
      mentionSummary,
      mentionState: { seen: [] },
      lastError: "",
      authSettings: { passwordMinimum: 8 },
      networks,
      sites,
      stationIcon,
      stationLabel,
      categories,
      createAdministration,
      createStructure,
      siteTabs,
      initializeAccounts,
      createAccounts,
      isAdministrator,
      createLogbook,
      createDocuments,
      createDashboard,
      putFile: async () => {},
      getFile: async () => {},
      deleteFile: async () => {},
      repository: { load: () => data, save: () => {} },
      document: { querySelector: node, querySelectorAll: () => [] },
      window: { addEventListener() {} },
      location: { hash: "" },
      history: {
        replaceState: (_state, _title, url) => {
          context.location.hash = url;
        },
      },
      sessionStorage: {
        getItem: (k) => session.get(k),
        setItem: (k, v) => session.set(k, v),
      },
      Intl,
      Date,
      crypto: require("node:crypto").webcrypto,
      structuredClone,
      setTimeout: () => {},
      setInterval: () => {},
      console,
    };
  global.sessionStorage = context.sessionStorage;
  global.document = context.document;
  vm.createContext(context);
  const source = fs
    .readFileSync(require("node:path").join(__dirname, "../src/app.js"), "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "");
  vm.runInContext(
    source.replace("export function isVisible", "function isVisible"),
    context,
  );
  vm.runInContext("Object.assign(user,data.users[0]);shell()", context);
  assert.ok(!node("#app").innerHTML.includes("Betriebsdokumente"));
  assert.ok(!node("#app").innerHTML.includes("operations-add"));
  assert.ok(node("#app").innerHTML.includes('data-structure-kind="networks"'));
  assert.match(node("#content").innerHTML, /marzili-logo/);
  assert.match(
    node("#app").innerHTML,
    /href="\/api\/handbook" target="_blank"/,
  );
  vm.runInContext(
    'data.entries[0].status="Pendenz";data.entries[0].mentions=[{id:user.id,name:user.name}];render()',
    context,
  );
  assert.ok(node("#content").innerHTML.includes("1 Erwähnungen"));
  node("#my-mentions").onclick();
  assert.equal(context.location.hash, "#dashboard");
  assert.equal(vm.runInContext("filters.mine", context), true);
  assert.ok(node("#content").innerHTML.includes('data-entry="seed-0"'));
  assert.ok(!node("#content").innerHTML.includes('data-entry="seed-1"'));
  vm.runInContext('data.entries[0].status="Erledigt";render()', context);
  assert.ok(node("#content").innerHTML.includes('id="my-mentions"'));
  assert.ok(node("#content").innerHTML.includes('data-entry="seed-0"'));
  for (const selector of [".nav-dashboard", ".brand", ".dashboard-logo"]) {
    vm.runInContext(
      'filters={mine:true,high:true,late:true,query:"test"};onlyOpen=true;shell()',
      context,
    );
    let prevented = false;
    node(selector).onclick({
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(context.location.hash, "#dashboard");
    assert.equal(vm.runInContext("Object.keys(filters).length", context), 0);
    assert.equal(vm.runInContext("onlyOpen", context), false);
    assert.ok(node("#content").innerHTML.includes('data-entry="seed-1"'));
  }
  vm.runInContext("data.entries[0].mentions=[];filters={};render()", context);
  assert.ok(node("#content").innerHTML.includes('id="my-mentions"'));
  assert.ok(!node("#content").innerHTML.includes("network-card"));
  vm.runInContext("current='eiger';tab='docs';render()", context);
  node("#new-section").onclick();
  node("#structure-form").onsubmit({
    preventDefault() {},
    currentTarget: {
      elements: {
        itemName: { value: "Arbeitsrapporte" },
        position: { value: "2" },
      },
    },
  });
  const addedTab = data.structure.sections.find(
    (s) => !s.builtin && s.siteId === "eiger",
  );
  assert.ok(
    node("#content").innerHTML.includes(
      `data-tab="${addedTab.id}" class="selected"`,
    ),
  );
  assert.equal(vm.runInContext("tab", context), addedTab.id);
  assert.ok(node("#content").innerHTML.includes("Arbeitsrapporte"));
  vm.runInContext("tab='docs';filters={};render()", context);
  assert.match(node("#content").innerHTML, /id="upload" disabled/);
  assert.ok(!node("#content").innerHTML.includes('data-folder="unfiled"'));
  vm.runInContext(
    "data.folders.push({id:'folder',siteId:'eiger',name:'Schemas',parentId:null});filters.folder='folder';render()",
    context,
  );
  assert.ok(node("#content").innerHTML.includes('id="dropzone"'));
  vm.runInContext(
    "Object.assign(user,data.users.find(u=>u.id==='pj'));shell()",
    context,
  );
  assert.ok(!node("#app").innerHTML.includes('id="manage-users"'));
  assert.ok(!node("#content").innerHTML.includes('id="manage-plants"'));
  assert.ok(!node("#content").innerHTML.includes('id="new-folder"'));
  assert.ok(!node("#content").innerHTML.includes('id="new-section"'));
  assert.ok(!node("#content").innerHTML.includes("data-edit-section="));
  assert.ok(!node("#app").innerHTML.includes("data-structure-kind="));
  assert.ok(node("#content").innerHTML.includes('id="upload" >'));
  vm.runInContext("accounts.logout()", context);
  assert.match(node("#app").innerHTML, /login-form/);
  assert.equal(session.get("cockpit-account"), "signed-out");
  vm.runInContext(
    "Object.assign(user,data.users.find(u=>u.id==='pj'))",
    context,
  );
  assert.equal(
    vm.runInContext(
      "isVisible({status:'Erledigt',completedAt:'2026-03-31T21:59:59Z'},new Date('2026-04-01T00:00:00Z'))",
      context,
    ),
    false,
  );
  assert.equal(
    vm.runInContext(
      "isVisible({status:'Pendenz'},new Date('2026-04-01T00:00:00Z'))",
      context,
    ),
    true,
  );
  for (const date of ["2026-04-01", "2026-07-01", "2026-10-01", "2027-01-01"]) {
    const before = new Date(
      new Date(date + "T00:00:00+02:00").getTime() - 86400000,
    ).toISOString();
    assert.equal(
      vm.runInContext(
        `isVisible({status:'Erledigt',completedAt:'${before}'},new Date('${date}T12:00:00Z'))`,
        context,
      ),
      false,
    );
  }
  vm.runInContext("accounts.logout()", context);
  const login = (name, password) =>
    node("#login-form").onsubmit({
      preventDefault() {},
      currentTarget: {
        elements: { username: { value: name }, password: { value: password } },
      },
    });
  login("WVM-admin", "wrong");
  assert.match(node("#login-error").textContent, /falsch/);
  login("Patrick Jenk", "ChangeMe123");
  assert.match(node("#app").innerHTML, /password-form/);
  assert.equal(session.get("cockpit-account"), "signed-out");
  const passwordForm = node("#password-form");
  passwordForm.onsubmit({
    preventDefault() {},
    currentTarget: {
      elements: {
        password: { value: "MyNewPassword!" },
        confirmation: { value: "different" },
      },
    },
  });
  assert.equal(data.users.find((u) => u.id === "pj").mustChangePassword, true);
  passwordForm.onsubmit({
    preventDefault() {},
    currentTarget: {
      elements: {
        password: { value: "MyNewPassword!" },
        confirmation: { value: "MyNewPassword!" },
      },
    },
  });
  assert.equal(data.users.find((u) => u.id === "pj").mustChangePassword, false);
  assert.equal(session.get("cockpit-account"), "pj");
  vm.runInContext("accounts.logout()", context);
  login("WVM-admin", "9876");
  assert.equal(session.get("cockpit-account"), "admin");
  assert.equal(data.users.find((u) => u.id === "admin").password, "9876");
  assert.equal(data.users.find((u) => u.id === "mm").mustChangePassword, true);
  vm.runInContext("Object.assign(user,data.users[0])", context);
  assert.equal(
    vm.runInContext(
      "isVisible({status:'Erledigt',completedAt:'2020-01-01T00:00:00Z'})",
      context,
    ),
    true,
  );
  vm.runInContext("entryDetail('seed-0')", context);
  assert.match(node("#modal").innerHTML, /id="delete-entry"/);
  node("#delete-entry").onclick();
  assert.match(node("#modal").innerHTML, /confirm-entry-delete/);
  node("#confirm-entry-delete").onclick();
  assert.ok(!data.entries.some((e) => e.id === "seed-0"));
  vm.runInContext(
    "Object.assign(user,data.users.find(u=>u.id==='pj'));entryDetail('seed-1')",
    context,
  );
  assert.ok(!node("#modal").innerHTML.includes('id="delete-entry"'));
  for (const [end, start] of [
    ["2026-03-31T23:59:59+02:00", "2026-04-01T00:00:00+02:00"],
    ["2026-06-30T23:59:59+02:00", "2026-07-01T00:00:00+02:00"],
    ["2026-09-30T23:59:59+02:00", "2026-10-01T00:00:00+02:00"],
    ["2026-12-31T23:59:59+01:00", "2027-01-01T00:00:00+01:00"],
  ]) {
    assert.equal(
      vm.runInContext(
        `isVisible({status:'Erledigt',completedAt:'${end}'},new Date('${end}'))`,
        context,
      ),
      true,
    );
    assert.equal(
      vm.runInContext(
        `isVisible({status:'Erledigt',completedAt:'${end}'},new Date('${start}'))`,
        context,
      ),
      false,
    );
  }
  assert.equal(sites.length, 14);
  assert.equal(sites.filter((s) => s.type === "mbus").length, 6);
  assert.equal(sites.filter((s) => s.type === "heat-substation").length, 2);
  const existing = {
    plants: seed().plants.filter((p) =>
      ["eiger", "monbijou", "milch", "linden2", "linden1", "lilien"].includes(
        p.siteId,
      ),
    ),
  };
  initializeStations(existing);
  const plantCount = existing.plants.length;
  initializeStations(existing);
  assert.equal(existing.plants.length, plantCount);
  for (const station of sites.filter((s) => s.type)) {
    assert.ok(existing.plants.some((p) => p.siteId === station.id));
    vm.runInContext(
      `current='${station.id}';tab='log';Object.assign(user,data.users[0]);shell()`,
      context,
    );
    assert.ok(node("#content").innerHTML.includes(station.name));
    assert.ok(node("#content").innerHTML.includes(stationLabel(station)));
  }
  vm.runInContext("current=null;shell()", context);
  assert.equal(
    (node("#app").innerHTML.match(/class="station-group"/g) || []).length,
    6,
  );
  assert.equal(
    (node("#app").innerHTML.match(/>Heizzentralen<\/span>/g) || []).length,
    3,
  );
  assert.equal(
    (node("#app").innerHTML.match(/>Unterstationen<\/span>/g) || []).length,
    3,
  );
  assert.equal(
    vm.runInContext(
      "navState['marzili-substations']=false;navExpanded('marzili-substations',sites.filter(s=>s.heatNetworkId==='marzili'&&s.type))",
      context,
    ),
    false,
  );
  assert.equal(
    vm.runInContext(
      "current='holzikofen';navExpanded('marzili-substations',sites.filter(s=>s.heatNetworkId==='marzili'&&s.type))",
      context,
    ),
    false,
  );
  assert.equal(
    vm.runInContext(
      "navState['marzili-substations']=true;navExpanded('marzili-substations')",
      context,
    ),
    true,
  );
  const templates = seed().folders;
  for (const heating of sites.filter((s) => !s.type)) {
    assert.equal(
      templates.filter((f) => f.siteId === heating.id && !f.parentId).length,
      5,
    );
    assert.ok(
      templates.some(
        (f) => f.siteId === heating.id && f.name === "Bedienungsanleitungen",
      ),
    );
  }
  assert.ok(!templates.some((f) => sites.find((s) => s.id === f.siteId)?.type));
  const now = new Date("2026-10-06T12:00:00Z");
  const age = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  assert.equal(
    isOverdue({ status: "Pendenz", createdAt: age(30) }, now),
    false,
  );
  assert.equal(isOverdue({ status: "Pendenz", createdAt: age(31) }, now), true);
  assert.equal(
    isOverdue({ status: "In Bearbeitung", createdAt: age(31) }, now),
    true,
  );
  assert.equal(
    isOverdue({ status: "Erledigt", createdAt: age(31) }, now),
    false,
  );
  assert.equal(
    isOverdue(
      { status: "Pendenz", createdAt: age(1), dueDate: "2026-10-05" },
      now,
    ),
    true,
  );
  assert.equal(
    isOverdue(
      { status: "Pendenz", createdAt: age(31), dueDate: "2026-12-31" },
      now,
    ),
    true,
  );
  assert.equal(isOverdue(seed().entries.find((e) => e.id === "seed-5")), true);
  console.log(
    "Passed: dashboard rendering, account roles, logout, address mapping, folder-only uploads, member/admin controls.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
