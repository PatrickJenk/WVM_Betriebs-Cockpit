const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createInterface } = require("node:readline/promises");
const { Writable } = require("node:stream");

async function setup() {
  const args = process.argv.slice(2);
  const rotate = args.length === 1 && args[0] === "--rotate";
  if (args.length && !rotate) throw Error("Aufruf mit optionalem --rotate.");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw Error("Der Notfall-Setup benötigt ein interaktives Terminal.");
  const directory = process.env.COCKPIT_DATA_DIR;
  if (
    !directory ||
    !path.isAbsolute(directory) ||
    !fs.existsSync(path.join(directory, "cockpit.sqlite"))
  )
    throw Error(
      "COCKPIT_DATA_DIR muss auf den absoluten Pfad einer bestehenden Cockpit-Datenbank zeigen.",
    );

  // This operator command uses the existing database and password hashing.
  const store = require("../server-security.cjs");
  const existing = store.read()?.data.users.find((u) => u.backupAdmin);
  if (!!existing !== rotate)
    throw Error(
      existing
        ? "Backup-Admin vorhanden. Für eine Rotation --rotate verwenden."
        : "Backup-Admin zuerst ohne --rotate anlegen.",
    );
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output,
    terminal: true,
    historySize: 0,
  });
  input.on("SIGINT", () => input.close());
  async function secret(prompt) {
    process.stdout.write(prompt);
    hidden = true;
    try {
      return await input.question("");
    } finally {
      hidden = false;
      process.stdout.write("\n");
    }
  }
  try {
    const initials =
      existing?.initials ||
      (await input.question("Kürzel für den Backup-Admin: "))
        .trim()
        .normalize("NFC")
        .toUpperCase();
    if (!/^[\p{L}\p{N}]{1,5}$/u.test(initials))
      throw Error("Kürzel mit 1 bis 5 Buchstaben oder Ziffern erforderlich.");
    const password = await secret("Neues Notfallpasswort: ");
    store.passwordPolicy(password);
    if (password.length < 20)
      throw Error("Für den Backup-Admin mindestens 20 Zeichen verwenden.");
    if (password !== (await secret("Notfallpasswort wiederholen: ")))
      throw Error("Die Passwörter stimmen nicht überein.");
    const passwordHash = store.hashPassword(password);
    store.locked(() => {
      const state = store.read();
      if (!state) throw Error("Cockpit-Datenbank ist nicht initialisiert.");
      const { users } = state.data;
      const backup = users.find((u) => u.backupAdmin);
      if (!!backup !== rotate || (backup && backup.id !== existing.id))
        throw Error("Backup-Admin wurde zwischenzeitlich geändert.");
      if (
        users.some(
          (u) =>
            u.id !== backup?.id &&
            (u.initials.normalize("NFC").toUpperCase() === initials ||
              (!u.initialsLogin &&
                u.name.trim().normalize("NFC").toUpperCase() === initials)),
        )
      )
        throw Error("Kürzel bereits als Benutzername vergeben.");
      const account = backup || {
        id: crypto.randomUUID(),
        name: "Backup-Administrator",
        initials,
        initialsLogin: true,
        backupAdmin: true,
        company: "WVM",
        role: "Admin",
        leadership: false,
        notificationsEnabled: false,
        active: true,
      };
      if (!backup) users.push(account);
      Object.assign(account, {
        passwordHash,
        passwordPolicyMinimum: 12,
        mustChangePassword: false,
      });
      state.revision++;
      store.revoke(account.id);
      store.persist(state);
      store.audit(
        null,
        rotate ? "account.backup.rotated" : "account.backup.created",
        { userId: account.id },
      );
    });
    console.log(
      "Backup-Admin eingerichtet. Zugangsdaten im Notfall-Tresor hinterlegen.",
    );
  } finally {
    input.close();
  }
}
setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
