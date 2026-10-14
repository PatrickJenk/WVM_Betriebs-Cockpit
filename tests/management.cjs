const assert = require("node:assert/strict");

(async () => {
  const { createManagement } = await import("../src/admin/management.js");
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: "" });
    return nodes.get(id);
  };
  global.document = { getElementById: node };
  const data = {
    structure: {
      networks: [{ id: "n", name: "Verbund" }],
      sites: [{ id: "s", heatNetworkId: "n", name: "Zentrale <West>" }],
    },
  };
  const before = JSON.stringify(data);
  let shown = "",
    calls = [];
  const config = {
    user: { role: "Admin" },
    data,
    esc: (value) =>
      String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    show: (html) => {
      shown = html;
    },
    modal: { close: () => calls.push("close") },
    getState: () => ({ current: "s" }),
    structure: {
      manage: () => calls.push("navigation"),
      manageTabs: (id) => calls.push(["tabs", id]),
    },
    accounts: { manage: () => calls.push("users") },
    admin: { plants: (id) => calls.push(["plants", id]) },
  };
  createManagement(config).open();
  assert.match(shown, /Zentrale &lt;West&gt;/);
  assert.match(shown, /value="s" selected/);
  assert.equal(node("management-tabs").disabled, true);
  node("management-tabs").onclick();
  assert.deepEqual(calls, []);
  node("management-site").value = "s";
  node("management-site").onchange();
  assert.equal(node("management-tabs").disabled, false);
  node("management-tabs").onclick();
  node("management-plants").onclick();
  node("management-navigation").onclick();
  node("management-users").onclick();
  node("management-close").onclick();
  assert.deepEqual(calls, [
    ["tabs", "s"],
    ["plants", "s"],
    "navigation",
    "users",
    "close",
  ]);
  assert.equal(
    JSON.stringify(data),
    before,
    "Opening and navigating must not change stored content",
  );
  shown = "";
  createManagement({ ...config, user: { role: "EPC" } }).open();
  assert.equal(shown, "", "Only administrators may open management");
  console.log(
    "Passed: management permissions, escaped labels, location selection, action routing and unchanged data.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
