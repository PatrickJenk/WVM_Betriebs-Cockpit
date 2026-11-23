// Einmaliger CLI-Lauf für einen vom Browser unabhängigen Hosting-Cronjob.
const { worker } = require("../server-collaboration.cjs");
worker().catch(() => {
  console.error(
    "Mailprüfung fehlgeschlagen. Datenbank, Konfiguration und Serverprotokoll prüfen.",
  );
  process.exitCode = 1;
});
