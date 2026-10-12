const fs = require("node:fs"),
  path = require("node:path");
const store = require("../server-security.cjs");
if (store.production)
  throw Error("Muster zurücksetzen ist nur im Entwicklungsmodus erlaubt.");
(async () => {
  const file = path.join(store.root, "state.json");
  require("../server-backup.cjs").backup();
  const state = store.read();
  const previous = state.data.entries.find((e) => e.id === "seed-0");
  if (!previous) throw Error("Muster 1 nicht vorhanden.");
  const folder = path.join(path.dirname(file), "backups");
  fs.mkdirSync(folder, { recursive: true });
  const { demoLogbook } = await import("../src/data/seed.js");
  const original = demoLogbook(state.data.users)[0];
  original.createdAt = previous.createdAt;
  original.occurredAt = previous.occurredAt;
  original.updatedAt = previous.createdAt;
  original.completedAt = previous.createdAt;
  store.locked(() => {
    const latest = store.read();
    latest.data.entries = latest.data.entries.map((e) =>
      e.id === original.id ? original : e,
    );
    latest.revision++;
    store.persist(latest);
  });
  console.log("Muster 1 zurueckgesetzt; andere Eintraege erhalten.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
