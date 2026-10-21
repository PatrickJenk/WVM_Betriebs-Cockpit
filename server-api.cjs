const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const security = require("./server-security.cjs");
const root = security.root;
fs.mkdirSync(path.join(root, "files"), { recursive: true });
const secretPath = path.join(root, "secret.key");
try {
  fs.writeFileSync(secretPath, crypto.randomBytes(32), {
    flag: "wx",
    mode: 0o600,
  });
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
const admin = (u) => ["Admin", "Administrator"].includes(u?.role);
const owner = (u, d) =>
  admin(u) ||
  (!["Admin", "Administrator"].includes(d.uploadedByRole) &&
    d.uploadedById !== "admin" &&
    d.uploadedByName !== "WVM-admin" &&
    d.uploadedBy !== "ADM" &&
    (d.uploadedById ? d.uploadedById === u.id : d.uploadedBy === u.initials));
const read = security.read;
const hash = (p) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(p, salt, 32).toString("hex");
};
const matches = (p, h) => {
  if (!h) return false;
  const [salt, digest] = h.split(":");
  const candidate = crypto.scryptSync(p, salt, 32);
  return (
    candidate.length === Buffer.from(digest, "hex").length &&
    crypto.timingSafeEqual(candidate, Buffer.from(digest, "hex"))
  );
};
security.preflight(matches);
// Bestehende Binärdateien unverändert übernehmen und mit Besitzer/Dateityp registrieren.
locked(() => {
  const state = read();
  if (!state) return;
  for (const ref of [
    ...state.data.documents,
    ...state.data.entries.flatMap((e) => e.attachments || []),
  ]) {
    if (!security.validId(ref.id) || security.upload(ref.id)) continue;
    const file = security.filePath(ref.id);
    if (!fs.existsSync(file)) continue;
    const fd = fs.openSync(file, "r"),
      bytes = Buffer.alloc(8192),
      length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    fs.closeSync(fd);
    let mime = "application/octet-stream";
    try {
      mime = security.sniff(bytes.subarray(0, length));
    } catch {}
    const ownerId =
      ref.uploadedById ||
      state.data.users.find((u) => u.initials === ref.uploadedBy)?.id ||
      state.data.entries.find((e) =>
        e.attachments?.some((a) => a.id === ref.id),
      )?.createdById ||
      state.data.users.find(admin)?.id;
    security.registerUpload(
      ref.id,
      ownerId || "admin",
      fs.statSync(file).size,
      mime,
    );
  }
});
let loginWork = 0;
async function matchesAsync(p, h) {
  if (loginWork >= 2)
    throw security.error("Anmeldung ausgelastet. Bitte erneut versuchen.", 429);
  loginWork++;
  try {
    const [salt, digest] = (
      h || "00000000000000000000000000000000:" + "0".repeat(64)
    ).split(":");
    const candidate = await new Promise((resolve, reject) =>
      crypto.scrypt(p, salt, 32, (e, value) =>
        e ? reject(e) : resolve(value),
      ),
    );
    const expected = Buffer.from(digest, "hex");
    return (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(candidate, expected)
    );
  } finally {
    loginWork--;
  }
}
function cleanUser(u) {
  const {
    password,
    passwordHash,
    mfaSecret,
    mfaPending,
    mfaLastStep,
    recoveryCodes,
    passwordPolicyMinimum,
    mustSetupMfa,
    mfaEnabled,
    ...safe
  } = u;
  return {
    ...safe,
    ...(security.mfaEnabled && mfaSecret ? { mfaEnabled: true } : {}),
    ...(security.mfaEnabled && security.production && admin(u) && !mfaSecret
      ? { mustSetupMfa: true }
      : {}),
  };
}
function participants(entry, users) {
  const records = [
    {
      by: entry.createdBy,
      byId: entry.createdById,
      name: entry.createdByName,
      company: entry.createdCompany,
    },
    ...(entry.history || []),
    {
      by: entry.updatedBy,
      byId: entry.updatedById,
      name: entry.updatedByName,
      company: entry.updatedCompany,
    },
    ...(entry.participants || []).map((p) => ({
      byId: p.id,
      initials: p.initials,
      name: p.name,
      company: p.company,
    })),
  ];
  const found = new Map();
  for (const record of records) {
    const account = users.find(
      (u) => u.id === record.byId || u.initials === record.by,
    );
    const name = record.name || account?.name || record.by;
    if (!name) continue;
    const id =
      record.byId ||
      account?.id ||
      [...found.values()].find((p) => p.name === name)?.id ||
      name;
    found.set(id, {
      id,
      name,
      initials:
        record.initials ||
        account?.initials ||
        record.by ||
        found.get(id)?.initials,
      company: record.company || account?.company,
    });
  }
  return [...found.values()];
}
function visible(state, u) {
  if (!u)
    return {
      revision: 0,
      data: {
        users: [],
        entries: [],
        documents: [],
        folders: [],
        plants: [],
        accountVersion: 2,
        stationVersion: 1,
        documentTemplateVersion: 1,
      },
    };
  const data = structuredClone(state.data);
  data.structure ??= defaultStructure();
  if (
    u.mustChangePassword ||
    (security.mfaEnabled && security.production && admin(u) && !u.mfaSecret)
  )
    return {
      revision: state.revision,
      accountId: u.id,
      data: {
        users: [cleanUser(u)],
        entries: [],
        documents: [],
        folders: [],
        plants: [],
        accountVersion: 2,
        stationVersion: 1,
        documentTemplateVersion: 1,
      },
    };
  data.entries.forEach((e) => {
    e.participants = participants(e, state.data.users);
  });
  data.users = data.users.map(cleanUser);
  if (!admin(u)) {
    data.entries = data.entries.filter((e) => !security.archived(e));
    data.entries.forEach((e) => delete e.history);
  }
  return {
    revision: state.revision,
    accountId: u.id,
    mentionSeen: security.db
      .prepare("SELECT entry_id FROM mention_reads WHERE user_id=?")
      .all(u.id)
      .map((r) => r.entry_id),
    data,
  };
}
function persist(state) {
  security.persist(state);
}
function locked(action) {
  return security.locked(action);
}
const tokenFor = security.tokenFor;
function identity(req, state) {
  return security.session(req, state);
}
async function body(req, max = 60 * 1024 * 1024) {
  const parts = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    if (length > max)
      throw Object.assign(Error("Datei zu gross (max. 60 MB)."), {
        status: 413,
      });
    parts.push(part);
  }
  return Buffer.concat(parts);
}
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      ...value,
      security: {
        mfaEnabled: security.mfaEnabled,
        production: security.production,
        passwordMinimum: security.production ? 12 : 8,
      },
    }),
  );
};
const requireUser = security.requireUser;
function defaultStructure() {
  return structuredClone(requireStructure);
}
let requireStructure = { networks: [], sites: [], groups: [], sections: [] };
function validate(data) {
  if (data?.structure) validateStructure(data.structure);
  if (
    !data ||
    !["users", "entries", "documents", "folders", "plants"].every((k) =>
      Array.isArray(data[k]),
    )
  )
    throw Object.assign(Error("Ungültige Daten."), { status: 400 });
  for (const key of ["users", "entries", "documents", "folders", "plants"]) {
    if (
      data[key].length > 50000 ||
      data[key].some((x) => !x || !security.validId(x.id))
    )
      throw security.error("Ungültige IDs oder zu viele Datensätze.");
    if (new Set(data[key].map((x) => x.id)).size !== data[key].length)
      throw Object.assign(Error("Doppelte IDs."), { status: 400 });
  }
  const names = new Set(),
    initials = new Set();
  for (const u of data.users) {
    if (
      typeof u.name !== "string" ||
      !u.name.trim() ||
      u.name.length > 100 ||
      typeof u.initials !== "string" ||
      !/^[\p{L}\p{N}]{1,5}$/u.test(u.initials) ||
      !["Admin", "Administrator", "WVM", "EPC"].includes(u.role)
    )
      throw security.error("Ungültiger Benutzer.");
    const name = u.name.trim().toLowerCase(),
      initial = u.initials.toUpperCase();
    if (names.has(name) || initials.has(initial))
      throw security.error("Name oder Kürzel bereits vergeben.");
    names.add(name);
    initials.add(initial);
  }
  const walk = (value, depth = 0) => {
    if (depth > 12) throw security.error("Datenstruktur zu tief.");
    if (typeof value === "string" && value.length > 200000)
      throw security.error("Text zu lang.");
    if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw security.error("Ungültiges Feld.");
        if (
          (key === "id" || key.endsWith("Id")) &&
          item != null &&
          item !== "" &&
          !security.validId(item)
        )
          throw security.error("Ungültige Referenz-ID.");
        walk(item, depth + 1);
      }
  };
  // Historische Teilnehmer können Namen als alte IDs enthalten; nie als Dateipfad verwenden.
  for (const key of ["documents", "folders", "plants", "structure"])
    walk(data[key]);
  for (const e of data.entries) {
    if (!security.validId(e.siteId) || !security.validId(e.plantId))
      throw security.error("Ungültiger Standort.");
    for (const a of e.attachments || [])
      if (!security.validId(a.id)) throw security.error("Ungültiger Anhang.");
    if (
      typeof e.title !== "string" ||
      e.title.length > 300 ||
      typeof e.description !== "string" ||
      e.description.length > 200000
    )
      throw security.error("Ungültiger Eintrag.");
  }
}
module.exports = async function api(req, res) {
  const seedDefaults = await import("./src/data/seed.js");
  requireStructure = {
    networks: seedDefaults.networks,
    sites: seedDefaults.sites,
    groups: [],
    sections: [],
  };
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/")) return false;
  try {
    let state = read(),
      user = identity(req, state);
    security.guard(req);
    if (url === "/api/handbook" && ["GET", "HEAD"].includes(req.method)) {
      requireUser(user);
      const file = path.join(
        __dirname,
        "resources",
        "Benutzerhandbuch_Waermeverbund_Cockpit.pdf",
      );
      const bytes = fs.readFileSync(file);
      const download =
        new URL(req.url, "http://localhost").searchParams.get("download") ===
        "1";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="Benutzerhandbuch_Waermeverbund_Cockpit.pdf"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Length", bytes.length);
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : bytes);
      return true;
    }
    if (
      state &&
      (state.data.stationVersion !== 1 ||
        state.data.documentTemplateVersion !== 1)
    ) {
      const { initializeStations, initializeDocumentFolders } =
        await import("./src/data/seed.js");
      state = locked(() => {
        const latest = read();
        if (
          latest.data.stationVersion !== 1 ||
          latest.data.documentTemplateVersion !== 1
        ) {
          initializeStations(latest.data);
          if (latest.data.documentTemplateVersion !== 1)
            initializeDocumentFolders(latest.data);
          latest.revision++;
          persist(latest);
        }
        return latest;
      });
      user = identity(req, state);
    }
    if (
      (url === "/api/bootstrap" && req.method === "POST") ||
      (!state && url === "/api/session" && req.method === "GET")
    ) {
      if (req.method === "POST") await body(req, 1024 * 1024); // Alte Browser dürfen den Server nicht initialisieren.
      if (!state) {
        if (security.production)
          throw security.error(
            "Produktionsdaten fehlen. Datenübernahme vor dem Start erforderlich.",
            503,
          );
        const { seed, initializeStations, initializeDocumentFolders } =
          await import("./src/data/seed.js");
        const { initializeAccounts } = await import("./src/auth/accounts.js");
        const data = seed();
        data.folders ??= [];
        initializeAccounts(data);
        initializeStations(data);
        if (data.documentTemplateVersion !== 1) initializeDocumentFolders(data);
        validate(data);
        data.users = data.users.map((u) => ({
          ...cleanUser(u),
          passwordHash: hash(u.id === "admin" ? "9876" : "ChangeMe123"),
        }));
        data.documents.forEach((d) => {
          const author = data.users.find((u) => u.initials === d.uploadedBy);
          d.uploadedById ??= author?.id;
          d.uploadedByName ??= author?.name || d.uploadedBy;
        });
        state = locked(() => {
          const existing = read();
          if (existing) return existing;
          const created = { revision: 1, data };
          persist(created);
          return created;
        });
      }
      json(res, 200, visible(state, user));
      return true;
    }
    if (!state)
      throw Object.assign(Error("Noch nicht initialisiert."), { status: 503 });
    if (url === "/api/login" && req.method === "POST") {
      const input = JSON.parse((await body(req, 1024 * 1024)).toString());
      security.rate(req, input.name);
      if (
        typeof input.name !== "string" ||
        typeof input.password !== "string" ||
        input.password.length > 128 ||
        input.name.length > 100
      )
        throw security.error("Benutzername oder Passwort falsch.", 401);
      let chosen = state.data.users.find(
        (u) =>
          u.active !== false &&
          u.name.toLowerCase() === String(input.name).trim().toLowerCase(),
      );
      if (
        !(await matchesAsync(input.password, chosen?.passwordHash)) ||
        !chosen
      ) {
        security.audit(null, "auth.login.failed");
        throw Object.assign(Error("Benutzername oder Passwort falsch."), {
          status: 401,
        });
      }
      const credential = chosen.passwordHash;
      state = read();
      chosen = state.data.users.find(
        (u) =>
          u.id === chosen.id &&
          u.active !== false &&
          u.passwordHash === credential,
      );
      if (!chosen)
        throw security.error(
          "Anmeldung zwischenzeitlich geändert. Bitte erneut anmelden.",
          401,
        );
      if (security.mfaEnabled && chosen.mfaSecret) {
        locked(() => {
          const latest = read(),
            u = latest.data.users.find((u) => u.id === chosen.id);
          if (!u || u.passwordHash !== credential)
            throw security.error("Bitte erneut anmelden.", 401);
          const step = security.totpStep(
              security.decrypt(u.mfaSecret),
              input.code,
            ),
            recovery = security.digest(
              String(input.code || "").replace(/\s/g, ""),
            );
          if (step !== null && step > (u.mfaLastStep ?? -1))
            u.mfaLastStep = step;
          else if (u.recoveryCodes?.includes(recovery))
            u.recoveryCodes = u.recoveryCodes.filter((c) => c !== recovery);
          else
            throw security.error(
              "Zwei-Faktor-Code ungültig oder bereits verwendet. Neuen Code aus der App verwenden.",
              401,
            );
          latest.revision++;
          persist(latest);
        });
        state = read();
        chosen = state.data.users.find((u) => u.id === chosen.id);
      }
      security.audit(chosen, "auth.login");
      json(res, 200, {
        token: tokenFor(chosen, res),
        ...visible(state, chosen),
      });
      return true;
    }
    if (url === "/api/logout" && req.method === "POST") {
      security.logout(req, res);
      security.audit(user, "auth.logout");
      json(res, 200, { ok: true });
      return true;
    }
    if (url === "/api/session" && req.method === "GET") {
      if (req.cockpitSession)
        res.setHeader("X-CSRF-Token", req.cockpitSession.csrf);
      json(res, 200, { authenticated: !!user, ...visible(state, user) });
      return true;
    }
    if (url === "/api/mentions/seen" && req.method === "POST") {
      requireUser(user);
      const input = JSON.parse((await body(req)).toString("utf8"));
      if (!Array.isArray(input.ids) || input.ids.length > 10000)
        throw security.error("Ungueltige Erwaehnungen.");
      const { entryMentions } = await import("./src/services/mentions.js");
      const allowed = new Set(
        state.data.entries
          .filter(
            (e) =>
              (admin(user) || !security.archived(e)) &&
              entryMentions(e, state.data.users).some((p) => p.id === user.id),
          )
          .map((e) => e.id),
      );
      locked(() => {
        const insert = security.db.prepare(
          "INSERT OR IGNORE INTO mention_reads(user_id,entry_id) VALUES(?,?)",
        );
        for (const id of input.ids)
          if (allowed.has(id)) insert.run(user.id, id);
      });
      json(res, 200, visible(read(), user));
      return true;
    }
    if (url === "/api/audit" && req.method === "GET") {
      requireUser(user);
      if (!admin(user)) throw security.error("Nur Admin.", 403);
      json(res, 200, {
        events: security.db
          .prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 500")
          .all(),
      });
      return true;
    }
    if (url === "/api/mfa/setup" && req.method === "POST") {
      if (!security.mfaEnabled)
        throw security.error("Zwei-Faktor-Anmeldung ist deaktiviert.", 404);
      requireUser(user, true);
      if (user.mustChangePassword)
        throw security.error(
          "Bitte zuerst ein eigenes Passwort festlegen.",
          403,
        );
      if (!admin(user)) throw security.error("Nur Admin.", 403);
      const input = JSON.parse((await body(req, 4096)).toString());
      if (
        !matches(String(input.password || ""), user.passwordHash) ||
        (user.mfaSecret &&
          !security.totp(security.decrypt(user.mfaSecret), input.code))
      )
        throw security.error(
          "Aktuelles Passwort und gegebenenfalls aktueller Zwei-Faktor-Code erforderlich.",
          403,
        );
      const secret = security.base32(crypto.randomBytes(20));
      locked(() => {
        const latest = read(),
          u = latest.data.users.find((u) => u.id === user.id);
        u.mfaPending = {
          secret: security.encrypt(secret),
          expires: Date.now() + 600000,
        };
        persist(latest);
      });
      json(res, 200, {
        secret,
        uri:
          "otpauth://totp/" +
          encodeURIComponent("Wärme-Cockpit:" + user.name) +
          "?secret=" +
          secret +
          "&issuer=" +
          encodeURIComponent("Wärme-Cockpit"),
      });
      return true;
    }
    if (url === "/api/mfa/confirm" && req.method === "POST") {
      if (!security.mfaEnabled)
        throw security.error("Zwei-Faktor-Anmeldung ist deaktiviert.", 404);
      requireUser(user, true);
      if (user.mustChangePassword)
        throw security.error(
          "Bitte zuerst ein eigenes Passwort festlegen.",
          403,
        );
      if (!admin(user)) throw security.error("Nur Admin.", 403);
      const input = JSON.parse((await body(req, 4096)).toString());
      const codes = Array.from({ length: 8 }, () =>
        crypto.randomBytes(12).toString("base64url"),
      );
      const result = locked(() => {
        const latest = read(),
          u = latest.data.users.find((u) => u.id === user.id);
        if (
          !u.mfaPending ||
          u.mfaPending.expires < Date.now() ||
          !security.totp(security.decrypt(u.mfaPending.secret), input.code)
        )
          throw security.error("Code ungültig oder Einrichtung abgelaufen.");
        u.mfaSecret = u.mfaPending.secret;
        delete u.mfaPending;
        u.recoveryCodes = codes.map(security.digest);
        latest.revision++;
        persist(latest);
        security.revoke(u.id);
        security.audit(u, "auth.mfa.enabled");
        return {
          token: tokenFor(u, res),
          recoveryCodes: codes,
          ...visible(latest, u),
        };
      });
      json(res, 200, result);
      return true;
    }
    if (url === "/api/password" && req.method === "POST") {
      requireUser(user, true);
      const input = JSON.parse((await body(req, 1024 * 1024)).toString());
      security.passwordPolicy(input.password);
      if (user.hostingPasswordChangeRequired && input.password.length < 12)
        throw security.error(
          "Für das Hosting mindestens 12 Zeichen verwenden; empfohlen sind 20 Zeichen.",
        );
      if (
        user.hostingPasswordChangeRequired &&
        matches(input.password, user.passwordHash)
      )
        throw security.error(
          "Bitte ein neues, anderes Admin-Passwort festlegen.",
        );
      if (
        !user.mustChangePassword &&
        !matches(String(input.currentPassword || ""), user.passwordHash)
      )
        throw security.error("Aktuelles Passwort erforderlich.", 403);
      const result = locked(() => {
        const latest = read();
        const current = identity(req, latest);
        requireUser(current, true);
        const target = latest.data.users.find((u) => u.id === current.id);
        target.passwordHash = hash(input.password);
        target.passwordPolicyMinimum = input.password.length >= 12 ? 12 : 8;
        target.mustChangePassword = false;
        target.hostingPasswordChangeRequired = false;
        latest.revision++;
        persist(latest);
        security.revoke(target.id);
        security.audit(current, "auth.password.changed");
        return { token: tokenFor(target, res), ...visible(latest, target) };
      });
      json(res, 200, result);
      return true;
    }
    if (url === "/api/state" && req.method === "GET") {
      requireUser(user);
      json(res, 200, visible(state, user));
      return true;
    }
    if (url === "/api/state" && req.method === "PUT") {
      requireUser(user);
      const { findMentions } = await import("./src/services/mentions.js");
      const defaults = await import("./src/data/seed.js");
      requireStructure = {
        networks: defaults.networks,
        sites: defaults.sites,
        groups: [],
        sections: [],
      };
      const input = JSON.parse((await body(req, 16 * 1024 * 1024)).toString());
      validate(input.data);
      const result = locked(() => {
        const latest = read();
        user = identity(req, latest);
        requireUser(user);
        if (input.revision !== latest.revision)
          throw Object.assign(
            Error(
              "Die Daten wurden auf einem anderen Gerät geändert. Ansicht aktualisieren und erneut speichern.",
            ),
            { status: 409 },
          );
        const before = latest.data,
          next = input.data;
        before.structure ??= defaultStructure();
        next.structure ??= structuredClone(before.structure);
        validateStructure(next.structure);
        if (
          !admin(user) &&
          JSON.stringify(before.structure) !== JSON.stringify(next.structure)
        )
          throw security.error("Nur Admin darf die Navigation verwalten.", 403);
        const folderMap = new Map(next.folders.map((f) => [f.id, f]));
        const removedSites = new Set(
          before.structure.sites
            .filter((s) => !next.structure.sites.some((n) => n.id === s.id))
            .map((s) => s.id),
        );
        const removedSections = new Set(
          before.structure.sections
            .filter((s) => !next.structure.sections.some((n) => n.id === s.id))
            .map((s) => s.id),
        );
        for (const key of ["folders", "plants", "documents", "entries"])
          if (next[key].some((item) => removedSites.has(item.siteId)))
            throw security.error(
              "Bitte alle Inhalte des gelöschten Standorts ebenfalls entfernen.",
            );
        if (next.folders.some((f) => removedSections.has(f.sectionId)))
          throw security.error(
            "Bitte die Ordner des gelöschten Registers ebenfalls entfernen.",
          );
        const removedFolders = new Set(
          before.folders.filter((f) => !folderMap.has(f.id)).map((f) => f.id),
        );
        if (next.documents.some((d) => removedFolders.has(d.folderId)))
          throw security.error(
            "Bitte Dokumente gelöschter Ordner verschieben oder ebenfalls entfernen.",
          );
        for (const f of next.folders) {
          if (
            f.sectionId &&
            !next.structure.sections.some(
              (s) =>
                s.id === f.sectionId && s.siteId === f.siteId && !s.builtin,
            )
          )
            throw security.error("Ungültige Registerzuordnung des Ordners.");
          const visited = new Set([f.id]);
          let parent = f.parentId;
          while (parent) {
            if (visited.size > 32)
              throw security.error("Ordnerstruktur zu tief (max. 32 Ebenen).");
            const ancestor = folderMap.get(parent);
            if (
              !ancestor ||
              ancestor.siteId !== f.siteId ||
              (ancestor.sectionId || "docs") !== (f.sectionId || "docs") ||
              visited.has(parent)
            )
              throw security.error("Ungültige Ordnerstruktur.");
            visited.add(parent);
            parent = ancestor.parentId;
          }
        }
        for (const key of Object.keys(before))
          if (
            ![
              "users",
              "entries",
              "documents",
              "folders",
              "plants",
              "structure",
            ].includes(key)
          )
            next[key] = before[key];
        if (!admin(user)) {
          const hidden = before.entries.filter((e) => security.archived(e));
          if (next.entries.some((e) => hidden.some((x) => x.id === e.id)))
            throw security.error(
              "Archivierte Einträge dürfen nur Admins bearbeiten.",
              403,
            );
          next.entries.push(...structuredClone(hidden));
        }
        if (!admin(user)) {
          if (
            before.entries.some((e) => !next.entries.some((x) => x.id === e.id))
          )
            throw Object.assign(
              Error("Nur Admin darf Logbucheinträge löschen."),
              { status: 403 },
            );
          for (const key of ["folders", "plants"]) {
            if (JSON.stringify(before[key]) !== JSON.stringify(next[key]))
              throw Object.assign(
                Error("Nur Admin darf Ordner und Anlagen verwalten."),
                { status: 403 },
              );
          }
          if (next.users.length !== before.users.length)
            throw Object.assign(Error("Nur Admin darf Benutzer verwalten."), {
              status: 403,
            });
          for (const old of before.users) {
            const candidate = next.users.find((u) => u.id === old.id);
            if (!candidate)
              throw Object.assign(Error("Benutzer fehlt."), { status: 403 });
            if (candidate.password)
              throw Object.assign(
                Error("Nur das eigene Passwort darf ge\u00e4ndert werden."),
                { status: 403 },
              );
            if (
              candidate.password &&
              (candidate.password.length < 8 ||
                candidate.password === "ChangeMe123")
            )
              throw Object.assign(
                Error(
                  "Bitte ein eigenes Passwort mit mindestens 8 Zeichen verwenden.",
                ),
                { status: 400 },
              );
            const safe = cleanUser(old);
            const expected = { ...candidate };
            delete expected.password;
            if (old.id === user.id && candidate.password) {
              expected.mustChangePassword = safe.mustChangePassword;
            }
            if (JSON.stringify(expected) !== JSON.stringify(safe))
              throw Object.assign(
                Error("Nur das eigene Passwort darf geändert werden."),
                { status: 403 },
              );
          }
          for (const old of before.documents) {
            const candidate = next.documents.find((d) => d.id === old.id);
            if (!candidate && !owner(user, old))
              throw Object.assign(
                Error("Nur eigene Dateien dürfen gelöscht werden."),
                { status: 403 },
              );
            if (
              candidate &&
              (candidate.uploadedById !== old.uploadedById ||
                candidate.uploadedBy !== old.uploadedBy ||
                candidate.uploadedByName !== old.uploadedByName)
            )
              throw Object.assign(
                Error("Dateibesitzer darf nicht geändert werden."),
                { status: 403 },
              );
          }
        }
        next.users = next.users.map((u) => {
          const old = before.users.find((x) => x.id === u.id);
          const safe = cleanUser(u);
          delete safe.mfaEnabled;
          delete safe.mustSetupMfa;
          if (u.password) {
            if (!admin(user))
              throw security.error(
                "Passwort über Passwortformular ändern.",
                403,
              );
            security.passwordPolicy(u.password, true);
          }
          if (!old && !u.password)
            throw security.error("Startpasswort erforderlich.");
          return {
            ...safe,
            passwordPolicyMinimum: u.password
              ? u.password.length >= 12
                ? 12
                : 8
              : old?.passwordPolicyMinimum || 0,
            ...(old?.mfaSecret
              ? { mfaSecret: old.mfaSecret, recoveryCodes: old.recoveryCodes }
              : {}),
            ...(old?.mfaPending ? { mfaPending: old.mfaPending } : {}),
            ...(old?.mfaLastStep !== undefined
              ? { mfaLastStep: old.mfaLastStep }
              : {}),
            mustChangePassword: u.password
              ? true
              : (old?.mustChangePassword ?? true),
            ...(old?.hostingPasswordChangeRequired
              ? { hostingPasswordChangeRequired: true }
              : {}),
            passwordHash: u.password
              ? hash(u.password)
              : old?.passwordHash || hash("ChangeMe123"),
          };
        });
        if (!next.users.some((u) => admin(u) && u.active !== false))
          throw Object.assign(Error("Mindestens ein Admin ist erforderlich."), {
            status: 400,
          });
        for (const doc of next.documents) {
          const previous = before.documents.find((d) => d.id === doc.id),
            uploaded = security.upload(doc.id);
          if (
            !previous &&
            uploaded &&
            uploaded.owner !== user.id &&
            !admin(user)
          )
            throw security.error("Datei gehört einem anderen Benutzer.", 403);
          if (
            !previous &&
            !uploaded &&
            !(input.migration && admin(user) && !security.production)
          )
            throw security.error("Datei zuerst hochladen.");
          if (
            previous &&
            !owner(user, previous) &&
            JSON.stringify(doc) !== JSON.stringify(previous)
          )
            throw security.error(
              "Nur Besitzer oder Admin darf die Datei ändern.",
              403,
            );
          if (uploaded) {
            doc.mimeType = uploaded.mime;
            doc.fileSize = uploaded.size;
          }
          if (!before.documents.some((d) => d.id === doc.id)) {
            const author =
              input.migration && admin(user)
                ? before.users.find(
                    (u) =>
                      u.id === doc.uploadedById ||
                      u.initials === doc.uploadedBy,
                  ) || user
                : user;
            doc.uploadedById = author.id;
            doc.uploadedBy = author.initials;
            doc.uploadedByName = author.name;
            doc.uploadedByRole = author.role;
            doc.uploadedAt = new Date().toISOString();
          }
        }
        for (const entry of next.entries) {
          const old = before.entries.find((e) => e.id === entry.id);
          const mentions = findMentions(
            [entry.description, entry.nextSteps].filter(Boolean).join("\n"),
            before.users,
          );
          entry.mentions = [
            ...new Map(
              [...(old?.mentions || []), ...mentions].map((p) => [p.id, p]),
            ).values(),
          ];
          for (const a of entry.attachments || []) {
            if (old?.attachments?.some((x) => x.id === a.id)) continue;
            const uploaded = security.upload(a.id);
            if (!uploaded || (uploaded.owner !== user.id && !admin(user)))
              throw security.error("Anhang zuerst selbst hochladen.", 403);
            a.mimeType = uploaded.mime;
            a.fileSize = uploaded.size;
          }
          if (old) {
            const prev = { ...old },
              candidate = { ...entry };
            for (const field of [
              "siteId",
              "plantId",
              "title",
              "occurredAt",
              "createdAt",
              "createdBy",
              "createdById",
              "createdByName",
              "createdCompany",
              "nextSteps",
            ]) {
              if (JSON.stringify(entry[field]) !== JSON.stringify(old[field]))
                throw Object.assign(
                  Error(
                    "Bestehende Angaben dürfen nicht geändert werden. Bitte eine Beschreibung ergänzen.",
                  ),
                  { status: 403 },
                );
            }
            if (
              !["Erledigt", "Pendenz", "In Bearbeitung"].includes(
                entry.status,
              ) ||
              !["Gering", "Mittel", "Hoch"].includes(entry.priority)
            )
              throw Object.assign(Error("Ungültiger Status oder Priorität."), {
                status: 400,
              });
            const completion =
              old.status !== "Erledigt" && entry.status === "Erledigt";
            if (entry.status !== "Erledigt") entry.completedAt = null;
            else if (!completion)
              entry.completedAt = old.completedAt || old.updatedAt;
            if (entry.status === "Erledigt") entry.dueDate = "";
            else if (entry.dueDate !== old.dueDate)
              throw Object.assign(
                Error("Das Fälligkeitsdatum bleibt erhalten."),
                { status: 403 },
              );
            if (
              !String(entry.description || "").startsWith(
                String(old.description || ""),
              )
            )
              throw Object.assign(
                Error("Die bisherige Beschreibung muss erhalten bleiben."),
                { status: 403 },
              );
            if (
              (old.attachments || []).some(
                (a) =>
                  !(entry.attachments || []).some(
                    (b) => JSON.stringify(a) === JSON.stringify(b),
                  ),
              )
            )
              throw Object.assign(
                Error("Bestehende Anhänge bleiben erhalten."),
                { status: 403 },
              );
            if (completion) entry.completedAt = new Date().toISOString();
            delete prev.participants;
            delete candidate.participants;
            delete prev.mentions;
            delete candidate.mentions;
            delete prev.history;
            delete candidate.history;
            if (JSON.stringify(prev) !== JSON.stringify(candidate)) {
              entry.history = [
                ...(old.history || []),
                {
                  at: new Date().toISOString(),
                  by: user.initials,
                  byId: user.id,
                  company: user.company,
                  name: user.name,
                  status: old.status,
                  title: old.title,
                  description: old.description,
                  nextSteps: old.nextSteps,
                },
              ];
              entry.updatedBy = user.initials;
              entry.updatedById = user.id;
              entry.updatedAt = new Date().toISOString();
              entry.updatedByName = user.name;
              entry.updatedCompany = user.company;
            } else entry.history = old.history || [];
            entry.participants = participants(
              { ...entry, participants: old.participants },
              before.users,
            );
          } else if (!(input.migration && admin(user))) {
            if (
              !["Erledigt", "Pendenz", "In Bearbeitung"].includes(entry.status)
            )
              throw security.error("Ungültiger Status.");
            if (
              !before.plants.some(
                (p) =>
                  p.id === entry.plantId &&
                  p.siteId === entry.siteId &&
                  p.active &&
                  !p.deleted,
              )
            )
              throw Object.assign(
                Error("Bitte eine freigegebene Anlage auswählen."),
                { status: 400 },
              );
            if (!["Gering", "Mittel", "Hoch"].includes(entry.priority))
              throw Object.assign(Error("Ungültige Priorität."), {
                status: 400,
              });
            Object.assign(entry, {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt:
                entry.status === "Erledigt" ? new Date().toISOString() : null,
              createdBy: user.initials,
              createdById: user.id,
              createdByName: user.name,
              createdCompany: user.company,
              updatedBy: user.initials,
              updatedById: user.id,
              updatedByName: user.name,
              updatedCompany: user.company,
              history: [],
              participants: [],
            });
            entry.participants = participants(entry, before.users);
          }
        }
        const saved = { revision: latest.revision + 1, data: next };
        persist(saved);
        for (const old of before.users)
          if (
            !next.users.some(
              (u) =>
                u.id === old.id &&
                u.passwordHash === old.passwordHash &&
                u.role === old.role &&
                u.active !== false,
            )
          )
            security.revoke(old.id);
        security.audit(user, "state.saved", {
          revision: saved.revision,
          deletedEntries: before.entries
            .filter((e) => !next.entries.some((x) => x.id === e.id))
            .map((e) => e.id),
        });
        for (const old of before.documents) {
          if (!next.documents.some((d) => d.id === old.id)) {
            if (
              !next.entries.some((e) =>
                e.attachments?.some((a) => a.id === old.id),
              )
            )
              security.removeFile(old.id);
          }
        }
        const removedAttachments = before.entries
          .filter((e) => !next.entries.some((x) => x.id === e.id))
          .flatMap((e) => e.attachments || []);
        for (const attachment of removedAttachments) {
          if (!/^[a-zA-Z0-9-]{1,100}$/.test(attachment.id)) continue;
          if (
            next.documents.some((d) => d.id === attachment.id) ||
            next.entries.some((e) =>
              e.attachments?.some((a) => a.id === attachment.id),
            )
          )
            continue;
          security.removeFile(attachment.id);
        }
        const newUser = next.users.find((u) => u.id === user.id);
        return {
          ...visible(saved, newUser),
          ...(newUser && newUser.passwordHash !== user.passwordHash
            ? { token: tokenFor(newUser, res) }
            : {}),
        };
      });
      json(res, 200, result);
      return true;
    }
    const match = url.match(/^\/api\/files\/([a-zA-Z0-9-]{1,100})$/);
    if (match) {
      requireUser(user);
      const id = match[1],
        file = security.filePath(id),
        doc = state.data.documents.find((d) => d.id === id);
      const attachment = state.data.entries
        .filter((e) => admin(user) || !security.archived(e))
        .some((e) => e.attachments?.some((a) => a.id === id));
      if (req.method === "GET" || req.method === "HEAD") {
        if (!doc && !attachment)
          throw Object.assign(Error("Datei nicht gefunden."), { status: 404 });
        if (!fs.existsSync(file))
          throw Object.assign(
            Error("Datei noch nicht vom bisherigen Browser übertragen."),
            { status: 404 },
          );
        res.writeHead(200, {
          "Content-Type":
            security.upload(id)?.mime || "application/octet-stream",
          "Content-Disposition": 'attachment; filename="download"',
          "Cache-Control": "no-store",
        });
        if (req.method === "HEAD") res.end();
        else
          fs.createReadStream(file)
            .on("error", () => res.destroy())
            .pipe(res);
        return true;
      }
      if (req.method === "PUT") {
        if (doc && !owner(user, doc))
          throw Object.assign(
            Error("Nur Besitzer oder Admin darf die Datei übertragen."),
            { status: 403 },
          );
        await security.storeUpload(req, id, user);
        json(res, 200, { ok: true });
        return true;
      }
      if (req.method === "DELETE") {
        locked(() => {
          const latest = read(),
            current = identity(req, latest);
          requireUser(current);
          const referencedDoc = latest.data.documents.find((d) => d.id === id);
          const referencedEntry = latest.data.entries.some((e) =>
            e.attachments?.some((a) => a.id === id),
          );
          if (referencedDoc || referencedEntry)
            throw security.error(
              "Datei zuerst aus der Ablage oder dem Logbuch entfernen.",
              409,
            );
          if (doc && !owner(user, doc))
            throw Object.assign(
              Error("Nur eigene Dateien dürfen gelöscht werden."),
              { status: 403 },
            );
          if (doc || attachment)
            throw Object.assign(
              Error("Datei zuerst aus der Ablage entfernen."),
              {
                status: 409,
              },
            );
          const uploaded = security.upload(id);
          if (uploaded && uploaded.owner !== user.id && !admin(user))
            throw security.error(
              "Nur eigene Dateien dürfen gelöscht werden.",
              403,
            );
          if (!uploaded && !admin(user))
            throw security.error(
              "Nur Admin darf alte unzugeordnete Dateien löschen.",
              403,
            );
          security.removeFile(id);
          security.audit(current, "file.deleted", { id });
        });
        json(res, 200, { ok: true });
        return true;
      }
    }
    json(res, 404, { error: "Nicht gefunden" });
    return true;
  } catch (error) {
    if (error instanceof SyntaxError)
      error = security.error("Ungültiges JSON.");
    json(res, error.status || 500, {
      error: error.status ? error.message : "Serverfehler beim Speichern.",
    });
    return true;
  }
};

function validateStructure(value) {
  if (!value || typeof value !== "object")
    throw security.error("Ungültige Navigation.");
  for (const key of ["networks", "sites", "groups", "sections"]) {
    if (!Array.isArray(value[key]) || value[key].length > 5000)
      throw security.error("Ungültige Navigation.");
    const ids = new Set();
    for (const item of value[key]) {
      if (
        !item ||
        !security.validId(item.id) ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 100
      )
        throw security.error("Ungültiger Name oder ID.");
      ids.add(item.id);
    }
  }
  for (const item of value.sites) {
    if (
      (item.type && !["mbus", "heat-substation"].includes(item.type)) ||
      (item.address !== undefined &&
        (typeof item.address !== "string" || item.address.length > 250)) ||
      !value.networks.some((n) => n.id === item.heatNetworkId) ||
      (item.groupId &&
        !value.groups.some(
          (g) => g.id === item.groupId && g.networkId === item.heatNetworkId,
        ))
    )
      throw security.error("Ungültige Standortzuordnung.");
  }
  for (const item of value.groups) {
    if (!value.networks.some((n) => n.id === item.networkId))
      throw security.error("Ungültige Kategorie.");
    const visited = new Set([item.id]);
    let parent = item.parentId;
    while (parent) {
      const ancestor = value.groups.find((g) => g.id === parent);
      if (
        !ancestor ||
        ancestor.networkId !== item.networkId ||
        visited.has(parent) ||
        visited.size > 32
      )
        throw security.error("Ungültige Kategoriehierarchie.");
      visited.add(parent);
      parent = ancestor.parentId;
    }
  }
  const builtinKeys = new Set();
  for (const item of value.sections) {
    if (
      !value.sites.some((s) => s.id === item.siteId) ||
      ["log", "docs"].includes(item.id) ||
      (item.builtin !== undefined && !["log", "docs"].includes(item.builtin)) ||
      (item.order !== undefined &&
        (!Number.isInteger(item.order) ||
          item.order < 0 ||
          item.order > 10000)) ||
      (item.hidden !== undefined && typeof item.hidden !== "boolean")
    )
      throw security.error("Ungültiges Register.");
    if (item.builtin) {
      const key = item.siteId + ":" + item.builtin;
      if (builtinKeys.has(key))
        throw security.error("Doppeltes Standardregister.");
      builtinKeys.add(key);
    }
  }
}
