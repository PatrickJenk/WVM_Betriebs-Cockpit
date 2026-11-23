const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const nodemailer = require("nodemailer");

process.env.NODE_ENV = "development";
process.env.COCKPIT_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "cockpit-accounts-"),
);
process.env.COCKPIT_MAIL_DISABLED = "0";
process.env.COCKPIT_MFA_ENABLED = "1"; // Obsolete settings must not enable MFA.

let sent;
let rejectDelivery = false;
nodemailer.createTransport = () => ({
  async sendMail(message) {
    if (rejectDelivery)
      throw Object.assign(Error("SMTP test rejection"), { code: "EAUTH" });
    sent = message;
    return { accepted: [message.to] };
  },
});
const store = require("../server-security.cjs");
const server = http.createServer(require("../server-api.cjs"));

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api/";
  async function call(route, method = "GET", payload, token) {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, value: await response.json() };
  }
  const login = (name, password) => call("login", "POST", { name, password });
  const create = (account, token) => call("accounts", "POST", account, token);
  const state = (token) => call("state", "GET", undefined, token);

  assert.equal((await call("session")).status, 200);
  const administrator = (await login("ADM", "9876")).value.token;
  assert.ok(administrator);
  const profile = {
    name: "Fiktive Person",
    initials: "FP",
    email: "test@example.invalid",
    company: "EPC",
    userRole: true,
    admin: false,
    leadership: true,
  };
  assert.equal((await create(profile)).status, 401);
  assert.equal(
    (
      await create(
        { ...profile, userRole: false, leadership: false },
        administrator,
      )
    ).status,
    400,
  );
  assert.equal(
    (await create({ ...profile, email: "" }, administrator)).status,
    400,
  );
  const second = (await login("PJ", "ChangeMe123")).value.token;
  assert.equal((await create(profile, second)).status, 403);

  assert.equal(
    (
      await call(
        "mail",
        "PUT",
        {
          host: "smtp.example.invalid",
          port: 587,
          username: "",
          senderName: "Cockpit",
          senderEmail: "sender@example.invalid",
          replyTo: "",
          encryption: "starttls",
          enabled: true,
          baseUrl: "https://cockpit.example.invalid",
        },
        administrator,
      )
    ).status,
    200,
  );

  rejectDelivery = true;
  const first = await create(profile, administrator);
  assert.equal(first.status, 201);
  assert.equal(first.value.delivery, "failed");
  assert.match(first.value.deliveryError, /SMTP-Anmeldung/);
  const id = first.value.accountId;
  assert.equal((await create(profile, administrator)).status, 409);
  const retryUrl = "accounts/" + id + "/invitation";
  rejectDelivery = false;
  assert.equal(
    (
      await call(
        retryUrl,
        "POST",
        { email: "old@example.invalid" },
        administrator,
      )
    ).status,
    409,
  );
  const retry = await call(
    retryUrl,
    "POST",
    { email: profile.email },
    administrator,
  );
  assert.equal(retry.value.accountId, id);
  assert.equal(retry.value.delivery, "sent");
  assert.equal(sent.to, profile.email);
  assert.ok(sent.text.includes("Benutzername: FP"));
  const initialPassword = sent.text.match(/Startpasswort: (\S+)/)[1];
  assert.ok(initialPassword.length >= 24);
  assert.ok(!JSON.stringify(retry.value).includes(initialPassword));
  assert.ok(!JSON.stringify(store.read()).includes(initialPassword));
  assert.ok(
    !JSON.stringify(
      (await call("audit", "GET", undefined, administrator)).value,
    ).includes(initialPassword),
  );
  assert.equal((await login(profile.name, initialPassword)).status, 401);

  const pending = await login("fp", initialPassword);
  assert.equal(pending.status, 200);
  assert.equal(pending.value.data.users[0].mustChangePassword, true);
  assert.equal((await state(pending.value.token)).status, 403);
  assert.equal(
    (await call("leadership", "GET", undefined, pending.value.token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "password",
        "POST",
        { password: initialPassword },
        pending.value.token,
      )
    ).status,
    400,
  );
  const changed = await call(
    "password",
    "POST",
    { password: "ExampleChosenPassword2026!" },
    pending.value.token,
  );
  const member = changed.value.token;
  assert.ok(member);
  assert.equal(
    (await call("leadership", "GET", undefined, member)).status,
    200,
  );
  assert.equal(
    (await create({ ...profile, initials: "NW" }, member)).status,
    403,
  );
  assert.equal((await login("FP", initialPassword)).status, 401);

  let snapshot = (await state(administrator)).value;
  const edited = await call(
    "accounts/" + id,
    "PUT",
    {
      ...profile,
      company: "WVM",
      userRole: false,
      admin: true,
      leadership: false,
      active: true,
      revision: snapshot.revision,
    },
    administrator,
  );
  assert.equal(edited.status, 200);
  assert.equal(
    store.read().data.users.find((u) => u.id === id).userRole,
    false,
  );
  assert.equal((await state(member)).status, 401);
  const adminWithoutLeadership = (
    await login("FP", "ExampleChosenPassword2026!")
  ).value.token;
  assert.equal(
    (await call("leadership", "GET", undefined, adminWithoutLeadership)).status,
    404,
  );
  assert.equal(
    (await call("audit", "GET", undefined, adminWithoutLeadership)).status,
    200,
  );
  snapshot = (await state(administrator)).value;
  assert.equal(
    (
      await call(
        "accounts/" + id,
        "PUT",
        {
          ...profile,
          active: false,
          revision: snapshot.revision,
        },
        administrator,
      )
    ).status,
    200,
  );
  assert.equal((await login("FP", "ExampleChosenPassword2026!")).status, 401);

  const testTerminal = `
    process.argv.splice(1, 0, "tools/setup-backup-admin.cjs");
    Object.defineProperty(process.stdin, "isTTY", { value: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true });
    const fixturePassword = process.env.COCKPIT_SETUP_TEST_PASSWORD;
    require("node:readline/promises").createInterface = ({ output }) => ({
      on() {},
      close() {},
      async question(prompt) {
        const answer = prompt ? "BA" : fixturePassword;
        output.write(answer); // Simulate terminal echo.
        return answer;
      },
    });
    require("./tools/setup-backup-admin.cjs");
  `;
  function setupBackup(password, ...args) {
    const processResult = spawnSync(
      process.execPath,
      ["-e", testTerminal, "--", ...args],
      {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, COCKPIT_SETUP_TEST_PASSWORD: password },
        encoding: "utf8",
      },
    );
    assert.ok(!processResult.stdout.includes(password));
    assert.ok(!processResult.stderr.includes(password));
    return processResult.status;
  }
  const emergencyPassword = "ExampleEmergencyPassword2026!";
  assert.equal(setupBackup(emergencyPassword), 0);
  assert.equal(setupBackup(emergencyPassword), 1);
  const recovery = store.read().data.users.find((u) => u.backupAdmin);
  assert.ok(recovery);
  const backup = (await login("BA", emergencyPassword)).value.token;
  assert.equal((await call("mail", "GET", undefined, backup)).status, 200);
  assert.equal((await call("audit", "GET", undefined, backup)).status, 200);
  assert.equal(
    (await call("accounts/" + recovery.id, "PUT", {}, administrator)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "accounts/" + recovery.id + "/invitation",
        "POST",
        {},
        administrator,
      )
    ).status,
    403,
  );
  snapshot = (await state(administrator)).value;
  snapshot.data.users = snapshot.data.users.filter((u) => u.id !== recovery.id);
  assert.equal(
    (await call("state", "PUT", snapshot, administrator)).status,
    403,
  );
  assert.ok(
    store.read().data.users.some((u) => u.id === recovery.id && u.active),
  );
  const rotatedPassword = "ExampleRotatedEmergencyPassword2026!";
  assert.equal(setupBackup(rotatedPassword, "--rotate"), 0);
  assert.equal((await state(backup)).status, 401);
  assert.equal((await login("BA", emergencyPassword)).status, 401);
  const rotated = await login("BA", rotatedPassword);
  assert.equal(rotated.value.accountId, recovery.id);
  console.log(
    "Passed: admin-only invitations, SMTP failure and retry, forced password change, independent roles, deactivation and backup account protection.",
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => server.close());
