// Managed Infomaniak entry point. npm start inside the release calls this file.
// Local npm start keeps the existing development server and storage unchanged.
require("./tools/hosting-env.cjs");

const security = require("./server-security.cjs");
const fs = require("node:fs");
fs.chmodSync(security.root, 0o700);
fs.chmodSync(security.root + "/files", 0o700);
fs.chmodSync(security.root + "/secret.key", 0o600);
const active =
  security.read()?.data.users.filter((u) => u.active !== false) || [];
if (!active.length)
  throw Error(
    "Betriebsdaten fehlen. Das vollständige Erstinstallationspaket hochladen.",
  );
if (active.some((u) => u.hostingPasswordChangeRequired)) {
  require("./server-hosting-setup.cjs").start(security, () =>
    require("./server.cjs"),
  );
} else {
  require("./server.cjs");
}
