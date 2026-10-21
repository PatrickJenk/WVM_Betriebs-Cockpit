const fs = require("node:fs");
const mfaEnabled = process.env.COCKPIT_MFA_ENABLED === "1";
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const production =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");
const root = path.resolve(
  process.env.COCKPIT_DATA_DIR || path.join(__dirname, "storage"),
);
if (production) {
  if (
    !process.env.COCKPIT_DATA_DIR ||
    !path.isAbsolute(process.env.COCKPIT_DATA_DIR)
  )
    throw Error("Produktion: absolutes COCKPIT_DATA_DIR erforderlich.");
  const origin = new URL(process.env.COCKPIT_ORIGIN || "http://invalid");
  if (
    origin.protocol !== "https:" ||
    origin.origin !== process.env.COCKPIT_ORIGIN
  )
    throw Error(
      "Produktion: COCKPIT_ORIGIN muss eine HTTPS-Origin ohne Pfad sein.",
    );
}
for (const exposed of ["public", "src"]) {
  const target = path.resolve(__dirname, exposed);
  if (root === target || root.startsWith(target + path.sep))
    throw Error("Datenverzeichnis darf nicht öffentlich sein.");
}
fs.mkdirSync(path.join(root, "files"), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(root, "cockpit.sqlite"));
fs.chmodSync(path.join(root, "cockpit.sqlite"), 0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL, seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, owner TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mention_reads (user_id TEXT NOT NULL, entry_id TEXT NOT NULL, PRIMARY KEY(user_id,entry_id));
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
db.exec(
  "CREATE TABLE IF NOT EXISTS upload_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, reserved INTEGER NOT NULL, expires INTEGER NOT NULL)",
);
const read = () => {
  const row = db.prepare("SELECT json FROM state WHERE id=1").get();
  return row ? JSON.parse(row.json) : null;
};
const persist = (state) =>
  db
    .prepare(
      "INSERT INTO state(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
    )
    .run(JSON.stringify(state));
function locked(action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = action();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    if (error.code?.includes("BUSY")) error.status = 409;
    throw error;
  }
}
const legacy = path.join(root, "state.json");
if (!read() && fs.existsSync(legacy))
  locked(() => {
    if (read()) return;
    const state = JSON.parse(fs.readFileSync(legacy, "utf8"));
    fs.mkdirSync(path.join(root, "backups"), { recursive: true });
    fs.copyFileSync(
      legacy,
      path.join(root, "backups", "before-sqlite-" + Date.now() + ".json"),
    );
    persist(state);
  });
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const error = (message, status = 400) =>
  Object.assign(Error(message), { status });
const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id);
function filePath(id) {
  if (!validId(id)) throw error("Ungültige Datei-ID.");
  const file = path.join(root, "files", id);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
    throw error("Ungültige Datei.", 403);
  return file;
}
function audit(actor, action, details = {}) {
  db.prepare("INSERT INTO audit(at,actor,action,details) VALUES(?,?,?,?)").run(
    new Date().toISOString(),
    actor?.id || null,
    action,
    JSON.stringify({
      ...details,
      ...(actor?.name ? { actorName: actor.name } : {}),
    }),
  );
}
function session(req, state) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("cockpit-session="));
  const token =
    cookie?.slice(16) ||
    (!production && (req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const s = db
    .prepare("SELECT * FROM sessions WHERE digest=?")
    .get(digest(token));
  if (!s || s.expires < Date.now() || s.seen < Date.now() - 3600000)
    return null;
  const user = state?.data.users.find(
    (u) =>
      u.id === s.user_id &&
      u.active !== false &&
      u.passwordHash === s.credential,
  );
  if (!user) return null;
  if (
    production &&
    ["Admin", "Administrator"].includes(user.role) &&
    s.seen < Date.now() - 900000
  )
    return null;
  if (req.method !== "GET" || req.url.split("?")[0] !== "/api/state")
    db.prepare("UPDATE sessions SET seen=? WHERE digest=?").run(
      Date.now(),
      s.digest,
    );
  req.cockpitSession = s;
  return user;
}
function tokenFor(user, res) {
  const token = crypto.randomBytes(32).toString("base64url"),
    csrf = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires<? OR seen<?").run(
    Date.now(),
    Date.now() - 3600000,
  );
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)").run(
    digest(token),
    user.id,
    user.passwordHash,
    csrf,
    Date.now() +
      (production && ["Admin", "Administrator"].includes(user.role)
        ? 28800000
        : 86400000),
    Date.now(),
  );
  res.setHeader(
    "Set-Cookie",
    "cockpit-session=" +
      token +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400" +
      (production ? "; Secure" : ""),
  );
  res.setHeader("X-CSRF-Token", csrf);
  return production ? undefined : token;
}
function revoke(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}
function logout(req, res) {
  if (req.cockpitSession)
    db.prepare("DELETE FROM sessions WHERE digest=?").run(
      req.cockpitSession.digest,
    );
  res.setHeader(
    "Set-Cookie",
    "cockpit-session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" +
      (production ? "; Secure" : ""),
  );
}
function guard(req) {
  const expected = production
    ? process.env.COCKPIT_ORIGIN
    : "http://" + req.headers.host;
  if (req.headers.origin && req.headers.origin !== expected)
    throw error("Fremde Herkunft nicht erlaubt.", 403);
  if (
    production &&
    !req.socket.encrypted &&
    !(
      process.env.COCKPIT_TRUST_PROXY === "1" &&
      req.headers["x-forwarded-proto"] === "https"
    )
  )
    throw error("HTTPS erforderlich.", 403);
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.headers["sec-fetch-site"] === "cross-site")
      throw error("Fremde Herkunft nicht erlaubt.", 403);
    if (
      req.cockpitSession &&
      req.headers["x-csrf-token"] !== req.cockpitSession.csrf &&
      !(!production && req.headers.authorization?.startsWith("Bearer "))
    )
      throw error("Sicherheitsnachweis fehlt. Bitte neu anmelden.", 403);
    if (!req.cockpitSession && !req.headers.origin && production)
      throw error("Herkunft erforderlich.", 403);
  }
}
function rate(req, name) {
  // Keine ungeprüften Forwarded-Header für IP-Sperren verwenden.
  const keys = [
    "ip:" + req.socket.remoteAddress,
    "name:" + digest(String(name).toLowerCase().slice(0, 100)),
  ];
  locked(() => {
    db.prepare("DELETE FROM attempts WHERE until<?").run(Date.now());
    for (const key of keys) {
      const row = db.prepare("SELECT * FROM attempts WHERE key=?").get(key);
      if (row && row.count >= (key.startsWith("ip:") ? 40 : 10))
        throw error(
          "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
          429,
        );
      db.prepare(
        "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      ).run(key, Date.now() + 900000);
    }
  });
}
function requireUser(user, pending = false) {
  if (!user) throw error("Bitte erneut anmelden.", 401);
  if (!pending && user.mustChangePassword)
    throw error("Bitte zuerst ein eigenes Passwort festlegen.", 403);
  if (
    !pending &&
    mfaEnabled &&
    production &&
    ["Admin", "Administrator"].includes(user.role) &&
    !user.mfaSecret
  )
    throw error("Bitte zuerst die Zwei-Faktor-Anmeldung einrichten.", 403);
}
function passwordPolicy(value, temporary = false) {
  const min = production ? 12 : 8;
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    value.length < min ||
    (!temporary &&
      ["ChangeMe123", "9876", "Password123!", "123456789012"].includes(value))
  )
    throw error(
      "Bitte ein eigenes Passwort mit mindestens " +
        min +
        " Zeichen verwenden.",
    );
}
function archived(entry, now = new Date()) {
  if (entry.status !== "Erledigt") return false;
  const date = new Date(
    entry.completedAt || entry.updatedAt || entry.createdAt,
  );
  const swiss = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
  if (!Number.isFinite(date.getTime())) return false;
  const quarter = (d) => {
    const p = swiss(d);
    return (
      Number(p.find((x) => x.type === "year").value) * 4 +
      Math.floor((Number(p.find((x) => x.type === "month").value) - 1) / 3)
    );
  };
  return quarter(date) < quarter(now);
}
function upload(id) {
  return db.prepare("SELECT * FROM uploads WHERE id=?").get(id);
}
function registerUpload(id, owner, size, mime) {
  db.prepare("INSERT INTO uploads VALUES(?,?,?,?,?)").run(
    id,
    owner,
    size,
    mime,
    Date.now(),
  );
}
function sniff(bytes) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return "image/gif";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4)
    return "application/zip";
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))
  )
    return "application/octet-stream";
  if (bytes[0] === 77 && bytes[1] === 90)
    throw error("Ausführbare Dateien sind nicht erlaubt.", 415);
  const text = bytes.toString("utf8");
  if (
    /<\s*(?:!doctype|html|svg|script|iframe|body)/i.test(text) ||
    text.includes("\0") ||
    text.includes("\uFFFD")
  )
    throw error(
      "Dateiformat nicht erlaubt. PDF, Bilder oder Office-Dokument verwenden.",
      415,
    );
  return "text/plain";
}
async function storeUpload(req, id, user) {
  const file = filePath(id),
    existing = upload(id);
  if (
    existing &&
    existing.owner !== user.id &&
    !["Admin", "Administrator"].includes(user.role)
  )
    throw error("Nur Besitzer oder Admin darf die Datei übertragen.", 403);
  if (fs.existsSync(file)) {
    req.resume();
    return;
  }
  const max = Number(process.env.COCKPIT_MAX_FILE_MB || 60) * 1024 * 1024;
  const total =
    Number(process.env.COCKPIT_TOTAL_QUOTA_MB || 102400) * 1024 * 1024;
  const quota =
    Number(process.env.COCKPIT_USER_QUOTA_MB || 10240) * 1024 * 1024;
  const reserved = req.headers["content-length"]
    ? Number(req.headers["content-length"])
    : max;
  if (!Number.isSafeInteger(reserved) || reserved <= 0 || reserved > max)
    throw error("Datei zu gross oder ungültige Dateigrösse.", 413);
  locked(() => {
    db.prepare("DELETE FROM upload_jobs WHERE expires<?").run(Date.now());
    const used = db
      .prepare(
        "SELECT coalesce(sum(size),0) total,coalesce(sum(CASE WHEN owner=? THEN size ELSE 0 END),0) own FROM uploads",
      )
      .get(user.id);
    const pending = db
      .prepare(
        "SELECT count(*) count,coalesce(sum(reserved),0) total,coalesce(sum(CASE WHEN owner=? THEN reserved ELSE 0 END),0) own,sum(CASE WHEN owner=? THEN 1 ELSE 0 END) own_count FROM upload_jobs",
      )
      .get(user.id, user.id);
    if (pending.count >= 32 || pending.own_count >= 4)
      throw error("Zu viele gleichzeitige Uploads.", 429);
    if (
      used.total + pending.total + reserved > total ||
      used.own + pending.own + reserved > quota
    )
      throw error("Speicherlimit erreicht.", 413);
    if (db.prepare("SELECT id FROM upload_jobs WHERE id=?").get(id))
      throw error("Datei wird bereits übertragen.", 409);
    db.prepare("INSERT INTO upload_jobs VALUES(?,?,?,?)").run(
      id,
      user.id,
      reserved,
      Date.now() + 180000,
    );
  });
  const temporary = file + ".upload-" + crypto.randomBytes(8).toString("hex");
  let handle;
  let size = 0,
    head = Buffer.alloc(0);
  try {
    handle = await fs.promises.open(temporary, "wx", 0o600);
    for await (const part of req) {
      size += part.length;
      if (size > max)
        throw error(
          "Datei zu gross (max. " + Math.floor(max / 1024 / 1024) + " MB).",
          413,
        );
      if (head.length < 8192)
        head = Buffer.concat([head, part]).subarray(0, 8192);
      await handle.write(part);
    }
    await handle.close();
    if (!size) throw error("Leere Datei.");
    const mime = sniff(head);
    await require("./server-scanner.cjs")(temporary, production);
    locked(() => {
      const used = db
        .prepare(
          "SELECT coalesce(sum(size),0) total, coalesce(sum(CASE WHEN owner=? THEN size ELSE 0 END),0) own FROM uploads",
        )
        .get(user.id);
      if (used.total + size > total || used.own + size > quota)
        throw error("Speicherlimit erreicht.", 413);
      if (fs.existsSync(file)) throw error("Datei-ID bereits vergeben.", 409);
      fs.renameSync(temporary, file);
      registerUpload(id, user.id, size, mime);
      audit(user, "file.upload", { id, size, mime });
    });
  } catch (e) {
    await handle?.close().catch(() => {});
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw e;
  } finally {
    db.prepare("DELETE FROM upload_jobs WHERE id=?").run(id);
  }
}
function removeFile(id) {
  const file = filePath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.prepare("DELETE FROM uploads WHERE id=?").run(id);
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(value) {
  let bits = 0,
    buffer = 0,
    out = [];
  for (const c of value) {
    buffer = (buffer << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function encrypt(value) {
  const key = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, "secret.key")))
      .digest(),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function decrypt(value) {
  const bytes = Buffer.from(value, "base64"),
    key = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, "secret.key")))
      .digest(),
    decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(0, 12),
    );
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    decipher.update(bytes.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
function totpStep(secret, code) {
  if (!/^\d{6}$/.test(String(code))) return null;
  for (let drift = -1; drift <= 1; drift++) {
    const step = Math.floor(Date.now() / 30000) + drift,
      counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const h = crypto
        .createHmac("sha1", unbase32(secret))
        .update(counter)
        .digest(),
      offset = h.at(-1) & 15,
      expected = String(
        (h.readUInt32BE(offset) & 0x7fffffff) % 1000000,
      ).padStart(6, "0");
    if (
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))
    )
      return step;
  }
  return null;
}
function totp(secret, code) {
  return totpStep(secret, code) !== null;
}
function preflight(matches) {
  if (!production) return;
  const state = read();
  if (!state)
    throw Error(
      "Produktion: zuerst bestehende Daten in COCKPIT_DATA_DIR übernehmen.",
    );
  for (const u of state.data.users.filter((u) => u.active !== false)) {
    if (u.hostingPasswordChangeRequired)
      throw Error(
        "Produktion: Bitte das Passwort von WVM-admin vor der Freigabe ändern oder das vorbereitete Infomaniak-Erstinstallationspaket verwenden.",
      );
    if (["9876", "ChangeMe123"].some((p) => matches(p, u.passwordHash)))
      throw Error(
        "Produktion: unsicheres Passwort bei " +
          u.name +
          ". Vorher lokal ändern oder zurücksetzen.",
      );
    if (!u.mustChangePassword && (u.passwordPolicyMinimum || 0) < 12)
      throw Error(
        "Produktion: " +
          u.name +
          " muss vorher ein Passwort mit mindestens 12 Zeichen festlegen oder ein neues Startpasswort erhalten.",
      );
  }
  if (
    mfaEnabled &&
    !state.data.users.some(
      (u) =>
        u.active !== false &&
        ["Admin", "Administrator"].includes(u.role) &&
        u.mfaSecret &&
        u.passwordPolicyMinimum >= 12,
    )
  )
    throw Error(
      "Produktion: mindestens ein aktiver Admin muss vorher ein eigenes Passwort und Zwei-Faktor-Anmeldung einrichten.",
    );
}
function headers(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  if (production)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
}
module.exports = {
  db,
  root,
  production,
  mfaEnabled,
  read,
  persist,
  locked,
  validId,
  filePath,
  error,
  audit,
  session,
  tokenFor,
  revoke,
  logout,
  guard,
  rate,
  requireUser,
  passwordPolicy,
  archived,
  upload,
  registerUpload,
  sniff,
  storeUpload,
  removeFile,
  headers,
  base32,
  encrypt,
  decrypt,
  totp,
  totpStep,
  preflight,
  digest,
};
