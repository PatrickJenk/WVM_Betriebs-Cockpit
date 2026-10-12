const assert = require("node:assert/strict");
(async () => {
  const stored = new Map([["cockpit-account", "pj"]]);
  global.sessionStorage = {
    getItem: (k) => stored.get(k),
    setItem: (k, v) => stored.set(k, v),
    removeItem: (k) => stored.delete(k),
  };
  let accountId = "admin",
    revision = 1;
  const initial = { users: [{ id: "admin" }], entries: [] };
  let writes = 0;
  global.XMLHttpRequest = class {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    getResponseHeader() {
      return "test-csrf";
    }
    send(body) {
      if (this.method === "PUT") {
        writes++;
        revision++;
      }
      this.status = 200;
      this.responseText = JSON.stringify({
        authenticated: true,
        accountId,
        revision,
        data: this.method === "PUT" ? JSON.parse(body).data : initial,
      });
    }
  };
  const { repository } = await import("../src/services/repository.js");
  const data = repository.load();
  assert.equal(stored.get("cockpit-account"), "admin");
  data.entries.push({ id: "new" });
  repository.save(data);
  assert.equal(writes, 1);
  accountId = "pj";
  data.entries.push({ id: "other" });
  assert.throws(() => repository.save(data), /anderen Tab/);
  assert.equal(writes, 1);
  console.log(
    "Passed: restored server identity, admin saving and blocking a different tab account before mutation.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
