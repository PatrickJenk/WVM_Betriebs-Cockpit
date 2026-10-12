// Einmaliger, ausdrücklich angeforderter Austausch des Logbuchs. Bestehende Daten sichern.
const fs = require("node:fs"),
  path = require("node:path");
const store = require("../server-security.cjs");
if (store.production)
  throw Error("Muster zurücksetzen ist nur im Entwicklungsmodus erlaubt.");
(async () => {
  const root = store.root,
    file = path.join(root, "state.json");
  const state = store.read();
  const backups = path.join(root, "backups");
  fs.mkdirSync(backups, { recursive: true });
  const backup = path.join(
    backups,
    "before-demo-logbook-" + Date.now() + ".json",
  );
  require("../server-backup.cjs").backup();
  const { demoLogbook } = await import("../src/data/seed.js");
  const previous = state.data.entries.length;
  state.data.entries = demoLogbook(state.data.users);
  state.data.logbookResetAt = new Date().toISOString();
  state.revision++;
  store.locked(() => {
    const latest = store.read();
    latest.data.entries = state.data.entries;
    latest.data.logbookResetAt = state.data.logbookResetAt;
    latest.revision++;
    store.persist(latest);
  });
  console.log(
    JSON.stringify({
      previousEntries: previous,
      newEntries: state.data.entries.length,
      backup,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
