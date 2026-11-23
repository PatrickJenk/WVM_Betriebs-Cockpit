const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

async function main() {
  const [confirm, dataDir, origin, ...extra] = process.argv.slice(2);
  if (confirm !== "--new-installation" || !dataDir || !origin || extra.length)
    throw Error(
      "Aufruf: npm run hosting:init -- --new-installation /absoluter/neuer/datenordner https://cockpit.example.ch",
    );

  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin)
    throw Error("Die Website-Adresse muss eine HTTPS-Origin sein.");
  if (!path.isAbsolute(dataDir))
    throw Error("Der Datenpfad muss absolut sein.");

  const resolved = path.join(
    fs.realpathSync(path.dirname(dataDir)),
    path.basename(dataDir),
  );
  const project = fs.realpathSync(path.join(__dirname, ".."));
  const relative = path.relative(project, resolved);
  if (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  )
    throw Error(
      "Der private Datenordner muss ausserhalb des Git-Projekts liegen.",
    );

  const { seed } = await import("../src/data/seed.js");
  const data = seed();
  data.entries = [];
  data.accountVersion = 2;

  process.umask(0o077);
  fs.mkdirSync(resolved, { mode: 0o700 });
  process.env.NODE_ENV = "production";
  process.env.COCKPIT_DATA_DIR = resolved;
  process.env.COCKPIT_ORIGIN = origin;

  const security = require("../server-security.cjs");
  try {
    const password = randomBytes(24).toString("base64url");
    data.users = [
      {
        id: "admin",
        name: "WVM-admin",
        initials: "ADM",
        role: "Admin",
        company: "WVM",
        active: true,
        mustChangePassword: true,
        passwordPolicyMinimum: 12,
        passwordHash: security.hashPassword(password),
      },
    ];
    fs.writeFileSync(path.join(resolved, "secret.key"), randomBytes(32), {
      flag: "wx",
      mode: 0o600,
    });
    security.locked(() => security.persist({ revision: 1, data }));
    console.log("Datenordner:", resolved);
    console.log("Benutzername: WVM-admin");
    console.log("Einmaliges Startpasswort:", password);
  } finally {
    security.db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
