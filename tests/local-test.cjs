const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  net = require("node:net"),
  { spawn } = require("node:child_process");
let child;
(async () => {
  const untouched = fs.mkdtempSync(
    path.join(os.tmpdir(), "cockpit-do-not-touch-"),
  );
  fs.writeFileSync(path.join(untouched, "sentinel"), "unchanged");
  const port = await new Promise((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
  child = spawn(
    process.execPath,
    [path.resolve(__dirname, "../tools/start-test.cjs")],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        COCKPIT_DATA_DIR: untouched,
        COCKPIT_TEST_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (b) => (log += b));
  child.stderr.on("data", (b) => (log += b));
  const base = "http://127.0.0.1:" + port;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/session")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(ready, true, log);
  assert.match(log, /SMTP vollständig gesperrt/);
  const testLogin = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "test", password: "111" }),
  });
  assert.equal(testLogin.status, 200);
  const testAccount = await testLogin.json();
  assert.ok(testAccount.token);
  const user = testAccount.data.users.find(
    (u) => u.id === testAccount.accountId,
  );
  assert.equal(user?.name, "test");
  assert.equal(user.role, "WVM");
  assert.equal(user.mustChangePassword, false);
  const heating = testAccount.data.structure.sites.filter((site) => !site.type);
  assert.ok(heating.length);
  assert.ok(
    heating.every(
      (site) =>
        !testAccount.data.plants.some(
          (plant) => plant.siteId === site.id && !plant.deleted,
        ),
    ),
  );
  assert.ok(testAccount.data.plants.some((plant) => plant.active));
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "WVM-admin", password: "9876" }),
  });
  assert.equal(login.status, 200);
  const { token, revision, data } = await login.json();
  assert.ok(token);
  const plant = {
    id: "manual-test-plant",
    siteId: heating[0].id,
    name: "Manuell erfasste Anlage",
    active: true,
  };
  data.plants.push(plant);
  const changed = await fetch(base + "/api/state", {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ revision, data }),
  });
  assert.equal(changed.status, 200);
  assert.deepEqual(
    (await changed.json()).data.plants.filter(
      (item) => item.siteId === plant.siteId && !item.deleted,
    ),
    [plant],
  );
  const settings = await fetch(base + "/api/mail", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(settings.status, 200);
  assert.equal((await settings.json()).deliveryBlocked, true);
  const test = await fetch(base + "/api/mail/test", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "nobody@example.ch" }),
  });
  assert.equal(test.status, 403);
  assert.deepEqual(fs.readdirSync(untouched), ["sentinel"]);
  assert.equal(
    fs.readFileSync(path.join(untouched, "sentinel"), "utf8"),
    "unchanged",
  );
  console.log(
    "Passed: isolated local start, loopback server, fresh login, SMTP kill switch and untouched original data directory.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => child?.kill());
