const store = require("./server-security.cjs");
const crypto = require("node:crypto");
const { canLead, canManageMain } = require("./src/auth/roles.js");
const {
  logbookMessage,
  mailTemplateDefaults,
} = require("./server-mail-message.cjs");
const fs = require("node:fs");
const path = require("node:path");
const db = store.db;
db.exec(`CREATE TABLE IF NOT EXISTS collaboration_migrations(id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS contact_organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL);
INSERT OR IGNORE INTO contact_organizations VALUES('WVM','Wärmeverbund Marzili Bern AG'),('EWB','Energie Wasser Bern');
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,json TEXT NOT NULL,version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contact_images(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS mail_settings(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mail_outbox(event_key TEXT PRIMARY KEY,user_id TEXT NOT NULL,entry_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT,sent_at TEXT);
CREATE INDEX IF NOT EXISTS mail_outbox_due ON mail_outbox(status,next_attempt);
CREATE TABLE IF NOT EXISTS mail_worker(id INTEGER PRIMARY KEY CHECK(id=1),lease INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mail_overdue_events(entry_id TEXT PRIMARY KEY,due_date TEXT NOT NULL,eligible INTEGER NOT NULL,cycle INTEGER NOT NULL);
INSERT OR IGNORE INTO mail_worker(id,lease) VALUES(1,0);`);
// Additive migration for installations that already have the original lease table.
db.exec("SAVEPOINT collaboration_schema");
try {
  if (
    !db
      .prepare("PRAGMA table_info(mail_worker)")
      .all()
      .some((c) => c.name === "owner")
  )
    db.exec("ALTER TABLE mail_worker ADD COLUMN owner TEXT");
  if (
    !db
      .prepare("PRAGMA table_info(contact_images)")
      .all()
      .some((c) => c.name === "created")
  )
    db.exec(
      "ALTER TABLE contact_images ADD COLUMN created INTEGER NOT NULL DEFAULT 0",
    );
  db.exec("RELEASE collaboration_schema");
} catch (error) {
  db.exec("ROLLBACK TO collaboration_schema; RELEASE collaboration_schema");
  throw error;
}
const admin = (u) => ["Admin", "Administrator"].includes(u?.role);
const main = (u) => admin(u) && u.systemRole === "main";
const can = (u, permission) =>
  canManageMain(u) || (admin(u) && u.systemPermissions?.includes(permission));
function migrate() {
  store.locked(() => {
    if (db.prepare("SELECT id FROM collaboration_migrations WHERE id=1").get())
      return;
    const state = store.read();
    const candidates =
      state?.data.users.filter(
        (u) => admin(u) && !u.backupAdmin && u.active !== false,
      ) || [];
    const first =
      candidates.find((u) => u.systemRole === "main") ||
      candidates.find((u) => u.id === "admin" || u.name === "WVM-admin") ||
      candidates[0];
    if (!first) return;
    first.systemRole = "main";
    state.revision++;
    store.persist(state);
    db.prepare("INSERT INTO collaboration_migrations VALUES(1)").run();
    store.audit(null, "roles.migrated", { mainAdministrator: first.id });
  });
}
function email(value, optional = true) {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value)
  )
    throw store.error("Bitte eine gültige E-Mail-Adresse eingeben.");
  return value.trim();
}
function validateUsers(before, next, actor, { resetting } = {}) {
  for (const u of next.users) {
    const previous = before.users.find((x) => x.id === u.id);
    const credentialsChanged =
      resetting === u.id ||
      u.email !== previous?.email ||
      u.initials !== previous?.initials ||
      u.active !== previous?.active;
    if (
      previous &&
      previous.id !== actor.id &&
      credentialsChanged &&
      (previous.systemPermissions || []).some((p) => !can(actor, p))
    )
      throw store.error(
        "Zum Zurücksetzen oder Deaktivieren dieses Kontos fehlen Systemrechte.",
        403,
      );
    if (
      previous?.systemRole === "main" &&
      !canManageMain(actor) &&
      credentialsChanged
    )
      throw store.error(
        "Hauptadministrator darf nur durch Hauptadministration geändert werden.",
        403,
      );
    email(u.email);
    if (
      u.notificationsEnabled !== undefined &&
      typeof u.notificationsEnabled !== "boolean"
    )
      throw store.error("Ungültige Benachrichtigungseinstellung.");
    if (
      u.systemRole !== undefined &&
      !["main", "admin", "user"].includes(u.systemRole)
    )
      throw store.error("Ungültige Systemrolle.");
    if (["main", "admin"].includes(u.systemRole) && !admin(u))
      throw store.error(
        "Systemadministratoren benötigen eine Administratorrolle.",
      );
    if (
      u.systemPermissions !== undefined &&
      (!Array.isArray(u.systemPermissions) ||
        u.systemPermissions.some((p) => !["smtp", "roles"].includes(p)))
    )
      throw store.error("Ungültige Systemrechte.");
    if ((u.systemPermissions || []).length && !admin(u))
      throw store.error("Systemrechte dürfen nur Administratoren erhalten.");
  }
  const rights = (u) =>
    JSON.stringify(
      u && [
        u.role,
        u.userRole ?? null,
        u.leadership ?? null,
        u.systemRole || "",
        u.systemPermissions || [],
        u.active !== false,
      ],
    );
  for (const id of new Set([...before.users, ...next.users].map((u) => u.id))) {
    const old = before.users.find((u) => u.id === id),
      value = next.users.find((u) => u.id === id);
    if (rights(old) === rights(value)) continue;
    const sensitive =
      old?.systemRole === "main" ||
      value?.systemRole === "main" ||
      old?.systemRole !== value?.systemRole ||
      old?.systemPermissions?.length ||
      value?.systemPermissions?.length;
    if (sensitive && !can(actor, "roles"))
      throw store.error("Keine Berechtigung für Rollenverwaltung.", 403);
    if (
      (old?.systemRole === "main" || value?.systemRole === "main") &&
      !canManageMain(actor)
    )
      throw store.error(
        "Nur Hauptadministratoren verwalten Hauptadministratorrechte.",
        403,
      );
    store.audit(actor, "roles.changed", {
      userId: id,
      before: old && JSON.parse(rights(old)),
      after: value && JSON.parse(rights(value)),
    });
  }
  if (
    before.users.some((u) => u.systemRole === "main") &&
    !next.users.some((u) => main(u) && u.active !== false)
  )
    throw store.error(
      "Der letzte aktive Hauptadministrator muss erhalten bleiben.",
    );
}
const settings = () =>
  JSON.parse(
    db.prepare("SELECT json FROM mail_settings WHERE id=1").get()?.json || "{}",
  );
const safeSettings = () => {
  const { password, ...rest } = settings();
  return {
    ...rest,
    template: { ...mailTemplateDefaults, ...rest.template },
    passwordSet: !!password,
  };
};
function validatedMailTemplate(value, fallback) {
  if (value === undefined) return fallback;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.subject !== "string" ||
    value.subject.length > 250 ||
    /[\r\n]/.test(value.subject) ||
    typeof value.body !== "string" ||
    value.body.length > 12000 ||
    typeof value.signature !== "string" ||
    value.signature.length > 1500
  )
    throw store.error("Bitte Betreff, Nachrichtentext und Signatur prüfen.");
  return {
    subject: value.subject.trim() || mailTemplateDefaults.subject,
    body: value.body.trim() || mailTemplateDefaults.body,
    signature: value.signature.trim(),
  };
}
function transport(config) {
  return require("nodemailer").createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === "tls",
    requireTLS: config.encryption === "starttls",
    auth: config.username
      ? {
          user: config.username,
          pass: config.password ? store.decrypt(config.password) : "",
        }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { minVersion: "TLSv1.2" },
  });
}
function content(e, data, actor, kind) {
  const site = data.structure?.sites?.find((s) => s.id === e.siteId);
  const network = data.structure?.networks?.find(
    (n) => n.id === site?.heatNetworkId,
  );
  return {
    title: e.title,
    site: [network?.name, site?.name].filter(Boolean).join(" / "),
    description: String(e.description || "").slice(-1600),
    dueDate: e.dueDate,
    actor: actor?.name || "System",
    kind,
  };
}
function enqueue(key, id, e, data, actor, kind) {
  const u = data.users.find((u) => u.id === id && u.active !== false);
  if (!u) return;
  db.prepare(
    "INSERT OR IGNORE INTO mail_outbox(event_key,user_id,entry_id,kind,payload) VALUES(?,?,?,?,?)",
  ).run(key, id, e.id, kind, JSON.stringify(content(e, data, actor, kind)));
}
function updateAssignment(before, entry, data, actor) {
  const assigned = entry.assigneeIds || [];
  const copied = entry.ccIds || [];
  const oldAssigned = before?.assigneeIds || [];
  const oldCopied = before?.ccIds || [];
  const added =
    assigned.some((id) => !oldAssigned.includes(id)) ||
    copied.some((id) => !oldCopied.includes(id));
  const first = assigned[0] || copied[0];
  if (!first || added)
    db.prepare(
      "UPDATE mail_outbox SET status='skipped' WHERE entry_id=? AND kind IN ('Aufgabenzuweisung','Kopie') AND status IN ('pending','retry')",
    ).run(entry.id);
  if (first && added)
    db.prepare(
      "INSERT INTO mail_outbox(event_key,user_id,entry_id,kind,payload) VALUES(?,?,?,?,?)",
    ).run(
      `assignment:${entry.id}:${crypto.randomUUID()}`,
      first,
      entry.id,
      "Aufgabenzuweisung",
      JSON.stringify({
        ...content(entry, data, actor, "Aufgabenzuweisung"),
        grouped: true,
      }),
    );
}
function consolidatePendingAssignments(data) {
  const jobs = db
    .prepare(
      "SELECT * FROM mail_outbox WHERE kind IN ('Aufgabenzuweisung','Kopie') AND status IN ('pending','retry') ORDER BY rowid DESC",
    )
    .all();
  const grouped = new Set(
    jobs
      .filter((job) => JSON.parse(job.payload).grouped)
      .map((job) => job.entry_id),
  );
  for (const job of jobs) {
    if (JSON.parse(job.payload).grouped) continue;
    const entry = data?.entries.find((e) => e.id === job.entry_id);
    if (entry?.ccIds === undefined) continue;
    if (grouped.has(job.entry_id)) {
      db.prepare(
        "UPDATE mail_outbox SET status='skipped' WHERE event_key=?",
      ).run(job.event_key);
    } else {
      db.prepare(
        "UPDATE mail_outbox SET kind=?,payload=? WHERE event_key=?",
      ).run(
        "Aufgabenzuweisung",
        JSON.stringify({
          ...JSON.parse(job.payload),
          kind: "Aufgabenzuweisung",
          grouped: true,
        }),
        job.event_key,
      );
      grouped.add(job.entry_id);
    }
  }
}
function assignmentRecipients(entry, data) {
  const used = new Set();
  const resolve = (ids) =>
    ids.flatMap((id) => {
      const user = data.users.find((u) => u.id === id && u.active !== false);
      if (!user?.email || user.notificationsEnabled === false) return [];
      let address;
      try {
        address = email(user.email, false);
      } catch {
        return [];
      }
      const key = address.toLowerCase();
      if (used.has(key)) return [];
      used.add(key);
      return [{ name: user.name, address }];
    });
  return {
    to: resolve(entry.assigneeIds || []),
    cc: resolve(entry.ccIds || []),
  };
}
function changes(before, next, actor) {
  for (const e of next.entries) {
    const old = before.entries.find((x) => x.id === e.id);
    if (
      (e.assigneeIds !== undefined && !Array.isArray(e.assigneeIds)) ||
      (e.assigneeIds || []).length > 1000 ||
      (e.assigneeIds || []).some(
        (id) =>
          typeof id !== "string" ||
          (!(old?.assigneeIds || []).includes(id) &&
            !next.users.some((u) => u.id === id && u.active !== false)),
      )
    )
      throw store.error("Bitte aktive Benutzer zuweisen.");
    if (
      e.ccIds !== undefined &&
      (!Array.isArray(e.ccIds) ||
        e.ccIds.length > 1000 ||
        new Set(e.ccIds).size !== e.ccIds.length ||
        (e.assigneeIds || []).length > 1 ||
        e.ccIds.some(
          (id) =>
            typeof id !== "string" ||
            (e.assigneeIds || []).includes(id) ||
            (!(old?.ccIds || []).includes(id) &&
              !(old?.assigneeIds || []).includes(id) &&
              !next.users.some((u) => u.id === id && u.active !== false)),
        ))
    )
      throw store.error("Bitte für CC andere aktive Benutzer auswählen.");
    if (
      (e.dueDate != null && typeof e.dueDate !== "string") ||
      (e.dueDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(e.dueDate) ||
          !Number.isFinite(Date.parse(e.dueDate)) ||
          new Date(e.dueDate).toISOString().slice(0, 10) !== e.dueDate))
    )
      throw store.error("Ungültiges Fälligkeitsdatum.");
    if (e.ccIds !== undefined) updateAssignment(old, e, next, actor);
    else {
      // Older clients can still store more than one direct assignment.
      for (const id of old?.assigneeIds || [])
        if (!(e.assigneeIds || []).includes(id))
          db.prepare(
            "UPDATE mail_outbox SET status='skipped' WHERE entry_id=? AND user_id=? AND kind='Aufgabenzuweisung' AND status IN ('pending','retry')",
          ).run(e.id, id);
      for (const id of new Set(e.assigneeIds || []))
        if (!(old?.assigneeIds || []).includes(id))
          enqueue(
            `assignment:${e.id}:${id}:${crypto.randomUUID()}`,
            id,
            e,
            next,
            actor,
            "Aufgabenzuweisung",
          );
    }
    const recipients = new Set([...(e.assigneeIds || []), ...(e.ccIds || [])]);
    for (const p of e.mentions || [])
      if (
        !recipients.has(p.id) &&
        !(old?.mentions || []).some((x) => x.id === p.id)
      )
        enqueue(`mention:${e.id}:${p.id}`, p.id, e, next, actor, "Erwähnung");
  }
  syncOverdue(next);
}
function syncOverdue(data) {
  const ids = new Set(data.entries.map((e) => e.id));
  for (const row of db.prepare("SELECT * FROM mail_overdue_events").all())
    if (!ids.has(row.entry_id))
      db.prepare(
        "UPDATE mail_overdue_events SET eligible=0 WHERE entry_id=?",
      ).run(row.entry_id);
  for (const e of data.entries) {
    const eligible = Number(
        ["Offen", "Pendenz", "In Bearbeitung"].includes(e.status) &&
          !!e.dueDate,
      ),
      due = e.dueDate || "";
    const old = db
      .prepare("SELECT * FROM mail_overdue_events WHERE entry_id=?")
      .get(e.id);
    if (!old)
      db.prepare("INSERT INTO mail_overdue_events VALUES(?,?,?,1)").run(
        e.id,
        due,
        eligible,
      );
    else if (old.due_date !== due || old.eligible !== eligible)
      db.prepare(
        "UPDATE mail_overdue_events SET due_date=?,eligible=?,cycle=cycle+1 WHERE entry_id=?",
      ).run(due, eligible, e.id);
  }
}
function overdue(now = new Date()) {
  const state = store.read();
  if (!state) return;
  syncOverdue(state.data);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
  }).format(now);
  for (const e of state.data.entries) {
    if (
      !["Offen", "Pendenz", "In Bearbeitung"].includes(e.status) ||
      !e.dueDate ||
      e.dueDate >= today
    )
      continue;
    const accountId = (id, initials) =>
      id ||
      (initials
        ? state.data.users.find((u) => u.initials === initials)?.id
        : undefined);
    const ids = new Set([
      ...(e.assigneeIds || []),
      ...(e.participants || []).map((p) => accountId(p.id, p.initials)),
      accountId(e.createdById, e.createdBy),
      accountId(e.updatedById, e.updatedBy),
      ...(e.history || []).map((h) => accountId(h.byId, h.by)),
    ]);
    const cycle = db
      .prepare("SELECT cycle FROM mail_overdue_events WHERE entry_id=?")
      .get(e.id).cycle;
    for (const id of ids)
      if (id)
        enqueue(
          `overdue:${e.id}:${cycle}:${e.dueDate}:${id}`,
          id,
          e,
          state.data,
          null,
          "Überfällige Pendenz",
        );
  }
}
function cleanupImages() {
  db.prepare(
    "DELETE FROM contact_images WHERE created<? AND id NOT IN (SELECT json_extract(json,'$.imageId') FROM contacts WHERE json_extract(json,'$.imageId') IS NOT NULL)",
  ).run(Date.now() - 86400000);
}
async function worker() {
  const owner = crypto.randomUUID();
  const claimed = store.locked(
    () =>
      db
        .prepare(
          "UPDATE mail_worker SET lease=?,owner=? WHERE id=1 AND lease<?",
        )
        .run(Date.now() + 300000, owner, Date.now()).changes,
  );
  if (!claimed) return;
  let leaseLost = false;
  const renew = () => {
    const changed = db
      .prepare("UPDATE mail_worker SET lease=? WHERE id=1 AND owner=?")
      .run(Date.now() + 300000, owner).changes;
    if (!changed) leaseLost = true;
    return !!changed;
  };
  const heartbeat = setInterval(() => {
    try {
      renew();
    } catch {
      leaseLost = true;
    }
  }, 15000);
  heartbeat.unref();
  let mailer;
  try {
    store.locked(() => {
      overdue();
      cleanupImages();
    });
    const config = settings();
    if (
      process.env.COCKPIT_MAIL_DISABLED === "1" ||
      !config.enabled ||
      !config.host ||
      !config.baseUrl
    )
      return;
    store.locked(() => consolidatePendingAssignments(store.read()?.data));
    const jobs = db
      .prepare(
        "SELECT * FROM mail_outbox WHERE status IN ('pending','retry') AND next_attempt<=? ORDER BY next_attempt LIMIT 5",
      )
      .all(Date.now());
    for (const job of jobs) {
      if (leaseLost || !renew()) break;
      if (process.env.COCKPIT_MAIL_DISABLED === "1" || !settings().enabled)
        break;
      const currentJob = db
        .prepare("SELECT status FROM mail_outbox WHERE event_key=?")
        .get(job.event_key);
      if (!currentJob || !["pending", "retry"].includes(currentJob.status))
        continue;
      const data = store.read()?.data,
        u = data?.users.find((u) => u.id === job.user_id && u.active !== false),
        e = data?.entries.find((e) => e.id === job.entry_id);
      const payload = JSON.parse(job.payload);
      const group = payload.grouped && e ? assignmentRecipients(e, data) : null;
      const event = db
        .prepare("SELECT cycle FROM mail_overdue_events WHERE entry_id=?")
        .get(e?.id || "");
      const protocol =
        job.kind === "Jourfix-Protokoll"
          ? db
              .prepare("SELECT json,pdf FROM leadership_meetings WHERE id=?")
              .get(job.entry_id)
          : null;
      const protocolMeeting = protocol && JSON.parse(protocol.json);
      const stale =
        job.kind === "Jourfix-Protokoll"
          ? !protocol?.pdf ||
            !u ||
            !require("./server-jourfix.cjs").allowed(u, protocolMeeting.jourfix)
          : !e ||
            (job.kind === "Aufgabenzuweisung" &&
              !group &&
              !(e.assigneeIds || []).includes(u?.id)) ||
            (job.kind === "Kopie" && !(e.ccIds || []).includes(u?.id)) ||
            (job.kind === "Überfällige Pendenz" &&
              (e.status === "Erledigt" ||
                payload.dueDate !== e.dueDate ||
                !job.event_key.startsWith(`overdue:${e.id}:${event?.cycle}:`)));
      if (
        stale ||
        (group
          ? !group.to.length && !group.cc.length
          : !u?.email || (!protocol && u.notificationsEnabled === false))
      ) {
        db.prepare(
          "UPDATE mail_outbox SET status='skipped' WHERE event_key=?",
        ).run(job.event_key);
        continue;
      }
      try {
        mailer ||= transport(config);
        await mailer.sendMail({
          signal: AbortSignal.timeout(45000),
          from: { name: config.senderName, address: config.senderEmail },
          replyTo: config.replyTo || undefined,
          ...(group
            ? { to: group.to, cc: group.cc }
            : { to: email(u.email, false) }),
          messageId: `<${store.digest(job.event_key)}@${config.senderEmail.split("@")[1]}>`,
          ...(protocol
            ? {
                subject: protocolMeeting.title + " – " + protocolMeeting.date,
                text: "Das abgeschlossene Protokoll liegt im Anhang.",
                attachments: [
                  {
                    filename: "Jourfix-" + protocolMeeting.date + ".pdf",
                    content: Buffer.from(protocol.pdf),
                    contentType: "application/pdf",
                  },
                ],
              }
            : logbookMessage(payload, e.id, config.baseUrl, config.template)),
        });
        if (leaseLost || !renew()) break;
        db.prepare(
          "UPDATE mail_outbox SET status='sent',attempts=attempts+1,sent_at=?,last_error=NULL WHERE event_key=?",
        ).run(new Date().toISOString(), job.event_key);
      } catch (error) {
        if (leaseLost || !renew()) break;
        db.prepare(
          "UPDATE mail_outbox SET status=?,attempts=attempts+1,next_attempt=?,last_error=? WHERE event_key=?",
        ).run(
          job.attempts >= 7 ? "failed" : "retry",
          Date.now() + Math.min(86400000, 60000 * 2 ** job.attempts),
          mailError(error),
          job.event_key,
        );
      }
    }
  } finally {
    clearInterval(heartbeat);
    mailer?.close?.();
    db.prepare(
      "UPDATE mail_worker SET lease=0,owner=NULL WHERE id=1 AND owner=?",
    ).run(owner);
  }
}
function mailError(e) {
  return (
    {
      EAUTH: "SMTP-Anmeldung fehlgeschlagen. Benutzername und Passwort prüfen.",
      ECONNECTION: "SMTP-Server nicht erreichbar.",
      ETIMEDOUT: "Zeitüberschreitung beim SMTP-Verbindungsaufbau.",
      ESOCKET: "SMTP-Verbindung oder TLS-Zertifikat prüfen.",
    }[e.code] ||
    "Mailversand fehlgeschlagen. Server, Absender und Empfänger prüfen."
  );
}
async function sendAccountPassword(account, password) {
  if (process.env.COCKPIT_MAIL_DISABLED === "1")
    throw store.error("Mailversand ist in dieser Umgebung gesperrt.", 503);
  const config = settings();
  if (!config.enabled || !config.host || !config.senderEmail)
    throw store.error(
      "Bitte zuerst den SMTP-Versand einrichten und aktivieren.",
      503,
    );
  try {
    const result = await transport(config).sendMail({
      signal: AbortSignal.timeout(45000),
      from: { name: config.senderName, address: config.senderEmail },
      replyTo: config.replyTo || undefined,
      to: account.email,
      subject: "Wärmeverbund Cockpit – Startpasswort",
      text: [
        "Für dein Konto im Wärmeverbund Cockpit wurde ein Startpasswort erstellt.",
        "",
        "Benutzername: " + account.initials,
        "Startpasswort: " + password,
        "",
        "Lege bei der ersten Anmeldung ein eigenes Passwort fest.",
        config.baseUrl || process.env.COCKPIT_ORIGIN || "",
      ].join("\n"),
    });
    if (!result.accepted?.length)
      throw store.error("SMTP hat den Empfänger nicht angenommen.", 502);
  } catch (error) {
    throw store.error(mailError(error), 502);
  }
}
async function api(req, res, { body, json }) {
  const url = req.url.split("?")[0];
  if (!/^\/api\/(contacts|mail)(\/|$)/.test(url)) return false;
  const authorize = () => {
    const u = store.session(req, store.read());
    store.requireUser(u);
    if (
      req.headers["x-cockpit-account"] &&
      req.headers["x-cockpit-account"] !== u.id
    )
      throw store.error(
        "Anmeldung wurde in einem anderen Tab geändert. Bitte neu laden.",
        409,
      );
    if (
      req.method !== "GET" &&
      url.startsWith("/api/contacts") &&
      !canLead(u) &&
      !(url === "/api/contacts/order" && admin(u))
    )
      throw store.error(
        "Nur Personen mit der Rolle Leitung dürfen Betriebspersonal verwalten.",
        403,
      );
    if (url.startsWith("/api/mail") && !can(u, "smtp"))
      throw store.error("Keine Berechtigung für E-Mail-Einstellungen.", 403);
    return u;
  };
  let u = authorize();
  const input = async (max) => {
    const value = JSON.parse((await body(req, max)).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw store.error("Bitte ein gültiges JSON-Objekt übermitteln.");
    u = authorize();
    return value;
  };
  if (url.startsWith("/api/mail")) {
    if (!can(u, "smtp"))
      throw store.error("Keine Berechtigung für E-Mail-Einstellungen.", 403);
    if (url === "/api/mail" && req.method === "GET")
      json(res, 200, {
        settings: safeSettings(),
        deliveryBlocked: process.env.COCKPIT_MAIL_DISABLED === "1",
        status: db
          .prepare(
            "SELECT status,count(*) AS count FROM mail_outbox GROUP BY status",
          )
          .all(),
      });
    else if (url === "/api/mail" && req.method === "PUT") {
      const p = await input(64 * 1024);
      const old = settings();
      if (
        typeof p.enabled !== "boolean" ||
        !["tls", "starttls"].includes(p.encryption) ||
        !Number.isInteger(p.port) ||
        p.port < 1 ||
        p.port > 65535
      )
        throw store.error("Port und Verschlüsselung prüfen.");
      for (const k of ["host", "username", "senderName"])
        if (
          typeof p[k] !== "string" ||
          p[k].length > 254 ||
          /[\r\n]/.test(p[k])
        )
          throw store.error("Ungültige SMTP-Angaben.");
      if (p.host && !/^[a-zA-Z0-9.:-]+$/.test(p.host))
        throw store.error("Ungültiger SMTP-Host.");
      email(p.senderEmail, !p.enabled);
      email(p.replyTo);
      let base;
      try {
        base = new URL(p.baseUrl);
      } catch {
        throw store.error("Bitte eine gültige Basis-URL eingeben.");
      }
      if (
        !["https:", "http:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        (store.production && base.protocol !== "https:")
      )
        throw store.error("Ungültige Basis-URL. Produktion benötigt HTTPS.");
      if (p.enabled && !p.host) throw store.error("SMTP-Host erforderlich.");
      if (
        p.password !== undefined &&
        (typeof p.password !== "string" || p.password.length > 4096)
      )
        throw store.error("Ungültiges SMTP-Passwort.");
      if (p.clearPassword !== undefined && typeof p.clearPassword !== "boolean")
        throw store.error("Ungültige Passwortoption.");
      if (p.clearPassword && p.password)
        throw store.error("Passwort entweder ersetzen oder entfernen.");
      const value = {
        host: p.host,
        port: p.port,
        username: p.username,
        encryption: p.encryption,
        senderName: p.senderName,
        senderEmail: p.senderEmail,
        replyTo: p.replyTo || "",
        enabled: p.enabled,
        baseUrl: base.href.replace(/\/$/, ""),
        template: validatedMailTemplate(p.template, old.template),
        password: p.clearPassword
          ? undefined
          : p.password
            ? store.encrypt(p.password)
            : old.password,
      };
      store.locked(() => {
        u = authorize();
        db.prepare("INSERT OR REPLACE INTO mail_settings VALUES(1,?)").run(
          JSON.stringify(value),
        );
        store.audit(u, "mail.settings.changed");
      });
      json(res, 200, { settings: safeSettings() });
    } else if (url === "/api/mail/preview" && req.method === "POST") {
      const p = await input(64 * 1024),
        config = settings();
      json(
        res,
        200,
        logbookMessage(
          {
            kind: "Aufgabenzuweisung",
            title: "Aschebehälter kontrollieren",
            site: "Marzili / Eigerstrasse 73",
            actor: "WVM-admin",
            dueDate: "2026-11-23",
            description: "Beim nächsten Kontrollrundgang den Füllstand prüfen.",
          },
          "beispiel",
          config.baseUrl || "https://cockpit.example",
          validatedMailTemplate(p.template, config.template),
        ),
      );
    } else if (url === "/api/mail/test" && req.method === "POST") {
      if (process.env.COCKPIT_MAIL_DISABLED === "1")
        throw store.error(
          "Mailversand ist für diese Testumgebung gesperrt.",
          403,
        );
      const p = await input(2048),
        c = settings();
      email(p.to, false);
      if (!c.host || !c.senderEmail)
        throw store.error("Zuerst SMTP-Einstellungen speichern.");
      store.rate(req, "mail-test");
      try {
        await transport(c).sendMail({
          signal: AbortSignal.timeout(45000),
          from: { name: c.senderName, address: c.senderEmail },
          replyTo: c.replyTo || undefined,
          to: p.to,
          subject: "Wärmeverbund Cockpit – Test E-Mail",
          text: "Der SMTP-Mailversand funktioniert.",
        });
      } catch (e) {
        throw store.error(mailError(e), 502);
      }
      store.audit(u, "mail.test.sent");
      json(res, 200, { ok: true });
    } else throw store.error("Unbekannte Mailfunktion.", 404);
    return true;
  }
  if (url === "/api/contacts/order" && req.method === "PUT") {
    const p = await input(128 * 1024);
    store.locked(() => {
      if (!admin(authorize())) throw store.error("Keine Berechtigung.", 403);
      const rows = db
        .prepare("SELECT * FROM contacts")
        .all()
        .map((r) => ({ ...r, contact: JSON.parse(r.json) }))
        .filter((r) => r.contact.organization === p.organization);
      if (
        !Array.isArray(p.ids) ||
        p.ids.length !== rows.length ||
        new Set(p.ids).size !== rows.length ||
        !p.ids.every((id) => rows.some((r) => r.id === id))
      )
        throw store.error(
          "Die Kontaktliste wurde geändert. Bitte neu laden.",
          409,
        );
      const update = db.prepare(
        "UPDATE contacts SET json=?,version=version+1 WHERE id=?",
      );
      p.ids.forEach((id, order) => {
        const { contact } = rows.find((r) => r.id === id);
        update.run(JSON.stringify({ ...contact, order }), id);
      });
      store.audit(u, "contact.reordered", { organization: p.organization });
    });
    json(res, 200, { ok: true });
    return true;
  }
  if (url === "/api/contacts" && req.method === "GET") {
    json(res, 200, {
      contacts: db
        .prepare("SELECT json,version FROM contacts")
        .all()
        .map((r) => ({ ...JSON.parse(r.json), version: r.version })),
    });
    return true;
  }
  const image = url.match(/^\/api\/contacts\/images\/([a-zA-Z0-9-]+)$/);
  if (image && req.method === "GET") {
    const row = db
      .prepare("SELECT * FROM contact_images WHERE id=?")
      .get(image[1]);
    if (!row) throw store.error("Bild nicht gefunden.", 404);
    res.writeHead(200, {
      "Content-Type": row.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(Buffer.from(row.bytes));
    return true;
  }
  if (url === "/api/contacts/images" && req.method === "POST") {
    const bytes = await body(req, 2 * 1024 * 1024),
      mime = store.sniff(bytes);
    u = authorize();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
      throw store.error("Bitte PNG, JPEG oder WebP hochladen (max. 2 MB).");
    const id = crypto.randomUUID();
    const temporary = path.join(
      store.root,
      "files",
      id + ".upload-" + crypto.randomBytes(8).toString("hex"),
    );
    try {
      await fs.promises.writeFile(temporary, bytes, {
        flag: "wx",
        mode: 0o600,
      });
      await require("./server-scanner.cjs")(temporary, store.production);
      store.locked(() => {
        u = authorize();
        cleanupImages();
        const used = db
          .prepare(
            "SELECT coalesce(sum(length(bytes)),0) AS bytes FROM contact_images",
          )
          .get().bytes;
        const quota =
          Number(process.env.COCKPIT_CONTACT_IMAGE_QUOTA_MB || 128) *
          1024 *
          1024;
        if (
          !Number.isFinite(quota) ||
          quota <= 0 ||
          used + bytes.length > quota
        )
          throw store.error("Speicherlimit für Kontaktbilder erreicht.", 413);
        db.prepare(
          "INSERT INTO contact_images(id,mime,bytes,created) VALUES(?,?,?,?)",
        ).run(id, mime, bytes, Date.now());
        store.audit(u, "contact.image.uploaded", {
          id,
          mime,
          size: bytes.length,
        });
      });
    } finally {
      await fs.promises.unlink(temporary).catch(() => {});
    }
    json(res, 200, { id });
    return true;
  }
  const match = url.match(/^\/api\/contacts\/([a-zA-Z0-9-]+)$/);
  if (match && ["PUT", "DELETE"].includes(req.method)) {
    const p = await input(16384),
      id = match[1];
    if (!store.validId(id)) throw store.error("Ungültige Kontakt-ID.");
    store.locked(() => {
      u = authorize();
      const old = db.prepare("SELECT * FROM contacts WHERE id=?").get(id);
      if ((old?.version || 0) !== p.version)
        throw store.error(
          "Kontakt wurde zwischenzeitlich geändert. Bitte neu laden.",
          409,
        );
      if (req.method === "DELETE")
        db.prepare("DELETE FROM contacts WHERE id=?").run(id);
      else {
        if (!["WVM", "EWB"].includes(p.organization))
          throw store.error("Bitte Organisation wählen.");
        const value = { id, organization: p.organization };
        for (const k of [
          "name",
          "function",
          "email",
          "phone",
          "availability",
        ]) {
          if (
            typeof p[k] !== "string" ||
            p[k].length > 500 ||
            /[\r\n]/.test(p[k])
          )
            throw store.error("Ungültige Kontaktangaben.");
          value[k] = p[k].trim();
        }
        if (
          [
            value.name,
            value.function,
            value.email,
            value.phone,
            value.availability,
          ].some((field) => !field)
        )
          throw store.error(
            "Bitte alle Felder ausser dem Profilbild ausfüllen.",
          );
        email(value.email, false);
        if (!/^[+\d\s()./-]+$/.test(value.phone) || !/\d/.test(value.phone))
          throw store.error("Ungültige Telefonnummer.");
        if (
          p.imageId !== undefined &&
          (typeof p.imageId !== "string" ||
            (p.imageId && !store.validId(p.imageId)))
        )
          throw store.error("Ungültige Bild-ID.");
        if (
          p.imageId &&
          !db.prepare("SELECT id FROM contact_images WHERE id=?").get(p.imageId)
        )
          throw store.error("Bild nicht gefunden.");
        value.imageId = p.imageId || "";
        const previous = old && JSON.parse(old.json);
        if (previous?.organization === value.organization)
          value.order = previous.order;
        db.prepare("INSERT OR REPLACE INTO contacts VALUES(?,?,?)").run(
          id,
          JSON.stringify(value),
          (old?.version || 0) + 1,
        );
      }
      store.audit(
        u,
        "contact." + (req.method === "DELETE" ? "deleted" : "saved"),
        { id },
      );
    });
    json(res, 200, { ok: true });
    return true;
  }
  throw store.error("Unbekannte Kontaktfunktion.", 404);
}
const backupTables = [
  "collaboration_migrations",
  "contact_organizations",
  "contacts",
  "contact_images",
  "mail_settings",
  "mail_outbox",
  "mail_overdue_events",
];
function exportData() {
  return Object.fromEntries(
    backupTables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) =>
          table === "contact_images"
            ? { ...row, bytes: Buffer.from(row.bytes).toString("base64") }
            : row,
        ),
    ]),
  );
}
function restoreData(value) {
  for (const table of backupTables) {
    if (!Array.isArray(value[table]))
      throw Error("Unvollständige Kontaktsicherung.");
    for (const row of value[table]) {
      const keys = Object.keys(row);
      const actual = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      if (keys.some((k) => !actual.includes(k)))
        throw Error("Ungültige Sicherungsspalte.");
      db.prepare(
        `INSERT OR REPLACE INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      ).run(
        ...keys.map((k) =>
          table === "contact_images" && k === "bytes"
            ? Buffer.from(row[k], "base64")
            : row[k],
        ),
      );
    }
  }
}
module.exports = {
  api,
  migrate,
  validateUsers,
  changes,
  worker,
  overdue,
  can,
  main,
  settings,
  safeSettings,
  email,
  sendAccountPassword,
  exportData,
  restoreData,
};
