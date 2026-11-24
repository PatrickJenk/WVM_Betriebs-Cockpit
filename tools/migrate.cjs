// Explicit operator action. Argument is checked before loading any writing module.
if (!process.argv.includes("--confirm-production-migrations")) {
  console.error(
    "Keine Migration ausgeführt. Nach Sicherung und Prüfung mit --confirm-production-migrations separat freigeben.",
  );
  process.exitCode = 1;
} else {
  (async () => {
    const { check } = require("./deployment-check.cjs");
    check({ repository: false });
    process.env.NODE_ENV = "production";
    const store = require("../server-security.cjs");
    const collaboration = require("../server-collaboration.cjs");
    collaboration.migrate();
    const defaults = await import("../src/data/seed.js");
    store.locked(() => {
      const state = store.read();
      let changed = false;
      if (state.data.stationVersion !== 1) {
        defaults.initializeStations(state.data);
        changed = true;
      }
      if (
        state.data.documentTemplateVersion !== defaults.documentTemplateVersion
      ) {
        defaults.initializeDocumentFolders(state.data);
        changed = true;
      }
      if (!state.data.structure) {
        state.data.structure = {
          networks: structuredClone(defaults.networks),
          sites: structuredClone(defaults.sites),
          groups: [],
          sections: [],
        };
        changed = true;
      }
      if (changed) {
        state.revision++;
        store.persist(state);
      }
    });
    console.log(
      "Freigegebene Migrationen abgeschlossen. Konten und Betriebsdaten bleiben erhalten.",
    );
  })().catch(() => {
    console.error(
      "Migration fehlgeschlagen. Anwendung gestoppt lassen und SQLite, Konfiguration und Sicherung prüfen.",
    );
    process.exitCode = 1;
  });
}
