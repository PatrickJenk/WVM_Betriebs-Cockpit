// Creates a PRIVATE first-install package and a code-only update package.
// Never archives the full repository, previous backups, logs, or local dependencies.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { zip } = require("./zip.cjs");
const project = path.resolve(__dirname, "..");

function createPackage({
  source = path.join(project, "storage"),
  output = path.join(project, "output/infomaniak", "release-" + Date.now()),
} = {}) {
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(output, ".gitignore"), "*\n");
  const stage = path.join(output, "private-stage");
  fs.mkdirSync(stage, { mode: 0o700 });
  const targetDb = path.join(stage, "cockpit.sqlite");
  const original = new DatabaseSync(path.join(source, "cockpit.sqlite"), {
    readOnly: true,
  });
  try {
    original.exec("VACUUM INTO '" + targetDb.replaceAll("'", "''") + "'");
  } finally {
    original.close();
  }
  const db = new DatabaseSync(targetDb);
  let state, setupCode;
  try {
    state = JSON.parse(
      db.prepare("SELECT json FROM state WHERE id=1").get().json,
    );
    const active = state.data.users.filter((u) => u.active !== false);
    if (
      active.length !== 1 ||
      active[0].name !== "WVM-admin" ||
      !["Admin", "Administrator"].includes(active[0].role)
    )
      throw Error(
        "Erstinstallation benötigt ausschliesslich das aktive WVM-admin-Konto.",
      );
    db.exec(
      "DELETE FROM sessions; DELETE FROM attempts; DELETE FROM upload_jobs;",
    );
    if (active[0].hostingPasswordChangeRequired) {
      setupCode = crypto.randomBytes(32).toString("base64url");
      db.exec(
        "CREATE TABLE IF NOT EXISTS hosting_setup (id INTEGER PRIMARY KEY,admin_id TEXT NOT NULL,digest TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL)",
      );
      db.prepare("INSERT OR REPLACE INTO hosting_setup VALUES(1,?,?,?,0)").run(
        active[0].id,
        crypto.createHash("sha256").update(setupCode).digest("hex"),
        Date.now() + 30 * 86400000,
      );
    } else {
      const matches = (p) => {
        const [salt, value] = active[0].passwordHash.split(":");
        return crypto.timingSafeEqual(
          crypto.scryptSync(p, salt, 32),
          Buffer.from(value, "hex"),
        );
      };
      if (
        ["9876", "ChangeMe123"].some(matches) ||
        (active[0].passwordPolicyMinimum || 0) < 12 ||
        active[0].mustChangePassword
      )
        throw Error(
          "Admin-Passwort ist noch nicht für die Produktion freigegeben.",
        );
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    db.close();
  }
  const code = [];
  const add = (name, file) => code.push({ name, file });
  function tree(relative) {
    for (const item of fs.readdirSync(path.join(project, relative), {
      withFileTypes: true,
    })) {
      const file = relative + "/" + item.name;
      if (item.isSymbolicLink())
        throw Error("Symlinks im Anwendungscode nicht erlaubt.");
      if (item.isDirectory()) tree(file);
      else if (file !== "public/dev-reload.js")
        add(file, path.join(project, file));
    }
  }
  for (const file of fs
    .readdirSync(project)
    .filter((f) => /^server(?:-[a-z-]+)?\.cjs$/.test(f)))
    add(file, path.join(project, file));
  tree("public");
  tree("src");
  for (const file of [
    "resources/Benutzerhandbuch_Waermeverbund_Cockpit.pdf",
    "tools/backup.cjs",
    "tools/restore.cjs",
    "tools/hosting-env.cjs",
    "tools/hosting-backup.cjs",
    "INFOMANIAK-START.md",
    "package-lock.json",
    ".env.example",
  ])
    add(file, path.join(project, file));
  const pkg = JSON.parse(
    fs.readFileSync(path.join(project, "package.json"), "utf8"),
  );
  pkg.scripts = {
    start: "node --env-file-if-exists=.env.production server-hosting.cjs",
    "start:production":
      "node --env-file-if-exists=.env.production server-hosting.cjs",
    backup:
      "node --env-file-if-exists=.env.production tools/hosting-backup.cjs",
  };
  code.push({
    name: "package.json",
    bytes: Buffer.from(JSON.stringify(pkg, null, 2) + "\n"),
  });
  const update = path.join(output, "Cockpit-NUR-CODE-Update.zip");
  zip(update, code);
  const entries = [
    ...code,
    { name: "hosting-data/cockpit.sqlite", file: targetDb },
    { name: "hosting-data/secret.key", file: path.join(source, "secret.key") },
  ];
  const refs = new Set(
    [
      ...state.data.documents,
      ...state.data.entries.flatMap((e) => e.attachments || []),
    ].map((d) => d.id),
  );
  for (const id of refs) {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Error("Ungültige Datei-ID.");
    const file = path.join(source, "files", id);
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink())
      throw Error("Referenzierte Datei fehlt oder ist ungültig: " + id);
    entries.push({ name: "hosting-data/files/" + id, file });
  }
  if (fs.statSync(path.join(source, "secret.key")).size !== 32)
    throw Error("Ungültiger Verschlüsselungsschlüssel.");
  const archive = path.join(output, "Cockpit-ERSTINSTALLATION-VERTRAULICH.zip");
  zip(archive, entries);
  const codeFile = path.join(output, "Einrichtung-NUR-FUER-DICH.txt");
  fs.writeFileSync(
    codeFile,
    "Infomaniak-Cockpit: persönliche Einrichtung\n\nZieladresse: https://betrieb.waermeverbund.ch\nNode.js: 24 LTS\nAusführungsordner: ./ (package.json direkt darin)\nBuild-/Installationsbefehl: npm ci --omit=dev\nStartbefehl: npm start\nPort: vom Manager; nicht fest überschreiben\n\n" +
      (setupCode
        ? "Einrichtungscode (einmalig; gültig 30 Tage):\n" +
          setupCode +
          "\n\nBeim ersten Aufruf diesen Code und dein bisheriges WVM-admin-Passwort eingeben. Dann ein neues Admin-Passwort mit mindestens 12, besser 20 Zeichen festlegen. Erst danach wird das Cockpit freigegeben.\n"
        : "Admin-Passwort wurde bereits lokal geändert. Mit dem neuen Passwort anmelden.\n") +
      "\nNur das VERTRAULICHE Erstinstallations-ZIP in deine eigene Node.js-Website hochladen. Diese Textdatei nicht hochladen oder veröffentlichen. Das ZIP enthält Betriebsdaten und Schlüssel; niemals in GitHub ablegen.\nSpätere Updates ausschliesslich mit dem NUR-CODE-ZIP. hosting-data/ bleibt erhalten.\nDatei-Uploads sind auf deinen Wunsch ohne Virenscanner erlaubt (COCKPIT_SCAN_MODE=disabled). Anmeldung, Rechte, Dateiformat- und Speicherlimits bleiben aktiv; eine automatische Malware-Prüfung entfällt.\n",
    { mode: 0o600 },
  );
  const hashes = Object.fromEntries(
    [archive, update].map((file) => [
      path.basename(file),
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    ]),
  );
  fs.writeFileSync(
    path.join(output, "SHA256.json"),
    JSON.stringify(hashes, null, 2),
  );
  return {
    output,
    archive,
    update,
    codeFile,
    documents: refs.size,
    accounts: state.data.users.length,
  };
}
module.exports = { createPackage };
if (require.main === module) {
  try {
    const result = createPackage();
    console.log(
      "Infomaniak-Paket erstellt: " +
        result.archive +
        "\nPersönliche Anleitung und Einrichtungscode: " +
        result.codeFile +
        "\n" +
        result.documents +
        " Dokumente; " +
        result.accounts +
        " Konto. Kein Passwort verändert.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
