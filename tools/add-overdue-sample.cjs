const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const { demoLogbook } = await import("../src/data/seed.js");
  const root = path.resolve(__dirname, "../storage"),
    file = path.join(root, "state.json"),
    lock = path.join(root, "state.lock");
  const fd = fs.openSync(lock, "wx");
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8")),
      folder = path.join(root, "backups");
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(
      file,
      path.join(folder, "before-overdue-sample-" + Date.now() + ".json"),
    );
    const sample = demoLogbook(state.data.users).find((e) => e.id === "seed-5");
    state.data.entries = state.data.entries.filter((e) => e.id !== sample.id);
    state.data.entries.push(sample);
    state.revision++;
    fs.writeFileSync(file + ".sample.tmp", JSON.stringify(state));
    fs.renameSync(file + ".sample.tmp", file);
    console.log(
      "Muster 6 hinzugefuegt: 31 Tage offen, ohne Faelligkeitsdatum.",
    );
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
