import { leadershipRequest as request } from "../services/repository.js";
import { canLead } from "../auth/roles.js";
export { canLead };

export function createLeadership({
  user,
  data,
  esc,
  options,
  fmt,
  show,
  modal,
  toast,
  openEntry,
}) {
  let overview,
    meeting,
    busy = false;
  const root = () => document.querySelector("#content");
  const active = () =>
    location.hash === "#leadership" || location.hash.startsWith("#leadership/");
  const date = (v) => (v ? fmt(v + "T12:00:00") : "Ohne Frist");
  const error = (e) => {
    const el = document.querySelector("#leadership-error");
    if (el) {
      el.textContent = e.message;
      el.scrollIntoView?.({ block: "nearest" });
    }
    toast(e.message);
  };
  async function run(action) {
    if (busy) return;
    busy = true;
    document
      .querySelectorAll("[data-lead-action]")
      .forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (e) {
      error(e);
    } finally {
      busy = false;
      document
        .querySelectorAll("[data-lead-action]")
        .forEach((b) => (b.disabled = false));
    }
  }
  async function download(m) {
    const blob = await request(`/meetings/${m.id}/pdf`);
    if (!active() || !canLead(user)) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `Fuehrungssitzung-${m.date}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function taskRows(list) {
    if (!list.length)
      return '<p class="muted">Keine Führungsaufgaben vorhanden.</p>';
    return `<div class="table-scroll"><table><thead><tr><th>Aufgabe</th><th>Verantwortlich</th><th>Frist</th><th>Status</th></tr></thead><tbody>${list.map((t) => `<tr><td><button data-task="${esc(t.id)}">${esc(t.title)}</button><small>${esc(t.priority)}</small></td><td>${esc(t.responsibleName)}</td><td>${esc(date(t.dueDate))}</td><td>${esc(t.status)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function home() {
    const open = overview.tasks.filter((t) => t.status !== "Erledigt");
    root().innerHTML = `<div class="page-heading"><div><div class="eyebrow">WVM · FÜHRUNG</div><h1>Austausch EPC + WVM</h1><p>Gemeinsam besprechen, entscheiden und nachverfolgen.</p></div><button class="primary" id="lead-new" data-lead-action>Jour fixe vorbereiten</button></div><p id="leadership-error" role="alert"></p><section class="panel leadership-panel"><h2>Sitzungsarchiv</h2>${overview.meetings.length ? `<div class="lead-meetings">${overview.meetings.map((m) => `<a class="lead-meeting" href="#leadership/${esc(m.id)}"><span><b>${esc(m.title)}</b><small>${esc(date(m.date))}</small></span><span>${m.status === "closed" ? "Abgeschlossen · PDF" : "Entwurf fortsetzen"} →</span></a>`).join("")}</div>` : '<p class="muted">Bereite eure erste Sitzung vor. Offene Logbuchpendenzen werden automatisch aufgenommen.</p>'}</section><section class="panel leadership-panel"><div class="page-heading"><h2>Führungsaufgaben</h2><button class="secondary" id="lead-task-new" data-lead-action>Neue Aufgabe</button></div>${taskRows(open)}<details><summary>Erledigte Aufgaben</summary>${taskRows(overview.tasks.filter((t) => t.status === "Erledigt"))}</details></section>`;
    document.querySelector("#lead-new").onclick = () =>
      run(async () => {
        const m = await request("/meetings", "POST", {});
        location.hash = "#leadership/" + m.id;
      });
    document.querySelector("#lead-task-new").onclick = () => taskForm();
    bindTasks();
  }
  async function save() {
    if (!meeting || meeting.status !== "draft") return;
    const form = document.querySelector("#lead-meeting-form");
    if (!form.reportValidity())
      throw Error("Bitte die Pflichtfelder ausfüllen.");
    const fields = form.elements;
    const input = { version: meeting.version };
    for (const key of [
      "title",
      "date",
      "participants",
      "agenda",
      "summary",
      "nextDate",
    ])
      input[key] = fields[key].value;
    input.items = meeting.items.map((item, i) => ({
      id: item.id,
      kind: item.kind,
      note: fields["note" + i].value,
      decision: fields["decision" + i].value,
      reviewed: fields["reviewed" + i].checked,
    }));
    meeting = await request("/meetings/" + meeting.id, "PUT", input);
    form.dataset.dirty = "";
  }
  function detail() {
    const closed = meeting.status === "closed",
      disabled = closed ? "disabled" : "";
    const itemHtml = meeting.items
      .map(
        (item, i) =>
          `<article class="lead-item ${item.reviewed ? "reviewed" : ""}"><div class="lead-item-heading"><div><small>${item.kind === "task" ? "FÜHRUNGSAUFGABE" : "LOGBUCH"} · ${esc(item.change)}</small><h3>${esc(item.title)}</h3></div><span class="lead-status">${esc(item.status)}</span></div><p class="muted">${esc(item.kind === "task" ? item.responsibleName : [item.site, item.plant].filter(Boolean).join(" / "))}${item.kind === "task" && item.priority ? " · " + esc(item.priority) : ""} · ${esc(date(item.dueDate))}</p><details><summary>Aktueller Stand zum Sitzungszeitpunkt</summary><p class="prewrap">${esc(item.description)}</p>${item.nextSteps ? `<p class="prewrap">Nächste Schritte: ${esc(item.nextSteps)}</p>` : ""}</details><div class="form-grid"><label>Besprechung<textarea name="note${i}" rows="2" maxlength="10000" ${disabled}>${esc(item.note)}</textarea></label><label>Beschluss / nächste Massnahme<textarea name="decision${i}" rows="2" maxlength="10000" ${disabled}>${esc(item.decision)}</textarea></label></div><div class="lead-item-actions"><label class="check-label"><input type="checkbox" name="reviewed${i}" ${item.reviewed ? "checked" : ""} ${disabled}> Besprochen</label>${!closed ? (item.kind === "task" ? `<button type="button" class="secondary" data-task="${esc(item.id)}">Aufgabe bearbeiten</button>` : `<button type="button" class="secondary" data-source="${esc(item.id)}">Logbuch öffnen</button><button type="button" class="secondary" data-task-source="${esc(item.id)}">Führungsaufgabe erstellen</button>`) : ""}</div></article>`,
      )
      .join("");
    root().innerHTML = `<a href="#leadership">← Austausch EPC + WVM</a><div class="page-heading"><div><div class="eyebrow">WVM · VERTRAULICH</div><h1>${closed ? "Sitzungsprotokoll" : "Sitzung vorbereiten & durchführen"}</h1><p>${closed ? `Abgeschlossen von ${esc(meeting.closedBy)}. Die Sitzungsdaten sind festgeschrieben. Das PDF wird nur zum Download erzeugt.` : meeting.previousDate ? `Rückblick seit ${esc(date(meeting.previousDate))}: offene Pendenzen sowie neue und geänderte Punkte.` : "Erste Sitzung: alle offenen Pendenzen und Abschlüsse der letzten 14 Tage."}</p></div>${closed ? '<button class="primary" id="lead-pdf" data-lead-action>PDF herunterladen</button>' : ""}</div><p id="leadership-error" role="alert"></p><form id="lead-meeting-form"><section class="panel leadership-panel"><div class="form-grid"><label>Titel<input name="title" value="${esc(meeting.title)}" required maxlength="180" ${disabled}></label><label>Sitzungsdatum<input name="date" type="date" value="${esc(meeting.date)}" required ${disabled}></label><label class="full">Teilnehmende<input name="participants" value="${esc(meeting.participants)}" required maxlength="2000" ${disabled}></label><label class="full">Traktanden, aktuelle Themen und offene Fragen<textarea name="agenda" rows="5" maxlength="30000" ${disabled}>${esc(meeting.agenda)}</textarea></label></div></section><section class="panel leadership-panel"><div class="page-heading"><div><h2>Pendenzen abarbeiten </h2><p>Offene Punkte bleiben sichtbar. Unveränderte erledigte Punkte werden in der Folgesitzung weggelassen.</p></div>${!closed ? '<button type="button" id="lead-refresh" class="secondary" data-lead-action>Pendenzen aktualisieren</button>' : ""}</div>${itemHtml || '<p class="muted">Keine Pendenzen zu besprechen.</p>'}${!closed ? '<button type="button" id="lead-task-new" class="secondary" data-lead-action>Neue Führungsaufgabe</button>' : ""}</section><section class="panel leadership-panel"><div class="form-grid"><label class="full">Zusammenfassung und weitere Beschlüsse<textarea name="summary" rows="5" maxlength="30000" ${disabled}>${esc(meeting.summary)}</textarea></label><label>Nächste Sitzung (optional)<input name="nextDate" type="date" value="${esc(meeting.nextDate)}" ${disabled}></label></div></section>${!closed ? '<div class="lead-footer"><span id="lead-save-status" role="status">Entwurf</span><button class="secondary" type="submit" data-lead-action>Entwurf speichern</button><button class="primary" type="button" id="lead-close" data-lead-action>Sitzung abschliessen & PDF herunterladen</button></div>' : ""}</form>`;
    const form = document.querySelector("#lead-meeting-form");
    form.oninput = () => {
      form.dataset.dirty = "true";
      const el = document.querySelector("#lead-save-status");
      if (el) el.textContent = "Ungespeicherte Änderungen";
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        await save();
        document.querySelector("#lead-save-status").textContent = "Gespeichert";
      });
    };
    if (closed) {
      document.querySelector("#lead-pdf").onclick = () =>
        run(() => download(meeting));
      return;
    }
    document.querySelector("#lead-refresh").onclick = () =>
      run(async () => {
        await save();
        meeting = await request(`/meetings/${meeting.id}/refresh`, "POST", {
          version: meeting.version,
        });
        detail();
        toast("Pendenzen aktualisiert. Geänderte Punkte bitte erneut prüfen.");
      });
    document.querySelector("#lead-close").onclick = () =>
      run(async () => {
        await save();
        if (meeting.items.some((i) => !i.reviewed))
          throw Error("Bitte alle Pendenzen als besprochen markieren.");
        show(
          '<div class="modal-heading"><h2>Sitzung abschliessen?</h2><button type="button" class="close icon-button">×</button></div><div class="form-body"><p>Die Sitzungsdaten werden festgeschrieben. Das PDF wird direkt heruntergeladen und nicht auf der Webseite gespeichert. Bitte legt es anschliessend intern ab.</p><p id="lead-close-error" role="alert"></p></div><div class="modal-footer"><button class="primary" id="lead-confirm-close">Abschliessen & PDF herunterladen</button></div>',
        );
        document.querySelector("#lead-confirm-close").onclick = async (e) => {
          e.currentTarget.disabled = true;
          try {
            meeting = await request(`/meetings/${meeting.id}/close`, "POST", {
              version: meeting.version,
            });
            modal.close();
            detail();
            toast(
              "Sitzung abgeschlossen. Der PDF-Download startet. Bitte intern ablegen.",
            );
            await download(meeting);
          } catch (err) {
            const el = document.querySelector("#lead-close-error");
            if (el) el.textContent = err.message;
            const button = document.querySelector("#lead-confirm-close");
            if (button) button.disabled = false;
            error(err);
          }
        };
      });
    document.querySelector("#lead-task-new").onclick = () =>
      run(async () => {
        await save();
        taskForm();
      });
    document.querySelectorAll("[data-source]").forEach(
      (b) =>
        (b.onclick = () =>
          run(async () => {
            await save();
            openEntry(b.dataset.source);
          })),
    );
    document.querySelectorAll("[data-task-source]").forEach(
      (b) =>
        (b.onclick = () =>
          run(async () => {
            await save();
            taskForm(null, b.dataset.taskSource);
          })),
    );
    bindTasks();
  }
  function bindTasks() {
    document.querySelectorAll("[data-task]").forEach(
      (b) =>
        (b.onclick = () =>
          run(async () => {
            await save();
            taskForm(overview.tasks.find((t) => t.id === b.dataset.task));
          })),
    );
  }
  function taskForm(task, sourceId = "") {
    const source = data.entries.find((e) => e.id === sourceId);
    show(
      `<form id="lead-task-form"><div class="modal-heading"><h2>${task ? "Führungsaufgabe bearbeiten" : "Neue Führungsaufgabe"}</h2><button type="button" class="close icon-button">×</button></div><div class="form-body form-grid"><label class="full">Titel<input name="title" required maxlength="180" value="${esc(task?.title || source?.title || "")}"></label><label class="full">Beschreibung<textarea name="description" rows="4" maxlength="20000">${esc(task?.description || "")}</textarea></label><label>Verantwortlich<select name="responsibleId" required>${options(
        overview.people.map((p) => [p.id, p.name]),
        task?.responsibleId || user.id,
      )}</select></label><label>Fällig am<input name="dueDate" type="date" value="${esc(task?.dueDate || "")}"></label><label>Status<select name="status">${options(["Pendenz", "In Bearbeitung", "Erledigt"], task?.status || "Pendenz")}</select></label><label>Priorität<select name="priority">${options(["Gering", "Mittel", "Hoch"], task?.priority || "Mittel")}</select></label><p class="full" id="lead-task-error" role="alert"></p></div><div class="modal-footer"><button class="primary" type="submit">Aufgabe speichern</button></div></form>`,
    );
    document.querySelector("#lead-task-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        await request(
          "/tasks" + (task ? "/" + task.id : ""),
          task ? "PUT" : "POST",
          {
            ...values,
            version: task?.version,
            meetingId: meeting?.id || null,
            sourceEntryId: task?.sourceEntryId || sourceId || null,
          },
        );
        overview = await request();
        if (meeting?.status === "draft")
          meeting = await request(`/meetings/${meeting.id}/refresh`, "POST", {
            version: meeting.version,
          });
        modal.close();
        if (meeting) detail();
        else home();
        toast("Aufgabe gespeichert.");
      } catch (e) {
        const el = document.querySelector("#lead-task-error");
        if (el) el.textContent = e.message;
        button.disabled = false;
      }
    };
  }
  async function render() {
    if (!active() || !canLead(user)) return;
    const target = root(),
      hash = location.hash;
    if (target.dataset.leadership === hash) return;
    target.dataset.leadership = hash;
    target.innerHTML = '<p role="status">Sitzungen werden geladen …</p>';
    meeting = null;
    try {
      const id = hash.split("/")[1];
      const results = await Promise.all([
        request(),
        id ? request("/meetings/" + encodeURIComponent(id)) : null,
      ]);
      if (
        !active() ||
        location.hash !== hash ||
        root() !== target ||
        !canLead(user)
      )
        return;
      [overview, meeting] = results;
      if (meeting) detail();
      else home();
    } catch (e) {
      if (location.hash !== hash || root() !== target) return;
      target.dataset.leadership = "";
      target.innerHTML = `<a href="#leadership">Zur Sitzungsübersicht</a><p role="alert">${esc(e.message)}</p>`;
    }
  }
  return {
    render,
    active,
    saveBeforeLeave: save,
    isDirty: () =>
      document.querySelector("#lead-meeting-form")?.dataset?.dirty === "true",
  };
}
