const crypto = require("node:crypto");
const store = require("./server-security.cjs");
const { canLead: allowed } = require("./src/auth/roles.js");
const digest = (value) => store.digest(JSON.stringify(value));
const rows = (table) =>
  store.db
    .prepare(`SELECT json FROM ${table}`)
    .all()
    .map((r) => JSON.parse(r.json));
const meetings = () => rows("leadership_meetings");
const tasks = () => rows("leadership_tasks");
const getMeeting = (id) => {
  const row = store.db
    .prepare("SELECT json FROM leadership_meetings WHERE id=?")
    .get(id);
  if (!row) throw store.error("Sitzung nicht gefunden.", 404);
  return JSON.parse(row.json);
};
function audit(user, action, id) {
  store.db
    .prepare(
      "INSERT INTO leadership_audit(at,actor,action,entity_id) VALUES(?,?,?,?)",
    )
    .run(new Date().toISOString(), user.id, action, id);
}
function putMeeting(m) {
  store.db
    .prepare(
      "INSERT INTO leadership_meetings(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
    )
    .run(m.id, JSON.stringify(m));
}
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw store.error("Bitte Pflichtfelder und maximale Textlängen beachten.");
  return value.trim();
}
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw store.error("Bitte ein gültiges Datum wählen.");
  return value;
}
function checkVersion(entity, version) {
  if (entity.version !== version)
    throw store.error(
      "Zwischenzeitlich geändert. Bitte neu laden; deine Eingaben bleiben bis dahin sichtbar.",
      409,
    );
}
function draft(m) {
  if (m.status !== "draft")
    throw store.error("Abgeschlossene Sitzungen sind unveränderlich.", 409);
}
function entrySnapshot(e, state) {
  return {
    kind: "entry",
    id: e.id,
    title: e.title,
    description: e.description || "",
    status: e.status,
    priority: e.priority,
    dueDate: e.dueDate || "",
    nextSteps: e.nextSteps || "",
    updatedAt: e.updatedAt || e.createdAt || "",
    site:
      state.data.structure?.sites.find((s) => s.id === e.siteId)?.name ||
      e.siteId,
    plant: state.data.plants.find((p) => p.id === e.plantId)?.name || "",
    completedAt: e.completedAt || "",
    attachments: (e.attachments || []).map((a) => ({ id: a.id, name: a.name })),
  };
}
function sourceState(state) {
  return [
    ...state.data.entries.map((e) => entrySnapshot(e, state)),
    ...tasks().map((t) => ({ ...t, kind: "task" })),
  ].sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
}
function prepare(state, previous, oldItems = []) {
  const sources = sourceState(state);
  const baseline = Object.fromEntries(
    sources.map((s) => [s.kind + ":" + s.id, digest(s)]),
  );
  const items = sources
    .filter((s) => {
      if (s.status !== "Erledigt") return true;
      if (previous) return previous.baseline[s.kind + ":" + s.id] !== digest(s);
      // Erstes Protokoll: offene Punkte und Abschlüsse der letzten 14 Tage.
      return (
        Date.parse(s.completedAt || s.updatedAt) >= Date.now() - 14 * 86400000
      );
    })
    .map((s) => {
      const key = s.kind + ":" + s.id;
      const old = oldItems.find((i) => i.kind === s.kind && i.id === s.id);
      return {
        ...s,
        change:
          previous?.baseline[key] === baseline[key]
            ? "Offen"
            : previous?.baseline[key]
              ? "Geändert"
              : "Neu",
        note: old?.note || "",
        decision: old?.decision || "",
        reviewed: !!old?.reviewed && digest(old.source) === digest(s),
        source: s,
      };
    });
  // Preserve meeting notes even if an operational administrator removes a source.
  for (const old of oldItems) {
    if (!sources.some((s) => s.kind === old.kind && s.id === old.id))
      items.push({
        ...old,
        removed: true,
        change: "Quelle entfernt",
        reviewed: old.removed ? old.reviewed : false,
      });
  }
  return { items, baseline, sourceToken: digest(baseline) };
}
function previousMeeting() {
  return (
    meetings()
      .filter((m) => m.status === "closed")
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0] || null
  );
}
function currentUser(req) {
  const u = store.session(req, store.read());
  store.requireUser(u);
  if (!allowed(u)) throw store.error("Nicht gefunden.", 404);
  if (
    req.headers["x-cockpit-account"] &&
    req.headers["x-cockpit-account"] !== u.id
  )
    throw store.error("Die Anmeldung wurde geändert. Bitte neu anmelden.", 409);
  return u;
}
function overview() {
  return {
    meetings: meetings()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date,
        status: m.status,
        closedAt: m.closedAt,
      })),
    tasks: tasks().sort((a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
    ),
    people: store
      .read()
      .data.users.filter((u) => allowed(u) && u.active !== false)
      .map((u) => ({ id: u.id, name: u.name })),
  };
}
module.exports = async function leadership(req, res, { body, json }) {
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/leadership")) return false;
  const user = currentUser(req);
  const route = url.slice("/api/leadership".length);
  if (route === "" && req.method === "GET") {
    json(res, 200, overview());
    return true;
  }
  if (route === "/meetings" && req.method === "POST") {
    const result = store.locked(() => {
      const actor = currentUser(req);
      const existing = meetings().find((m) => m.status === "draft");
      if (existing) return existing;
      const previous = previousMeeting();
      const m = {
        id: crypto.randomUUID(),
        title: "Führungssitzung",
        date:
          previous?.nextDate ||
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Zurich",
          }).format(new Date()),
        participants: store
          .read()
          .data.users.filter((u) => allowed(u) && u.active !== false)
          .map((u) => u.name)
          .join(", "),
        agenda: "",
        summary: "",
        nextDate: "",
        status: "draft",
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: actor.id,
        previousId: previous?.id || null,
        previousDate: previous?.date || null,
        ...prepare(store.read(), previous),
      };
      putMeeting(m);
      audit(actor, "meeting.created", m.id);
      return m;
    });
    json(res, 200, result);
    return true;
  }
  const taskMatch = route.match(/^\/tasks(?:\/([a-zA-Z0-9-]+))?$/);
  if (taskMatch && ["POST", "PUT"].includes(req.method)) {
    const input = JSON.parse((await body(req, 128 * 1024)).toString("utf8"));
    const result = store.locked(() => {
      const actor = currentUser(req),
        state = store.read();
      const old = taskMatch[1]
        ? tasks().find((t) => t.id === taskMatch[1])
        : null;
      if (taskMatch[1] && !old)
        throw store.error("Aufgabe nicht gefunden.", 404);
      if ((req.method === "PUT") !== !!old)
        throw store.error("Ungültige Anfrage.");
      if (old) checkVersion(old, input.version);
      const responsible = state.data.users.find(
        (u) => u.id === input.responsibleId && allowed(u) && u.active !== false,
      );
      if (!responsible)
        throw store.error("Bitte eine verantwortliche Person wählen.");
      if (
        !["Pendenz", "In Bearbeitung", "Erledigt"].includes(input.status) ||
        !["Gering", "Mittel", "Hoch"].includes(input.priority)
      )
        throw store.error("Ungültiger Status oder Priorität.");
      const meetingId = old?.meetingId || input.meetingId || null;
      if (meetingId) getMeeting(meetingId);
      const sourceEntryId = input.sourceEntryId || null;
      if (
        sourceEntryId &&
        sourceEntryId !== old?.sourceEntryId &&
        !state.data.entries.some((e) => e.id === sourceEntryId)
      )
        throw store.error("Logbucheintrag nicht gefunden.");
      const now = new Date().toISOString();
      const t = {
        id: old?.id || crypto.randomUUID(),
        title: text(input.title, 180, true),
        description: text(input.description, 20000),
        responsibleId: responsible.id,
        responsibleName: responsible.name,
        priority: input.priority,
        dueDate: input.dueDate ? date(input.dueDate) : "",
        status: input.status,
        meetingId,
        sourceEntryId,
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || now,
        updatedAt: now,
        completedAt: input.status === "Erledigt" ? old?.completedAt || now : "",
      };
      store.db
        .prepare(
          "INSERT INTO leadership_tasks(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
        )
        .run(t.id, JSON.stringify(t));
      audit(actor, old ? "task.updated" : "task.created", t.id);
      return t;
    });
    json(res, 200, result);
    return true;
  }
  const match = route.match(
    /^\/meetings\/([a-zA-Z0-9-]+)(?:\/(refresh|close|pdf))?$/,
  );
  if (match) {
    const [, id, action] = match;
    if (action === "pdf" && ["GET", "HEAD"].includes(req.method)) {
      const m = getMeeting(id);
      if (m.status !== "closed")
        throw store.error("PDF noch nicht vorhanden.", 404);
      const pdf = await require("./server-leadership-pdf.cjs").generate(m);
      currentUser(req);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Fuehrungssitzung-${m.date}-${id.slice(0, 8)}.pdf"`,
        "Content-Length": pdf.length,
        "Cache-Control": "private, no-store",
      });
      res.end(req.method === "HEAD" ? undefined : pdf);
      return true;
    }
    if (!action && req.method === "GET") {
      json(res, 200, getMeeting(id));
      return true;
    }
    if (
      (!action && req.method === "PUT") ||
      (["refresh", "close"].includes(action) && req.method === "POST")
    ) {
      const input = JSON.parse(
        (await body(req, 2 * 1024 * 1024)).toString("utf8"),
      );
      if (action === "close") {
        const m = getMeeting(id);
        draft(m);
        checkVersion(m, input.version);
        if (
          m.sourceToken !== prepare(store.read(), previousMeeting()).sourceToken
        )
          throw store.error(
            "Pendenzen wurden geändert. Bitte zuerst aktualisieren und prüfen.",
            409,
          );
        if (m.items.some((i) => !i.reviewed))
          throw store.error(
            "Bitte alle Pendenzen prüfen und als besprochen markieren.",
          );
        const closed = {
          ...m,
          status: "closed",
          closedAt: new Date().toISOString(),
          closedBy: user.name,
          version: m.version + 1,
        };
        // Validate generation before finalising; PDF bytes remain in memory only.
        await require("./server-leadership-pdf.cjs").generate(closed);
        store.locked(() => {
          const actor = currentUser(req),
            latest = getMeeting(id);
          draft(latest);
          checkVersion(latest, input.version);
          if (
            latest.sourceToken !==
            prepare(store.read(), previousMeeting()).sourceToken
          )
            throw store.error(
              "Pendenzen wurden während des Abschlusses geändert. Bitte aktualisieren.",
              409,
            );
          putMeeting(closed);
          audit(actor, "meeting.closed", id);
        });
        json(res, 200, closed);
        return true;
      }
      const result = store.locked(() => {
        const actor = currentUser(req),
          m = getMeeting(id);
        draft(m);
        checkVersion(m, input.version);
        if (action === "refresh")
          Object.assign(m, prepare(store.read(), previousMeeting(), m.items));
        else {
          m.title = text(input.title, 180, true);
          m.date = date(input.date);
          m.participants = text(input.participants, 2000, true);
          m.agenda = text(input.agenda, 30000);
          m.summary = text(input.summary, 30000);
          m.nextDate = input.nextDate ? date(input.nextDate) : "";
          if (
            !Array.isArray(input.items) ||
            input.items.length !== m.items.length
          )
            throw store.error("Ungültige Pendenzenliste.");
          const seen = new Set();
          for (const item of input.items) {
            const key = item.kind + ":" + item.id;
            const target = m.items.find(
              (i) => i.id === item.id && i.kind === item.kind,
            );
            if (!target || seen.has(key) || typeof item.reviewed !== "boolean")
              throw store.error("Ungültige Pendenz.");
            seen.add(key);
            target.note = text(item.note, 10000);
            target.decision = text(item.decision, 10000);
            target.reviewed = item.reviewed;
          }
        }
        m.version++;
        putMeeting(m);
        audit(
          actor,
          action === "refresh" ? "meeting.refreshed" : "meeting.saved",
          id,
        );
        return m;
      });
      json(res, 200, result);
      return true;
    }
  }
  throw store.error("Nicht gefunden.", 404);
};
module.exports.allowed = allowed;
