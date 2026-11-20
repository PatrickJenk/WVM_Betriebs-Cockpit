const assert = require("node:assert/strict");

(async () => {
  const { createManagement } = await import("../src/admin/management.js");
  const nodes = new Map();
  let markup = "";
  const visits = [];
  global.document = { getElementById: (id) => nodes.get(id) };
  const visited = (name) => (back) => {
    visits.push(name);
    markup = name;
    back();
  };
  const config = {
    user: { role: "Admin" },
    show(html) {
      markup = html;
      nodes.clear();
      for (const [, id] of html.matchAll(/id="(management-[^"]+)"/g))
        nodes.set(id, {});
    },
    structure: { manage: visited("navigation") },
    collaboration: { can: (right) => right === "smtp", mail: visited("mail") },
    accounts: {
      manage(message, back) {
        assert.equal(message, "");
        visited("users")(back);
      },
    },
  };

  const management = createManagement(config);
  management.open();
  assert.deepEqual(
    [...nodes.keys()],
    ["management-navigation", "management-mail", "management-users"],
  );
  assert.doesNotMatch(markup, /Standort auswählen|Übergabe|Benutzerhandbuch/);
  for (const link of ["navigation", "mail", "users"]) {
    nodes.get("management-" + link).onclick();
    assert.match(markup, /Cockpit verwalten/);
  }
  assert.deepEqual(visits, ["navigation", "mail", "users"]);

  createManagement({
    ...config,
    collaboration: { ...config.collaboration, can: () => false },
  }).open();
  assert.equal(nodes.has("management-mail"), false);

  markup = "";
  createManagement({ ...config, user: { role: "EPC" } }).open();
  assert.equal(markup, "");

  const { parseHTML } = require("linkedom");
  const { createStructure } = await import("../src/admin/structure.js");
  const { document: page } = parseHTML("<div id='dialog'></div>");
  global.document = page;
  const dialog = page.getElementById("dialog");
  let back;
  const structure = createStructure({
    data: {
      structure: {
        networks: [
          { id: "a", name: "Verbund A" },
          { id: "b", name: "Verbund B" },
        ],
        sites: [
          { id: "heat", name: "Heizzentrale A", heatNetworkId: "a" },
          {
            id: "sub",
            name: "Unterstation A",
            heatNetworkId: "a",
            type: "mbus",
          },
          { id: "other", name: "Standort B", heatNetworkId: "b" },
        ],
        groups: [],
        sections: [],
      },
    },
    user: { role: "Admin", leadership: true },
    esc: String,
    modal: { close() {} },
    show(html, goBack) {
      dialog.innerHTML = html;
      back = goBack;
    },
  });
  const click = (selector) => page.querySelector(selector).click();
  structure.manage();
  assert.doesNotMatch(dialog.textContent, /Verbund A|Standort B/);
  click("#nav-admin-operations");
  assert.deepEqual(
    [...page.querySelectorAll("[data-navigation-open]")].map((link) =>
      link.getAttribute("href"),
    ),
    ["#dashboard", "#documentation", "#personnel"],
  );
  back();
  click("#nav-admin-leadership");
  assert.match(dialog.textContent, /Austausch EPC \+ WVM/);
  back();
  click("#nav-admin-networks");
  assert.match(dialog.textContent, /Verbund A/);
  assert.doesNotMatch(dialog.textContent, /Standort B/);
  click('[data-manage-network="a"]');
  assert.match(dialog.textContent, /Heizzentrale A[\s\S]*Unterstation A/);
  assert.doesNotMatch(dialog.textContent, /Standort B/);
  click('[data-manage-site="sub"]');
  assert.match(dialog.textContent, /Unterstation A/);
  click("#manage-station-registers");
  assert.match(dialog.textContent, /Register verwalten/);
  back();
  assert.match(dialog.textContent, /Standort bearbeiten/);
  console.log(
    "Passed: management shortcuts, return navigation and SMTP permissions.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
