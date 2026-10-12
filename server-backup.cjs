const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const store = require("./server-security.cjs");
function backup(label = "manual") {
  if (!/^(manual|auto-\d{4}-\d{2}-\d{2})$/.test(label))
    throw Error("Ungültiger Sicherungsname.");
  const base = path.join(store.root, "backups");
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const target = path.join(
    base,
    label === "manual" ? "manual-" + Date.now() : label,
  );
  if (fs.existsSync(path.join(target, "manifest.json"))) return target;
  if (fs.existsSync(target))
    throw Error("Unvollständige Sicherung vorhanden: " + target);
  return store.locked(() => {
    const state = store.read();
    if (!state) return null;
    fs.mkdirSync(path.join(target, "files"), { recursive: true, mode: 0o700 });
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      revision: state.revision,
      files: {},
    };
    const write = (name, bytes) => {
      fs.writeFileSync(path.join(target, name), bytes, { mode: 0o600 });
      manifest.files[name] = crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex");
    };
    write("state.json", JSON.stringify(state));
    write(
      "uploads.json",
      JSON.stringify(store.db.prepare("SELECT * FROM uploads").all()),
    );
    write(
      "audit.json",
      JSON.stringify(store.db.prepare("SELECT * FROM audit").all()),
    );
    write("secret.key", fs.readFileSync(path.join(store.root, "secret.key")));
    const references = new Set(
      [
        ...state.data.documents,
        ...state.data.entries.flatMap((e) => e.attachments || []),
      ].map((x) => x.id),
    );
    for (const id of references) {
      const file = store.filePath(id);
      if (!fs.existsSync(file)) continue;
      // Dateien werden von der Anwendung niemals überschrieben. Hardlinks erhalten
      // gelöschte Dateien in der Sicherung ohne täglich ihren Platz zu vervielfachen.
      const dest = path.join(target, "files", id);
      try {
        fs.linkSync(file, dest);
      } catch {
        fs.copyFileSync(file, dest);
      }
      manifest.files["files/" + id] = crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex");
    }
    fs.writeFileSync(
      path.join(target, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 },
    );
    store.audit(null, "backup.created", {
      name: path.basename(target),
      revision: state.revision,
    });
    return target;
  });
}
function maintenance() {
  const state = store.read();
  if (!state) return;
  store.locked(() => {
    const current = store.read();
    const refs = new Set(
      [
        ...current.data.documents,
        ...current.data.entries.flatMap((e) => e.attachments || []),
      ].map((x) => x.id),
    );
    for (const row of store.db
      .prepare("SELECT id FROM uploads WHERE created<?")
      .all(Date.now() - 48 * 3600000))
      if (!refs.has(row.id)) store.removeFile(row.id);
    store.db
      .prepare("DELETE FROM audit WHERE at<?")
      .run(new Date(Date.now() - 180 * 86400000).toISOString());
    for (const name of fs.readdirSync(path.join(store.root, "files")))
      if (/^[a-zA-Z0-9-]{1,100}\.upload-[a-f0-9]{16}$/.test(name)) {
        const file = path.join(store.root, "files", name);
        if (
          fs.lstatSync(file).isFile() &&
          fs.statSync(file).mtimeMs < Date.now() - 48 * 3600000
        )
          fs.unlinkSync(file);
      }
  });
  const target = backup("auto-" + new Date().toISOString().slice(0, 10));
  const base = path.resolve(store.root, "backups");
  const old = fs
    .readdirSync(base)
    .filter((name) => /^auto-\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .slice(0, -7);
  for (const name of old) {
    const absolute = path.resolve(base, name);
    if (
      absolute.startsWith(base + path.sep) &&
      fs.existsSync(path.join(absolute, "manifest.json"))
    )
      fs.rmSync(absolute, { recursive: true });
  }
  return target;
}
module.exports = { backup, maintenance };
