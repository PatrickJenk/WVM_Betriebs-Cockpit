const store = require("./server-security.cjs");

// Archived PDFs may still need the original logo when regenerated.
store.db.exec(`
  CREATE TABLE IF NOT EXISTS control_logos (
    site_id TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL,
    PRIMARY KEY (site_id, id)
  );
`);

function readLogo(siteId, id) {
  if (!id) return null;
  const saved = store.db
    .prepare("SELECT bytes FROM control_logos WHERE site_id=? AND id=?")
    .get(siteId, id);
  return saved ? { bytes: Buffer.from(saved.bytes) } : null;
}

module.exports = { readLogo };
