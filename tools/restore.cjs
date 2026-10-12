// Wiederherstellung ausschliesslich in ein leeres, ausdrücklich angegebenes Verzeichnis.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
try {
  const source = path.resolve(process.argv[2] || ""),
    target = process.env.COCKPIT_DATA_DIR;
  if (!process.argv[2] || !target || !path.isAbsolute(target))
    throw Error(
      "Aufruf: COCKPIT_DATA_DIR=<leeres absolutes Verzeichnis> node tools/restore.cjs <Sicherung>",
    );
  if (fs.existsSync(target) && fs.readdirSync(target).length)
    throw Error(
      "Ziel muss leer sein. Bestehende Daten werden nicht überschrieben.",
    );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(source, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1) throw Error("Unbekanntes Sicherungsformat.");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      !/^(state\.json|uploads\.json|audit\.json|secret\.key|files\/[a-zA-Z0-9-]{1,100})$/.test(
        name,
      )
    )
      throw Error("Ungültiger Sicherungspfad.");
    if (
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(source, name)))
        .digest("hex") !== hash
    )
      throw Error("Sicherung beschädigt: " + name);
  }
  for (const name of ["state.json", "uploads.json", "audit.json", "secret.key"])
    if (!manifest.files[name]) throw Error("Sicherung unvollständig.");
  fs.mkdirSync(path.join(target, "files"), { recursive: true, mode: 0o700 });
  for (const name of Object.keys(manifest.files))
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  const store = require("../server-security.cjs");
  store.locked(() => {
    for (const row of JSON.parse(
      fs.readFileSync(path.join(target, "uploads.json"), "utf8"),
    ))
      store.db
        .prepare("INSERT INTO uploads VALUES(?,?,?,?,?)")
        .run(row.id, row.owner, row.size, row.mime, row.created);
    for (const row of JSON.parse(
      fs.readFileSync(path.join(target, "audit.json"), "utf8"),
    ))
      store.db
        .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
        .run(row.id, row.at, row.actor, row.action, row.details);
    store.audit(null, "backup.restored", { revision: manifest.revision });
  });
  console.log("Wiederhergestellt. Alle Benutzer müssen sich neu anmelden.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
