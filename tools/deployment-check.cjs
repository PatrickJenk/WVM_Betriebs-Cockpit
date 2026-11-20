// Read-only checks. Do not import server modules here: their startup migrates SQLite.
const fs = require("node:fs"),
  path = require("node:path"),
  { parseEnv } = require("node:util"),
  { execFileSync } = require("node:child_process");
const project = path.resolve(__dirname, "..");
const expectedRemote =
  "https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git";
function loadEnvironment() {
  const file = path.join(project, ".env.production");
  if (fs.existsSync(file))
    for (const [key, value] of Object.entries(
      parseEnv(fs.readFileSync(file, "utf8")),
    ))
      if (process.env[key] === undefined) process.env[key] = value;
}
function git(...args) {
  return execFileSync("git", ["-C", project, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function check({ branch = "main", repository = true } = {}) {
  loadEnvironment();
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 16))
    throw Error("Node.js mindestens 22.16 erforderlich.");
  if (repository) {
    if (
      fs.realpathSync(git("rev-parse", "--show-toplevel")) !==
      fs.realpathSync(project)
    )
      throw Error("Falscher Projektordner.");
    if (git("branch", "--show-current") !== branch)
      throw Error("Falscher Branch. Erwartet: " + branch);
    if (git("status", "--porcelain"))
      throw Error(
        "Arbeitsverzeichnis ist nicht sauber. Änderungen zuerst sichern.",
      );
    const remote = git("config", "--get", "remote.origin.url");
    if (
      ![
        expectedRemote,
        "git@github.com:PatrickJenk/WVM_Betriebs-Cockpit.git",
        "ssh://git@github.com/PatrickJenk/WVM_Betriebs-Cockpit.git",
      ].includes(remote)
    )
      throw Error("origin zeigt nicht auf das geprüfte GitHub-Repository.");
  }
  if (!process.env.COCKPIT_ORIGIN)
    throw Error(
      "COCKPIT_ORIGIN explizit in .env.production oder im Prozess setzen.",
    );
  const origin = new URL(process.env.COCKPIT_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== process.env.COCKPIT_ORIGIN
  )
    throw Error("COCKPIT_ORIGIN muss eine HTTPS-Origin ohne Pfad sein.");
  const raw = process.env.COCKPIT_DATA_DIR;
  if (!raw || !path.isAbsolute(raw))
    throw Error("COCKPIT_DATA_DIR muss explizit und absolut sein.");
  const data = fs.realpathSync(raw);
  for (const folder of ["public", "src"]) {
    const exposed = path.join(project, folder);
    if (data === exposed || data.startsWith(exposed + path.sep))
      throw Error("Datenverzeichnis liegt im öffentlichen Bereich.");
  }
  const database = path.join(data, "cockpit.sqlite"),
    key = path.join(data, "secret.key");
  for (const item of [database, key, path.join(data, "files")])
    if (fs.lstatSync(item).isSymbolicLink())
      throw Error(
        "Interne Daten-Symlinks vor kalter Sicherung separat klären.",
      );
  fs.accessSync(data, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(database, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(
    path.join(data, "files"),
    fs.constants.R_OK | fs.constants.W_OK,
  );
  if (!fs.statSync(key).isFile() || fs.readFileSync(key).length !== 32)
    throw Error("Privater 32-Byte-Schlüssel fehlt oder ist ungültig.");
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const row = db.prepare("SELECT json FROM state WHERE id=1").get();
    if (!row)
      throw Error("Betriebsdaten fehlen. Keine neue Datenbank initialisieren.");
    const state = JSON.parse(row.json);
    if (
      !state.data?.users?.some(
        (u) =>
          u.active !== false && ["Admin", "Administrator"].includes(u.role),
      )
    )
      throw Error("Kein aktiver Administrator vorhanden.");
    const result = db.prepare("PRAGMA quick_check").get();
    if (Object.values(result)[0] !== "ok")
      throw Error("SQLite quick_check fehlgeschlagen.");
  } finally {
    db.close();
  }
  return { data, origin: origin.origin };
}
module.exports = { check, loadEnvironment, project };
if (require.main === module) {
  try {
    const index = process.argv.indexOf("--branch"),
      branch = index >= 0 ? process.argv[index + 1] : "main";
    if (!branch) throw Error("Branch fehlt.");
    check({ branch });
    console.log(
      "Vorprüfung bestanden: Repository, Branch, explizite Konfiguration, Daten und Schlüssel. Keine Migration ausgeführt.",
    );
  } catch (e) {
    console.error("Vorprüfung abgebrochen: " + (e.code || e.message));
    process.exitCode = 1;
  }
}
