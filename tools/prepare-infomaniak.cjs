// Explicit one-time account reset. Historical labels and all documents are retained.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

function prepare(directory, options = {}) {
  const root = path.resolve(directory);
  const db = new DatabaseSync(path.join(root, "cockpit.sqlite"));
  const backup = path.join(root, "before-infomaniak-" + Date.now());
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  db.exec(
    "VACUUM INTO '" +
      path.join(backup, "cockpit.sqlite").replaceAll("'", "''") +
      "'",
  );
  fs.cpSync(path.join(root, "files"), path.join(backup, "files"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(root, "secret.key"),
    path.join(backup, "secret.key"),
  );
  if (options.codeRoot) {
    const files = cp
      .execFileSync(
        "git",
        [
          "ls-files",
          "-z",
          "--",
          ".",
          ":!tmp",
          ":!output",
          ":!resources",
          ":!public/assets",
        ],
        { cwd: options.codeRoot },
      )
      .toString()
      .split("\0")
      .filter(Boolean);
    for (const file of files) {
      const target = path.join(backup, "code", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(options.codeRoot, file), target);
    }
    fs.writeFileSync(
      path.join(backup, "code-files.json"),
      JSON.stringify(files),
    );
  }
  let result;
  try {
    db.exec("BEGIN IMMEDIATE");
    const state = JSON.parse(
      db.prepare("SELECT json FROM state WHERE id=1").get().json,
    );
    const users = state.data.users;
    const admins = users.filter(
      (u) =>
        u.name === "WVM-admin" && ["Admin", "Administrator"].includes(u.role),
    );
    if (admins.length !== 1 || !admins[0].passwordHash)
      throw Error("Eindeutiges WVM-admin-Konto fehlt. Keine Konten geändert.");
    const admin = admins[0];
    const retired = users.filter((u) => u.id !== admin.id);
    const profile = (record) =>
      users.find(
        (u) =>
          u.id === record.id ||
          u.id === record.byId ||
          u.initials === record.by,
      );
    // Fill historical labels before removing login identities, without rewriting text.
    for (const entry of state.data.entries) {
      for (const prefix of ["created", "updated"]) {
        const u = users.find(
          (u) =>
            u.id === entry[prefix + "ById"] ||
            u.initials === entry[prefix + "By"],
        );
        if (u) {
          entry[prefix + "ByName"] ??= u.name;
          entry[prefix + "Company"] ??= u.company;
        }
      }
      for (const record of [
        ...(entry.history || []),
        ...(entry.participants || []),
        ...(entry.mentions || []),
      ]) {
        const u = profile(record);
        if (u) {
          record.name ??= u.name;
          record.company ??= u.company;
        }
      }
    }
    for (const doc of state.data.documents) {
      const u = users.find(
        (u) => u.id === doc.uploadedById || u.initials === doc.uploadedBy,
      );
      if (u) {
        doc.uploadedByName ??= u.name;
        doc.uploadedByRole ??= u.role;
        doc.uploadedById ??= u.id;
      }
    }
    const historical = new Map(
      (state.data.retiredUsers || []).map((u) => [u.id, u]),
    );
    for (const u of retired)
      historical.set(u.id, {
        id: u.id,
        name: u.name,
        initials: u.initials,
        role: u.role,
        company: u.company,
        retiredAt: new Date().toISOString(),
      });
    state.data.retiredUsers = [...historical.values()];
    admin.active = true;
    admin.hostingPasswordChangeRequired = true;
    state.data.users = [admin];
    state.revision++;
    db.prepare("UPDATE state SET json=? WHERE id=1").run(JSON.stringify(state));
    db.exec(
      "DELETE FROM sessions; DELETE FROM attempts; DELETE FROM upload_jobs;",
    );
    db.prepare(
      "INSERT INTO audit(at,actor,action,details) VALUES(?,?,?,?)",
    ).run(
      new Date().toISOString(),
      admin.id,
      "hosting.accounts.prepared",
      JSON.stringify({
        removedLogins: retired.length,
        adminPasswordUnchanged: true,
      }),
    );
    db.exec("COMMIT");
    result = {
      backup,
      retired: retired.length,
      documents: state.data.documents.length,
      entries: state.data.entries.length,
      adminHashDigest: crypto
        .createHash("sha256")
        .update(admin.passwordHash)
        .digest("hex"),
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    db.close();
  }
  return result;
}
module.exports = { prepare };
if (require.main === module) {
  const result = prepare(
    process.env.COCKPIT_DATA_DIR || path.join(__dirname, "../storage"),
    { codeRoot: path.resolve(__dirname, "..") },
  );
  console.log(
    "Gesichert: " +
      result.backup +
      "\nNur WVM-admin bleibt als Zugang; bisheriges Passwort unverändert. " +
      result.retired +
      " Zugänge archiviert. " +
      result.documents +
      " Dokumente und " +
      result.entries +
      " Einträge erhalten.",
  );
}
