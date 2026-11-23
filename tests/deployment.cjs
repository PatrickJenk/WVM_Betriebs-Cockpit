// All repositories, refs and SQLite files in this test are disposable local fixtures.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-deploy-")),
  project = path.resolve(__dirname, ".."),
  work = path.join(root, "source"),
  bare = path.join(root, "remote.git"),
  prod = path.join(root, "existing"),
  data = path.join(root, "private-data"),
  backups = path.join(root, "private-backups");
const bash =
  process.env.BASH_BIN ||
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
function run(cmd, args, cwd = work, env = {}) {
  const isolated = { ...process.env };
  for (const key of Object.keys(isolated))
    if (key.startsWith("COCKPIT_") || key === "NODE_ENV") delete isolated[key];
  return spawnSync(cmd, args, {
    cwd,
    env: { ...isolated, ...env },
    encoding: "utf8",
    timeout: 30000,
  });
}
function git(args, cwd = work) {
  const r = run("git", args, cwd);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function success(r) {
  assert.equal(r.status, 0, r.stdout + "\n" + r.stderr);
  return r;
}
function fingerprint() {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(data, "cockpit.sqlite")))
    .digest("hex");
}
(async () => {
  for (const dir of [work, prod, data, backups, path.join(data, "files")])
    fs.mkdirSync(dir, { recursive: true });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Local Deployment Test"]);
  git(["config", "user.email", "fixture@example.test"]);
  for (const file of [
    "deploy.sh",
    "tools/deployment-check.cjs",
    "tools/check-syntax.cjs",
    "tools/migrate.cjs",
  ]) {
    fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    fs.copyFileSync(path.join(project, file), path.join(work, file));
  }
  for (const dir of ["src", "public", "tests"])
    fs.mkdirSync(path.join(work, dir));
  fs.writeFileSync(
    path.join(work, "server.cjs"),
    "// fixture; never started\n",
  );
  fs.writeFileSync(path.join(work, "server-api.cjs"), "// fixture\n");
  fs.writeFileSync(path.join(work, "README.md"), "before\n");
  fs.writeFileSync(
    path.join(work, ".gitignore"),
    ".env.production\nnode_modules/\n",
  );
  fs.writeFileSync(
    path.join(work, "package.json"),
    JSON.stringify({
      name: "deployment-fixture",
      version: "1.0.0",
      private: true,
    }),
  );
  fs.writeFileSync(
    path.join(work, "package-lock.json"),
    JSON.stringify({
      name: "deployment-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "deployment-fixture", version: "1.0.0" } },
    }),
  );
  git(["add", "."]);
  git(["commit", "-m", "before"]);
  const before = git(["rev-parse", "HEAD"]);
  success(run("git", ["init", "--bare", bare], root));
  git(["--git-dir", bare, "fetch", work, "main:refs/heads/main"], root);
  fs.writeFileSync(path.join(work, "README.md"), "after\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "after"]);
  const after = git(["rev-parse", "HEAD"]);
  git(["--git-dir", bare, "fetch", work, "main:refs/heads/main"], root);
  git(["init"], prod);
  git(
    [
      "remote",
      "add",
      "origin",
      "https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git",
    ],
    prod,
  );
  // Rewrite only inside this fixture: no request to GitHub is made.
  git(
    [
      "config",
      `url.${bare.replaceAll("\\", "/")}.insteadOf`,
      "https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git",
    ],
    prod,
  );
  git(["fetch", "origin", "main"], prod);
  git(["switch", "-c", "main", before], prod);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(data, "cockpit.sqlite"));
  db.exec("CREATE TABLE state(id INTEGER PRIMARY KEY,json TEXT NOT NULL)");
  db.prepare("INSERT INTO state VALUES(1,?)").run(
    JSON.stringify({
      revision: 1,
      data: {
        users: [{ id: "main", role: "Admin", active: true }],
        entries: [],
      },
    }),
  );
  db.close();
  fs.writeFileSync(path.join(data, "secret.key"), crypto.randomBytes(32));
  fs.writeFileSync(path.join(data, "files", "preserved"), "upload preserved");
  const config = `COCKPIT_ORIGIN=https://fixture.example.test\nCOCKPIT_DATA_DIR=${data.replaceAll("\\", "/")}\nCOCKPIT_MAIL_DISABLED=1\n`;
  fs.writeFileSync(path.join(prod, ".env.production"), config);
  const initial = fingerprint();
  success(run(bash, ["-n", "deploy.sh"], prod));
  success(run(bash, ["deploy.sh", "--check"], prod));
  assert.equal(git(["rev-parse", "HEAD"], prod), before);
  assert.equal(fingerprint(), initial);
  const noConfirmation = run(process.execPath, ["tools/migrate.cjs"], prod);
  assert.notEqual(noConfirmation.status, 0);
  assert.equal(
    fingerprint(),
    initial,
    "no flag means no migration or DB mutation",
  );
  assert.notEqual(
    run(bash, ["deploy.sh", "--check", "--branch", "other"], prod).status,
    0,
  );
  git(
    ["remote", "set-url", "origin", "https://github.com/unrelated/other.git"],
    prod,
  );
  assert.notEqual(run(bash, ["deploy.sh", "--check"], prod).status, 0);
  git(
    [
      "remote",
      "set-url",
      "origin",
      "https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git",
    ],
    prod,
  );
  fs.writeFileSync(
    path.join(prod, ".env.production"),
    config.replace(
      "https://fixture.example.test",
      "http://fixture.example.test",
    ),
  );
  assert.notEqual(run(bash, ["deploy.sh", "--check"], prod).status, 0);
  fs.writeFileSync(path.join(prod, ".env.production"), config);
  const originalReadme = fs.readFileSync(path.join(prod, "README.md"));
  fs.writeFileSync(path.join(prod, "README.md"), "unsaved\n");
  assert.notEqual(run(bash, ["deploy.sh", "--check"], prod).status, 0);
  fs.writeFileSync(path.join(prod, "README.md"), originalReadme);
  assert.notEqual(
    run(bash, ["deploy.sh", "--apply", "--backup-dir", backups], prod).status,
    0,
    "explicit stop confirmation required",
  );
  assert.notEqual(
    run(bash, ["deploy.sh", "--apply", "--backup-dir", prod], prod, {
      COCKPIT_APP_STOPPED: "1",
    }).status,
    0,
    "backup cannot be inside project",
  );
  success(
    run(bash, ["deploy.sh", "--apply", "--backup-dir", backups], prod, {
      COCKPIT_APP_STOPPED: "1",
    }),
  );
  assert.equal(git(["rev-parse", "HEAD"], prod), after);
  assert.equal(fingerprint(), initial, "manual deploy never migrates DB");
  assert.equal(
    fs.readFileSync(path.join(prod, ".env.production"), "utf8"),
    config,
  );
  const backup = path.join(backups, fs.readdirSync(backups)[0]);
  for (const name of [
    "code.tar.gz",
    "data.tar.gz",
    "env.production.private",
    "release.txt",
  ])
    assert.ok(fs.existsSync(path.join(backup, name)), name);
  assert.match(
    fs.readFileSync(path.join(backup, "release.txt"), "utf8"),
    new RegExp(before),
  );
  assert.equal(
    fs.readFileSync(path.join(data, "files", "preserved"), "utf8"),
    "upload preserved",
  );
  // Separately approved migration against an older schema, never a deployment side effect.
  const { seed } = await import("../src/data/seed.js");
  const legacy = seed();
  legacy.users = [
    {
      id: "admin",
      name: "Preserved Admin",
      initials: "PA",
      role: "Admin",
      active: true,
      passwordHash: "unchanged-fixture-hash",
    },
  ];
  legacy.entries = [];
  legacy.documents = [];
  const oldDb = new DatabaseSync(path.join(data, "cockpit.sqlite"));
  oldDb
    .prepare("UPDATE state SET json=?")
    .run(JSON.stringify({ revision: 5, data: legacy }));
  oldDb.exec(
    "CREATE TABLE contact_images(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL); CREATE TABLE contacts(id TEXT PRIMARY KEY,json TEXT NOT NULL,version INTEGER NOT NULL)",
  );
  oldDb
    .prepare("INSERT INTO contact_images VALUES(?,?,?)")
    .run("legacy", "image/png", Buffer.from("preserved bytes"));
  oldDb.prepare("INSERT INTO contacts VALUES(?,?,?)").run(
    "contact",
    JSON.stringify({
      id: "contact",
      name: "Existing Contact",
      organization: "WVM",
      imageId: "legacy",
    }),
    1,
  );
  oldDb.close();
  for (const file of [
    "server-security.cjs",
    "server-collaboration.cjs",
    "server-mail-message.cjs",
    "src/auth/roles.js",
    "src/data/seed.js",
    "src/services/entry-status.js",
  ]) {
    fs.mkdirSync(path.dirname(path.join(prod, file)), { recursive: true });
    fs.copyFileSync(path.join(project, file), path.join(prod, file));
  }
  const beforeMigration = fingerprint();
  assert.notEqual(run(process.execPath, ["tools/migrate.cjs"], prod).status, 0);
  assert.equal(fingerprint(), beforeMigration);
  success(
    run(
      process.execPath,
      ["tools/migrate.cjs", "--confirm-production-migrations"],
      prod,
    ),
  );
  const migrated = new DatabaseSync(path.join(data, "cockpit.sqlite"), {
    readOnly: true,
  });
  const state = JSON.parse(
    migrated.prepare("SELECT json FROM state").get().json,
  );
  assert.equal(state.data.users[0].passwordHash, "unchanged-fixture-hash");
  assert.equal(state.data.users[0].systemRole, "main");
  assert.equal(
    migrated
      .prepare("SELECT json FROM contacts")
      .get()
      .json.includes("Existing Contact"),
    true,
  );
  assert.equal(
    Buffer.from(
      migrated.prepare("SELECT bytes FROM contact_images").get().bytes,
    ).toString(),
    "preserved bytes",
  );
  assert.ok(
    migrated
      .prepare("PRAGMA table_info(contact_images)")
      .all()
      .some((c) => c.name === "created"),
  );
  migrated.close();
  const once = fingerprint();
  success(
    run(
      process.execPath,
      ["tools/migrate.cjs", "--confirm-production-migrations"],
      prod,
    ),
  );
  assert.equal(
    fingerprint(),
    once,
    "repeated approved migration preserves existing data",
  );
  console.log(
    "Passed: manual Bash precheck/update with local-only Git remote, clean/branch/stop/path guards, cold backups, preserved configuration/data and no unapproved migration.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
