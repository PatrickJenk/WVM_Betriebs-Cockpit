// Isolated demo: never reads the existing data directory or sends SMTP mail.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const port = Number(process.env.COCKPIT_TEST_PORT || 4183);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Ungültiger COCKPIT_TEST_PORT.");
process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";
process.env.PORT = String(port);
process.env.COCKPIT_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "cockpit-local-test-"),
);
process.env.COCKPIT_MAIL_DISABLED = "1";
process.env.COCKPIT_SCAN_MODE = "disabled";
process.env.COCKPIT_LOCAL_TEST_ACCOUNT = "1";
console.log("Isolierter Test: " + process.env.COCKPIT_DATA_DIR);
console.log(
  "SMTP vollständig gesperrt. Lokale Betriebsdaten werden nicht verwendet.",
);
console.log(`Browser: http://localhost:${port}`);
require("../server.cjs");
