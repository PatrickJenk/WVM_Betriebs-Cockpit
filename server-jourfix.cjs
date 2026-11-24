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
const templateId = (kind) => "jourfix-template-" + kind;
function allowed(user, kind, settings = config()) {
  return (
    isAdministrator(user) ||
    (settings.access[kind]?.includes(user.id) ??
      (kind === "epc" && canLead(user)))
  );
}
const activeUsers = (state) =>
  state.data.users.filter((u) => u.active !== false && !u.backupAdmin);
const text = (v, max) => {
  if (typeof v !== "string" || v.length > max)
    throw store.error("Ungültige Eingabe oder Text zu lang.");
  return v.trim();
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
    if (
      !person ||
      !attendance.includes(p.status) ||
      typeof p.mail !== "boolean"
    )
      throw store.error("Ungültige Person oder Anwesenheit.");
    return { id: person.id, name: person.name, status: p.status, mail: p.mail };
  });
  if (new Set(selected.map((p) => p.id)).size !== selected.length)
    throw store.error("Doppelte Teilnehmende.");
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    throw store.error("Ungültige Uhrzeit.");
  return {
    ...meeting,
    version: meeting.version + 1,
    date: date(input.date),
    time: text(input.time, 5),
    chair: text(input.chair, 200),
    people: selected,
    agenda: text(input.agenda, 50000),
    decisions: text(input.decisions, 50000),
    topics: text(input.topics, 50000),
    nextDate: input.nextDate ? date(input.nextDate) : "",
    summary: text(input.summary, 50000),
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
      if (value.template !== undefined) {
        if (value.template === "")
          store.db
            .prepare("DELETE FROM leadership_meetings WHERE id=?")
            .run(templateId(kind));
        else {
          const bytes = Buffer.from(text(value.template, 1900000), "base64");
          put(templateId(kind), {
            file: bytes.toString("base64"),
            questions: require("./server-jourfix-word.cjs")(bytes),
          });
        }
      }
      store.audit(user, "jourfix.settings", { kind });
      state.revision++;
      store.persist(state);
    });
    return response({ ok: true });
  }
  if (id === "template" && ["GET", "HEAD"].includes(req.method)) {
    const template = read(templateId(kind));
    if (!template) throw store.error("Keine Word-Vorlage hinterlegt.", 404);
    sendFile(
      req,
      res,
      Buffer.from(template.file, "base64"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Jourfix-Vorlage.docx",
    );
    return true;
  }
  if (!id && req.method === "GET") {
    const settings = config();
    const people = activeUsers(state);
    return response({
      title: titles[kind],
      template: !!store.db
        .prepare("SELECT 1 FROM leadership_meetings WHERE id=?")
        .get(templateId(kind)),
      people: people
        .filter((u) => isAdministrator(user) || allowed(u, kind, settings))
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: !!u.email,
          admin: isAdministrator(u),
          access: allowed(u, kind, settings),
        })),
      networks: (state.data.structure?.networks || [])
        .filter((n) => !n.deleted && !n.hidden)
        .map((n) => ({ id: n.id, name: n.name })),
      meetings: records()
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
        if (existing) return existing;
        const previous = list
          .filter((m) => m.status === "closed")
          .sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
        const now = new Date();
        const questions = read(templateId(kind))?.questions || "";
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
          agenda: kind === "epc" ? questions : "",
          topics: kind === "wvm" ? questions : "",
          decisions: "",
          summary: "",
          nextDate: "",
          items: previous?.items.filter((p) => p.status !== "Erledigt") || [],
        };
        put(meeting.id, meeting);
        return meeting;
      }),
    );
  const meetingForRoute = () => {
    const meeting = read(id);
    if (
      !meeting ||
      (meeting.jourfix !== kind &&
        !(
          kind === "epc" &&
          action === "pdf" &&
          !meeting.jourfix &&
          meeting.status === "closed"
        ))
    )
      throw store.error("Sitzung nicht gefunden.", 404);
    return meeting;
  };
  const meeting = meetingForRoute();
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
  if (!action && req.method === "GET") return response(meeting);
  if (!action && req.method === "PUT") {
    const value = await input();
    return response(
      store.locked(() => {
        const { state } = authorize(kind);
        const saved = update(meetingForRoute(), value, state);
        put(id, saved);
        return saved;
      }),
    );
  }
  if (action === "close" && req.method === "POST") {
    const value = await input();
    const saved = update(meeting, value, state);
    if (!saved.time || (kind === "epc" && !saved.chair))
      throw store.error(
        "Bitte Uhrzeit und gegebenenfalls Sitzungsleitung eintragen.",
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
          (u) =>
            closed.people.some((p) => p.id === u.id && p.mail) &&
            u.email &&
            allowed(u, kind),
        );
        put(id, closed, pdf);
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
        return { ...closed, queued: recipients.length };
      }),
    );
  }
  throw store.error("Nicht gefunden.", 404);
};
module.exports.allowed = allowed;
