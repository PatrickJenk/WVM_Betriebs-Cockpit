const crypto = require("node:crypto");
const store = require("./server-security.cjs");
const { isAdministrator, canLead } = require("./src/auth/roles.js");
const { generate } = require("./server-leadership-pdf.cjs");
const titles = { epc: "Betriebsjourfix WVM + EPC", wvm: "Jourfix Betrieb WVM" };
const statuses = ["Offen", "In Bearbeitung", "Terminieren", "Erledigt"];
const attendance = ["Anwesend", "Entschuldigt", "Abwesend", "Offen"];
const configId = "jourfix-config";
const records = () =>
  store.db
    .prepare(
      "SELECT json FROM leadership_meetings WHERE json_extract(json, '$.status') IS NOT NULL",
    )
    .all()
    .map((r) => JSON.parse(r.json));
const read = (id) => {
  const row = store.db
    .prepare("SELECT json FROM leadership_meetings WHERE id=?")
    .get(id);
  return row && JSON.parse(row.json);
};
const put = (id, value, pdf = null) =>
  store.db
    .prepare(
      "INSERT INTO leadership_meetings(id,json,pdf) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,pdf=excluded.pdf",
    )
    .run(id, JSON.stringify(value), pdf);
const config = () => read(configId) || { access: {} };
const agendaId = "jourfix-agenda-epc";
const canPrepare = (user) => isAdministrator(user) || canLead(user);
const agendaFor = (meeting) =>
  meeting.agendaItems ||
  (meeting.agenda
    ? [{ id: "legacy", title: "Bisherige Traktanden", notes: meeting.agenda }]
    : []);
const editableFields = [
  "date",
  "time",
  "chair",
  "people",
  "decisions",
  "topics",
  "summary",
  "nextDate",
  "items",
];
function publicMeeting(meeting) {
  return { ...meeting, agendaItems: agendaFor(meeting) };
}
function patchInput(meeting, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw store.error("Ungültige Protokolländerung.");
  const input = {
    ...meeting,
    agendaItems: agendaFor(meeting).map((item) => ({ ...item })),
  };
  for (const [key, change] of Object.entries(patch)) {
    if (!change || !Object.hasOwn(change, "value"))
      throw store.error("Ungültige Protokolländerung.");
    if (key === "agendaOrder") {
      const items = new Map(input.agendaItems.map((item) => [item.id, item]));
      const ids = [...items.keys()];
      if (
        !Array.isArray(change.value) ||
        change.value.length !== ids.length ||
        new Set(change.value).size !== ids.length ||
        change.value.some((id) => !items.has(id)) ||
        (JSON.stringify(ids) !== JSON.stringify(change.base) &&
          JSON.stringify(ids) !== JSON.stringify(change.value))
      )
        throw store.error(
          "Die Traktandenliste wurde gleichzeitig geändert. Bitte zuerst neu laden.",
          409,
        );
      input.agendaItems = change.value.map((id) => items.get(id));
      continue;
    }
    const note =
      key.startsWith("note:") &&
      input.agendaItems.find((item) => item.id === key.slice(5));
    if (!note && !editableFields.includes(key))
      throw store.error("Ungültiges Protokollfeld.");
    const current = note ? note.notes : input[key];
    const comparable =
      key === "people"
        ? current.map(({ id, status }) => ({ id, status }))
        : key === "items"
          ? current.map(({ title, responsible, due, status, networks }) => ({
              title,
              responsible,
              due,
              status,
              networks,
            }))
          : current;
    if (
      JSON.stringify(comparable) !== JSON.stringify(change.base) &&
      JSON.stringify(comparable) !== JSON.stringify(change.value)
    )
      throw store.error(
        "Ein Protokollfeld wurde gleichzeitig geändert. Deine Eingabe bleibt sichtbar. Lade die Sitzung neu, um den gespeicherten Stand zu sehen.",
        409,
      );
    if (note) note.notes = change.value;
    else input[key] = change.value;
  }
  return input;
}
function allowed(user, kind, settings = config()) {
  return (
    isAdministrator(user) ||
    (settings.access[kind]?.includes(user.id) ??
      (kind === "epc" && canLead(user)))
  );
}
const activeUsers = (state) =>
  state.data.users.filter((u) => u.active !== false && !u.backupAdmin);
const text = (v, max, trim = true) => {
  if (typeof v !== "string" || v.length > max)
    throw store.error("Ungültige Eingabe oder Text zu lang.");
  return trim ? v.trim() : v;
};
const date = (v) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw store.error("Bitte ein gültiges Datum eingeben.");
  return v;
};
function update(meeting, input, state) {
  if (meeting.status !== "draft" || meeting.version !== input.version)
    throw store.error(
      "Die Sitzung wurde zwischenzeitlich geändert oder abgeschlossen. Bitte neu laden.",
      409,
    );
  if (!Array.isArray(input.people) || !Array.isArray(input.items))
    throw store.error("Ungültige Teilnehmer- oder Pendenzenliste.");
  const people = activeUsers(state);
  const networks = state.data.structure?.networks || [];
  const selected = input.people.map((p) => {
    const person =
      people.find((u) => u.id === p.id) ||
      meeting.people.find((u) => u.id === p.id);
    if (!person || !attendance.includes(p.status))
      throw store.error("Ungültige Person oder Anwesenheit.");
    return { id: person.id, name: person.name, status: p.status };
  });
  if (new Set(selected.map((p) => p.id)).size !== selected.length)
    throw store.error("Doppelte Teilnehmende.");
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    throw store.error("Ungültige Uhrzeit.");
  const currentAgenda = agendaFor(meeting);
  const currentItems = new Map(currentAgenda.map((item) => [item.id, item]));
  const submittedAgenda = new Map(
    (Array.isArray(input.agendaItems) ? input.agendaItems : []).map((item) => [
      item?.id,
      item,
    ]),
  );
  const agendaItems =
    submittedAgenda.size === currentItems.size &&
    [...submittedAgenda.keys()].every((id) => currentItems.has(id))
      ? [...submittedAgenda.keys()].map((id) => currentItems.get(id))
      : currentAgenda;
  return {
    ...meeting,
    version: meeting.version + 1,
    date: date(input.date),
    time: text(input.time, 5),
    chair: text(input.chair, 200),
    people: selected,
    agenda: meeting.agenda || "",
    agendaItems: agendaItems.map((item) => ({
      ...item,
      notes: text(
        submittedAgenda.get(item.id)?.notes ?? item.notes,
        50000,
        false,
      ),
    })),
    decisions: text(input.decisions, 50000, false),
    topics: text(input.topics, 50000, false),
    nextDate: input.nextDate ? date(input.nextDate) : "",
    summary: text(input.summary, 50000, false),
    items: input.items.map((item) => {
      if (
        !statuses.includes(item.status) ||
        !Array.isArray(item.networks) ||
        item.networks.some((id) => typeof id !== "string" || id.length > 100)
      )
        throw store.error("Ungültige Pendenz.");
      const ids = item.networks.includes("*")
        ? ["*"]
        : [...new Set(item.networks)];
      return {
        title: text(item.title, 10000),
        responsible: text(item.responsible, 1000),
        status: item.status,
        due: item.due ? date(item.due) : "",
        networks: ids,
        networkNames: ids.map((id) =>
          id === "*"
            ? "Übergeordnet / Alle"
            : networks.find((n) => n.id === id)?.name || id,
        ),
      };
    }),
  };
}
function sendFile(req, res, bytes, mime, filename) {
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": bytes.length,
    "Content-Disposition": 'attachment; filename="' + filename + '"',
    "Cache-Control": "private, no-store",
  });
  res.end(req.method === "HEAD" ? undefined : bytes);
}
module.exports = async function jourfix(req, res, { body, json }) {
  const route = req.url.split("?")[0].slice("/api/leadership/jourfix".length);
  const authorize = (kind, adminOnly = false) => {
    const state = store.read();
    const user = store.session(req, state);
    store.requireUser(user);
    if (
      req.headers["x-cockpit-account"] &&
      req.headers["x-cockpit-account"] !== user.id
    )
      throw store.error("Die Anmeldung wurde geändert.", 409);
    if ((adminOnly && !isAdministrator(user)) || (kind && !allowed(user, kind)))
      throw store.error("Nicht gefunden.", 404);
    return { user, state };
  };
  const response = (value) => {
    json(res, 200, value);
    return true;
  };
  const input = async () =>
    JSON.parse((await body(req, 2 * 1024 * 1024)).toString("utf8"));
  if (route === "" && req.method === "GET") {
    const { user } = authorize();
    return response({
      access: Object.keys(titles).filter((kind) => allowed(user, kind)),
    });
  }
  const match = route.match(
    /^\/(epc|wvm)(?:\/([a-zA-Z0-9-]+))?(?:\/(pdf|close))?$/,
  );
  if (!match) throw store.error("Nicht gefunden.", 404);
  const [, kind, id, action] = match;
  let { user, state } = authorize(kind);
  if (id === "settings" && req.method === "PUT") {
    authorize(kind, true);
    const value = await input();
    store.locked(() => {
      ({ state, user } = authorize(kind, true));
      const settings = config();
      if (value.access !== undefined) {
        if (
          !Array.isArray(value.access) ||
          value.access.some(
            (id) => !activeUsers(state).some((u) => u.id === id),
          )
        )
          throw store.error("Ungültige Zugriffsliste.");
        settings.access[kind] = [...new Set(value.access)];
        put(configId, settings);
      }
      store.audit(user, "jourfix.settings", { kind });
      state.revision++;
      store.persist(state);
    });
    return response({ ok: true });
  }
  if (kind === "epc" && id === "agenda" && req.method === "POST") {
    const value = await input();
    const title = text(value.title, 300);
    if (!title) throw store.error("Bitte ein Traktandum eingeben.");
    return response(
      store.locked(() => {
        authorize(kind);
        const draft = records().find(
          (m) => m.jourfix === kind && m.status === "draft",
        );
        const item = { id: crypto.randomUUID(), title, notes: "" };
        if (draft) {
          draft.agendaItems = [...agendaFor(draft), item];
          draft.version++;
          put(draft.id, draft);
        } else {
          const pending = read(agendaId) || [];
          put(agendaId, [...pending, item]);
        }
        return { ok: true };
      }),
    );
  }
  if (!id && req.method === "GET") {
    const settings = config();
    const people = activeUsers(state);
    const meetings = records();
    const draft = meetings.find(
      (m) => m.jourfix === kind && m.status === "draft",
    );
    return response({
      title: titles[kind],
      canPrepare: canPrepare(user),
      upcoming:
        kind === "epc"
          ? (draft ? agendaFor(draft) : read(agendaId) || []).map(
              ({ id, title }) => ({ id, title }),
            )
          : [],
      people: people.map((u) => ({
        id: u.id,
        name: u.name,
        admin: isAdministrator(u),
        access: allowed(u, kind, settings),
      })),
      networks: (state.data.structure?.networks || [])
        .filter((n) => !n.deleted && !n.hidden)
        .map((n) => ({ id: n.id, name: n.name })),
      meetings: meetings
        .filter(
          (m) =>
            m.jourfix === kind ||
            (kind === "epc" && !m.jourfix && m.status === "closed"),
        )
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.createdAt.localeCompare(a.createdAt),
        )
        .map((m) => ({
          id: m.id,
          date: m.date,
          time: m.time,
          status: m.status,
          open: m.open !== false,
          title: m.title,
        })),
    });
  }
  if (!id && req.method === "POST")
    return response(
      store.locked(() => {
        ({ user, state } = authorize(kind));
        const list = records().filter((m) => m.jourfix === kind);
        const existing = list.find((m) => m.status === "draft");
        if (existing && existing.open !== false) return publicMeeting(existing);
        if (kind === "epc" && !canPrepare(user))
          throw store.error("Die Leitung bereitet den Jourfix vor.", 403);
        if (existing) return publicMeeting(existing);
        const previous = list
          .filter((m) => m.status === "closed")
          .sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
        const now = new Date();

        const meeting = {
          id: crypto.randomUUID(),
          jourfix: kind,
          title: titles[kind],
          status: "draft",
          version: 1,
          createdAt: now.toISOString(),
          date:
            previous?.nextDate ||
            new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Europe/Zurich",
            }).format(now),
          time: "",
          chair: "",
          people: [],
          open: kind !== "epc",
          agenda: "",
          agendaItems: kind === "epc" ? read(agendaId) || [] : [],
          topics: "",
          decisions: "",
          summary: "",
          nextDate: "",
          items:
            kind === "wvm"
              ? previous?.items.filter((p) => p.status !== "Erledigt") || []
              : [],
        };
        put(meeting.id, meeting);
        if (kind === "epc")
          store.db
            .prepare("DELETE FROM leadership_meetings WHERE id=?")
            .run(agendaId);
        return publicMeeting(meeting);
      }),
    );
  const meetingForRoute = () => {
    const meeting = read(id);
    if (
      !meeting ||
      (meeting.jourfix !== kind &&
        !(
          kind === "epc" &&
          (action === "pdf" || req.method === "DELETE") &&
          !meeting.jourfix &&
          meeting.status === "closed"
        ))
    )
      throw store.error("Sitzung nicht gefunden.", 404);
    return meeting;
  };
  const meeting = meetingForRoute();
  const checkPreparation = (actor, current) => {
    if (current.open === false && !canPrepare(actor))
      throw store.error(
        "Die Leitung hat das Protokoll noch nicht geöffnet.",
        403,
      );
  };
  checkPreparation(user, meeting);
  if (
    action === "pdf" &&
    ["GET", "HEAD"].includes(req.method) &&
    meeting.status === "closed"
  ) {
    const pdf =
      store.db.prepare("SELECT pdf FROM leadership_meetings WHERE id=?").get(id)
        .pdf || (await generate(meeting));
    authorize(kind);
    sendFile(
      req,
      res,
      pdf,
      "application/pdf",
      "Jourfix-" + meeting.date + ".pdf",
    );
    return true;
  }
  if (!action && req.method === "DELETE") {
    return response(
      store.locked(() => {
        const { user } = authorize(kind, true);
        const current = meetingForRoute();
        if (current.status !== "closed")
          throw store.error(
            "Nur abgeschlossene Sitzungen können gelöscht werden.",
            409,
          );
        store.db.prepare("DELETE FROM leadership_meetings WHERE id=?").run(id);
        store.db
          .prepare(
            "UPDATE mail_outbox SET status='skipped' WHERE entry_id=? AND kind='Jourfix-Protokoll' AND status IN ('pending','retry')",
          )
          .run(id);
        store.audit(user, "jourfix.deleted", { id, kind });
        return { ok: true };
      }),
    );
  }
  if (!action && req.method === "GET") return response(publicMeeting(meeting));
  if (!action && ["PUT", "PATCH"].includes(req.method)) {
    const value = await input();
    return response(
      store.locked(() => {
        const { state, user } = authorize(kind);
        const current = meetingForRoute();
        checkPreparation(user, current);
        const saved = update(
          current,
          req.method === "PATCH" ? patchInput(current, value.changes) : value,
          state,
        );
        if (value.publish === true && current.open === false) {
          if (!saved.time) throw store.error("Bitte die Uhrzeit eingeben.");
          saved.open = true;
        }
        put(id, saved);
        return publicMeeting(saved);
      }),
    );
  }
  if (action === "close" && req.method === "POST") {
    const value = await input();
    if (meeting.open === false)
      throw store.error("Bitte zuerst den Entwurf bereitstellen.");
    const saved = update(
      meeting,
      Object.hasOwn(value, "items")
        ? value
        : { ...meeting, version: value.version },
      state,
    );
    if (!saved.time) throw store.error("Bitte die Uhrzeit eingeben.");
    // An untouched insert row is just a placeholder, even if autosaved.
    saved.items = saved.items.filter(
      (p) =>
        p.title ||
        p.responsible ||
        p.due ||
        p.networks.length ||
        p.status !== "Offen",
    );
    if (saved.items.some((p) => !p.title))
      throw store.error("Bitte leere Pendenzen ausfüllen oder entfernen.");
    const closed = {
      ...saved,
      status: "closed",
      closedAt: new Date().toISOString(),
      closedBy: user.name,
    };
    const pdf = await generate(closed);
    return response(
      store.locked(() => {
        ({ user, state } = authorize(kind));
        const latest = meetingForRoute();
        if (latest.status !== "draft" || latest.version !== value.version)
          throw store.error(
            "Die Sitzung wurde zwischenzeitlich geändert.",
            409,
          );
        const recipients = activeUsers(state).filter(
          (u) => closed.people.some((p) => p.id === u.id) && u.email,
        );
        put(id, closed, pdf);
        if (kind === "epc")
          store.db
            .prepare("DELETE FROM leadership_meetings WHERE id=?")
            .run(agendaId);
        const enqueue = store.db.prepare(
          "INSERT INTO mail_outbox(event_key,user_id,entry_id,kind,payload) VALUES(?,?,?,?,?)",
        );
        for (const recipient of recipients)
          enqueue.run(
            "jourfix:" + id + ":" + recipient.id,
            recipient.id,
            id,
            "Jourfix-Protokoll",
            "{}",
          );
        store.audit(user, "jourfix.closed", { id, kind });
        return {
          ...closed,
          queued: recipients.length,
          missingEmail: closed.people.length - recipients.length,
        };
      }),
    );
  }
  throw store.error("Nicht gefunden.", 404);
};
module.exports.allowed = allowed;
