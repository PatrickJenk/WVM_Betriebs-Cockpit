import { leadershipRequest as request } from "../services/repository.js";
import { isAdministrator } from "../auth/roles.js";

const attendance = ["Offen", "Anwesend", "Entschuldigt", "Abwesend"];
const statuses = ["Offen", "In Bearbeitung", "Terminieren", "Erledigt"];
const freshItem = () => ({
  title: "",
  responsible: "",
  due: "",
  status: "Offen",
  networks: [],
});

export function createJourfix({ user, esc, toast }) {
  let meeting,
    overview,
    form,
    busy = false,
    renderToken = 0,
    baseline,
    syncInFlight,
    editTimer,
    syncError = false,
    overviewLoading = false;
  const fields = [
    "date",
    "time",
    "chair",
    "decisions",
    "topics",
    "summary",
    "nextDate",
  ];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const match = () =>
    location.hash.match(/^#jourfix\/(epc|wvm)(?:\/([a-zA-Z0-9-]+))?$/);
  const active = () => !!match();
  const path = (kind, suffix = "") => "/jourfix/" + kind + suffix;
  const options = (values, selected) =>
    values
      .map(
        (v) =>
          `<option value="${esc(v)}" ${selected === v ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("");
  const field = (name, label, type = "text") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(meeting[name])}" ${name === "date" ? "required" : ""}></label>`;
  const area = (name, label) =>
    `<label class="full">${label}<textarea name="${name}" rows="4" maxlength="50000">${esc(meeting[name])}</textarea></label>`;
  const fullDate = (d) => d?.split("-").reverse().join(".") || "";
  function showError(error) {
    const status = document.querySelector("#jourfix-status");
    if (status) status.textContent = error.message;
    toast(error.message);
  }
  async function download(endpoint, filename) {
    const url = URL.createObjectURL(await request(endpoint));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const action = (fn) => async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await fn(event);
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  };
  function home(root, kind) {
    const admin = isAdministrator(user);
    const open = overview.meetings.find((m) => m.status === "draft" && m.open);
    const archive = overview.meetings.filter((m) => m.status === "closed");
    root.innerHTML = `<div class="page-heading"><h1>${esc(overview.title)}</h1>
        ${!open && (overview.canPrepare || kind === "wvm") ? '<button id="jourfix-new" class="primary">Jourfix vorbereiten</button>' : ""}</div>
      <p id="jourfix-status" role="status"></p>
      ${
        open
          ? `<section class="panel leadership-panel"><h2>Offenes Sitzungsprotokoll</h2>
        <p>${esc(fullDate(open.date))} ${esc(open.time || "")}</p><a class="secondary" href="#jourfix/${kind}/${esc(open.id)}">Protokoll öffnen</a></section>`
          : ""
      }
      ${
        kind === "epc"
          ? `<section class="panel leadership-panel"><h2>Traktanden für die nächste Sitzung</h2>
        <ol>${overview.upcoming.map((item) => `<li>${esc(item.title)}</li>`).join("")}</ol>
        <form id="jourfix-agenda"><label>Neues Traktandum<input name="title" maxlength="300" required></label><button class="secondary">Traktandum hinzufügen</button></form></section>`
          : ""
      }
      <section class="panel leadership-panel"><h2>Sitzungsarchiv</h2>
      ${archive.map((m) => `<p><button class="secondary" data-jourfix-pdf="${esc(m.id)}">PDF herunterladen</button> ${esc(fullDate(m.date))} ${esc(m.time || "")} · ${esc(m.title)} ${admin ? `<button type="button" class="danger-button" data-delete-session="${esc(m.id)}" aria-label="Sitzung vom ${esc(fullDate(m.date))} löschen">Löschen</button>` : ""}</p>`).join("") || "<p>Keine abgeschlossenen Sitzungen vorhanden.</p>"}</section>
      ${
        admin
          ? `<details class="panel leadership-panel"><summary>Zugriff verwalten</summary>
        <form id="jourfix-access"><h2>Zugriff freigeben</h2><div class="jourfix-people">
        ${overview.people.map((p) => `<label class="check-label"><input type="checkbox" name="access" value="${esc(p.id)}" ${p.access ? "checked" : ""} ${p.admin ? "disabled" : ""}>${esc(p.name)}${p.admin ? " (Admin)" : ""}</label>`).join("")}
        </div><button class="secondary">Zugriff speichern</button></form></details>`
          : ""
      }`;
    const newButton = root.querySelector("#jourfix-new");
    if (newButton)
      newButton.onclick = action(async () => {
        const draft = await request(path(kind), "POST");
        location.hash = "#jourfix/" + kind + "/" + draft.id;
      });
    const agendaForm = root.querySelector("#jourfix-agenda");
    if (agendaForm)
      agendaForm.onsubmit = action(async () => {
        await request(path(kind, "/agenda"), "POST", {
          title: agendaForm.elements.namedItem("title").value,
        });
        await render(true);
      });
    root.querySelectorAll("[data-jourfix-pdf]").forEach((button) => {
      button.onclick = action(() =>
        download(
          path(kind, "/" + button.dataset.jourfixPdf + "/pdf"),
          "Jourfix-" + button.dataset.jourfixPdf.slice(0, 8) + ".pdf",
        ),
      );
    });
    root.querySelectorAll("[data-delete-session]").forEach((button) => {
      button.onclick = action(async () => {
        if (
          !confirm("Dieses Sitzungsprotokoll endgültig aus dem Archiv löschen?")
        )
          return;
        await request(path(kind, "/" + button.dataset.deleteSession), "DELETE");
        await render(true);
        toast("Sitzungsprotokoll gelöscht.");
      });
    });
    if (admin)
      root.querySelector("#jourfix-access").onsubmit = action(async (e) => {
        await request(path(kind, "/settings"), "PUT", {
          access: new FormData(e.currentTarget).getAll("access"),
        });
        toast("Zugriff gespeichert.");
      });
  }
  function row(item, kind) {
    const networkChoices = [
      { id: "*", name: "Übergeordnet / Alle" },
      ...overview.networks,
    ];
    for (const [index, id] of item.networks.entries()) {
      if (!networkChoices.some((n) => n.id === id))
        networkChoices.push({ id, name: item.networkNames?.[index] || id });
    }
    return `<tr data-jourfix-item>
      ${kind === "wvm" ? `<td><details><summary>Wärmeverbünde</summary>${networkChoices.map((n) => `<label class="check-label"><input type="checkbox" name="network" value="${esc(n.id)}" ${item.networks.includes(n.id) ? "checked" : ""}>${esc(n.name)}</label>`).join("")}</details></td>` : ""}
      <td><textarea name="title" aria-label="Pendenz" rows="2">${esc(item.title)}</textarea></td>
      <td><input name="responsible" aria-label="Verantwortlich" value="${esc(item.responsible)}"></td>
      <td><select name="itemStatus" aria-label="Status">${options(statuses, item.status)}</select></td>
      <td><input name="due" aria-label="Termin" type="date" value="${esc(item.due)}"></td>
      <td><button type="button" class="secondary" data-remove-item aria-label="Pendenz entfernen">×</button></td></tr>`;
  }
  function personRow(p, epc, preparing) {
    return `<div data-jourfix-person="${esc(p.id)}"><strong>${esc(p.name)}</strong>
      ${epc && !preparing ? `<select name="attendance" aria-label="Anwesenheit ${esc(p.name)}">${options(attendance, p.status)}</select>` : ""}
      <button type="button" data-remove-person class="secondary" aria-label="${esc(p.name)} entfernen">×</button></div>`;
  }
  function detail(root, kind) {
    const epc = kind === "epc";
    const preparing = meeting.open === false;
    root.innerHTML = `<a href="#jourfix/${kind}">← Sitzungsübersicht</a><div class="page-heading"><h1>${esc(overview.title)}</h1></div>
      <p id="jourfix-status" role="status"></p>
      <form id="jourfix-form">
      <section class="panel leadership-panel form-grid">${field("date", "Datum", "date")}${field("time", "Uhrzeit", "time")}${epc ? field("chair", "Sitzungsleitung (optional)") : ""}</section>
      <section class="panel leadership-panel"><h2>Beteiligte Personen</h2>
        <label>Person suchen<input type="search" id="jourfix-person-search" autocomplete="off" placeholder="Name eingeben"></label>
        <div id="jourfix-suggestions"></div><div class="jourfix-people" id="jourfix-selected">${meeting.people.map((p) => personRow(p, epc, preparing)).join("")}</div>
        <p class="muted">Alle ausgewählten Personen mit hinterlegter E-Mail-Adresse erhalten das Protokoll beim Abschluss.</p></section>
      ${
        epc
          ? `<section class="panel leadership-panel"><h2>Traktandenliste</h2>
        ${
          meeting.agendaItems
            .map(
              (
                item,
                i,
              ) => `<div class="jourfix-agenda-item" data-agenda-id="${esc(item.id)}">
          <label><span><span data-agenda-number>${i + 1}</span>. ${esc(item.title)}</span>${preparing ? "" : `<textarea name="note:${esc(item.id)}" rows="3" maxlength="50000">${esc(item.notes)}</textarea>`}</label>
          <div><button type="button" class="secondary" data-agenda-move="up" aria-label="Traktandum nach oben" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="secondary" data-agenda-move="down" aria-label="Traktandum nach unten" ${i === meeting.agendaItems.length - 1 ? "disabled" : ""}>↓</button></div></div>`,
            )
            .join("") || "<p>Keine Traktanden erfasst.</p>"
        }</section>`
          : ""
      }
      ${
        preparing
          ? ""
          : `
      <section class="panel leadership-panel"><h2>Pendenzen</h2><div class="table-scroll"><table class="jourfix-table"><thead><tr>${epc ? "" : "<th>Wärmeverbund</th>"}<th>Pendenz</th><th>Verantwortlich</th><th>Status</th><th>Termin</th><th></th></tr></thead><tbody>${meeting.items.map((p) => row(p, kind)).join("")}</tbody></table></div><button id="jourfix-add" type="button" class="secondary">Pendenz hinzufügen</button></section>
      <section class="panel leadership-panel form-grid">${epc ? area("decisions", "Beschlüsse und Entscheidungen") : ""}${area("topics", epc ? "Neue Themen und Rückmeldungen" : "Fragen und offene Notizen")}${area("summary", "Zusammenfassung")}${epc ? field("nextDate", "Nächster Jourfix", "date") : ""}</section>
      `
      }
      <div class="lead-footer"><button class="secondary">Entwurf speichern</button>${preparing ? "" : '<button type="button" class="primary" id="jourfix-close">Sitzung abschliessen</button>'}</div></form>`;
    form = root.querySelector("#jourfix-form");
    const rows = form.querySelector("tbody");
    const changed = () => {
      form.dataset.dirty = "true";
      syncError = false;
      if (!preparing) {
        clearTimeout(editTimer);
        editTimer = setTimeout(backgroundSync, 500);
        editTimer?.unref?.();
      }
    };
    form.addEventListener("click", (event) => {
      const button = event.target.closest("[data-agenda-move]");
      if (!button) return;
      const item = button.closest("[data-agenda-id]");
      const up = button.dataset.agendaMove === "up";
      const neighbour = up
        ? item.previousElementSibling
        : item.nextElementSibling;
      if (!neighbour?.matches("[data-agenda-id]")) return;
      if (up) neighbour.before(item);
      else neighbour.after(item);
      const ordered = [...form.querySelectorAll("[data-agenda-id]")];
      ordered.forEach((row, index) => {
        row.querySelector("[data-agenda-number]").textContent = index + 1;
        row.querySelector('[data-agenda-move="up"]').disabled = index === 0;
        row.querySelector('[data-agenda-move="down"]').disabled =
          index === ordered.length - 1;
      });
      if (!button.disabled) button.focus({ preventScroll: true });
      changed();
    });
    form.oninput = (event) => {
      if (event.target.id !== "jourfix-person-search") changed();
    };
    const search = root.querySelector("#jourfix-person-search");
    const suggestions = root.querySelector("#jourfix-suggestions");
    const selected = root.querySelector("#jourfix-selected");
    search.oninput = () => {
      const query = search.value.trim().toLocaleLowerCase("de-CH");
      const ids = [...selected.children].map((el) => el.dataset.jourfixPerson);
      suggestions.innerHTML = query
        ? overview.people
            .filter(
              (p) =>
                !ids.includes(p.id) &&
                p.name.toLocaleLowerCase("de-CH").includes(query),
            )
            .slice(0, 10)
            .map(
              (p) =>
                `<button type="button" class="secondary" data-pick="${esc(p.id)}">${esc(p.name)}</button>`,
            )
            .join("") || "<p>Keine passenden Konten.</p>"
        : "";
    };
    search.onkeydown = (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      suggestions.querySelector("button")?.click();
    };
    suggestions.onclick = (event) => {
      const p = overview.people.find(
        (person) => person.id === event.target.dataset.pick,
      );
      if (!p) return;
      selected.insertAdjacentHTML(
        "beforeend",
        personRow({ ...p, status: "Offen" }, epc, preparing),
      );
      search.value = "";
      search.oninput();
      search.focus();
      changed();
    };
    selected.onclick = (event) => {
      if (!event.target.closest("[data-remove-person]")) return;
      event.target.closest("[data-jourfix-person]").remove();
      search.oninput();
      changed();
    };
    form.onchange = (event) => {
      if (event.target.name === "network" && event.target.checked) {
        const choices = [
          ...event.target
            .closest("td")
            .querySelectorAll('input[name="network"]'),
        ];
        for (const choice of choices) {
          if (
            choice !== event.target &&
            (event.target.value === "*" || choice.value === "*")
          )
            choice.checked = false;
        }
      }
      changed();
    };
    if (rows)
      rows.onclick = (event) => {
        if (!event.target.closest("[data-remove-item]")) return;
        event.target.closest("tr").remove();
        changed();
      };
    const add = root.querySelector("#jourfix-add");
    if (add)
      add.onclick = () => {
        rows.insertAdjacentHTML("beforeend", row(freshItem(), kind));
        rows.lastElementChild.querySelector("textarea").focus();
        changed();
      };
    form.onsubmit = action(async () => {
      if (preparing && !form.elements.namedItem("time").value) {
        const time = form.elements.namedItem("time");
        time.focus();
        throw Error("Bitte die Uhrzeit eingeben.");
      }
      await save(preparing);
      if (preparing) location.hash = "#jourfix/" + kind;
      toast(
        preparing
          ? "Das offene Sitzungsprotokoll ist bereit."
          : "Entwurf gespeichert.",
      );
    });
    const close = root.querySelector("#jourfix-close");
    if (close)
      close.onclick = action(async () => {
        if (!form.reportValidity()) return;
        if (!form.elements.namedItem("time").value) {
          form.elements.namedItem("time").focus();
          throw Error("Bitte die Uhrzeit eingeben.");
        }
        if (!confirm("Sitzung abschliessen und Protokoll archivieren?")) return;
        const closingForm = form;
        closingForm.inert = true;
        close.disabled = true;
        try {
          await save();
          const result = await request(
            path(kind, "/" + meeting.id + "/close"),
            "POST",
            { version: meeting.version },
          );
          form.dataset.dirty = "";
          toast(
            `PDF archiviert. ${result.queued} E-Mail(s) vorgemerkt.${result.missingEmail ? ` Für ${result.missingEmail} Person(en) fehlt eine aktive E-Mail-Adresse.` : ""}`,
          );
          location.hash = "#jourfix/" + kind;
        } finally {
          closingForm.inert = false;
          close.disabled = false;
        }
      });
  }
  function snapshot(source) {
    return {
      ...Object.fromEntries(fields.map((name) => [name, source[name] || ""])),
      agendaOrder: source.agendaItems.map((item) => item.id),
      people: source.people.map(({ id, status }) => ({ id, status })),
      items: source.items.map(
        ({ title, responsible, due, status, networks }) => ({
          title,
          responsible,
          due,
          status,
          networks,
        }),
      ),
      ...Object.fromEntries(
        source.agendaItems.map((item) => ["note:" + item.id, item.notes]),
      ),
    };
  }
  function values() {
    const value = (name) =>
      form.elements.namedItem(name)?.value ?? baseline[name];
    const controls = (element, name) =>
      element.querySelector(`[name="${name}"]`);
    return {
      ...Object.fromEntries(fields.map((name) => [name, value(name)])),
      agendaOrder: [...form.querySelectorAll("[data-agenda-id]")].map(
        (item) => item.dataset.agendaId,
      ),
      people: [...form.querySelectorAll("[data-jourfix-person]")].map((p) => ({
        id: p.dataset.jourfixPerson,
        status:
          controls(p, "attendance")?.value ||
          baseline.people.find((s) => s.id === p.dataset.jourfixPerson)
            ?.status ||
          "Offen",
      })),
      items: form.querySelector("tbody")
        ? [...form.querySelectorAll("[data-jourfix-item]")].map((p) => ({
            title: controls(p, "title").value.trim(),
            responsible: controls(p, "responsible").value.trim(),
            due: controls(p, "due").value,
            status: controls(p, "itemStatus").value,
            networks: [...p.querySelectorAll('[name="network"]:checked')].map(
              (n) => n.value,
            ),
          }))
        : baseline.items,
      ...Object.fromEntries(
        meeting.agendaItems.map((item) => [
          "note:" + item.id,
          value("note:" + item.id),
        ]),
      ),
    };
  }
  const isDirty = () => form?.isConnected && form.dataset.dirty === "true";
  function reconcile(next, sent, target, changes = {}) {
    if (form !== target || !target.isConnected) return;
    const local = values();
    const remote = snapshot(next);
    const remaining = Object.keys(local).filter(
      (key) => !same(local[key], sent[key]),
    );
    if (remaining.length) {
      // Rebase only fields actually saved by this request. A concurrent change
      // to an untouched field must still be detected on its next save.
      for (const key of Object.keys(changes)) baseline[key] = remote[key];
      meeting.version = next.version;
      target.dataset.dirty = "true";
      clearTimeout(editTimer);
      editTimer = setTimeout(backgroundSync, 500);
      editTimer?.unref?.();
      return;
    }
    const redraw = Object.keys(remote).some(
      (key) => !same(remote[key], local[key]),
    );
    const focus = document.activeElement;
    const selector = focus?.id
      ? "#" + focus.id
      : focus?.name
        ? `[name="${focus.name}"]`
        : "";
    const matches = selector ? [...target.querySelectorAll(selector)] : [];
    const index = matches.indexOf(focus);
    const caret = focus?.selectionStart;
    const searchValue = target.querySelector("#jourfix-person-search").value;
    meeting = next;
    baseline = remote;
    target.dataset.dirty = "";
    if (redraw && next.status === "draft") {
      detail(target.parentElement, next.jourfix);
      const search = form.querySelector("#jourfix-person-search");
      search.value = searchValue;
      search.oninput();
      const replacement =
        index < 0 ? null : form.querySelectorAll(selector)[index];
      replacement?.focus({ preventScroll: true });
      if (typeof caret === "number")
        replacement?.setSelectionRange?.(caret, caret);
    }
  }
  async function save(publish = false) {
    if (syncInFlight) await syncInFlight;
    if (!form?.reportValidity())
      throw Error("Bitte die Pflichtfelder ausfüllen.");
    const target = form;
    const current = values();
    const changes = Object.fromEntries(
      Object.entries(current)
        .filter(([key, value]) => !same(value, baseline[key]))
        .map(([key, value]) => [key, { base: baseline[key], value }]),
    );
    if (!publish && !Object.keys(changes).length) {
      target.dataset.dirty = "";
      return;
    }
    syncInFlight = request(path(meeting.jourfix, "/" + meeting.id), "PATCH", {
      changes,
      publish,
    }).then((next) => reconcile(next, current, target, changes));
    try {
      await syncInFlight;
      syncError = false;
    } finally {
      syncInFlight = null;
    }
  }
  async function backgroundSync() {
    if (
      !active() ||
      !form?.isConnected ||
      meeting.open === false ||
      syncInFlight ||
      busy ||
      syncError ||
      document.hidden
    )
      return;
    const target = form;
    try {
      if (isDirty()) {
        await save();
        return;
      }
      const current = values();
      const next = await request(path(meeting.jourfix, "/" + meeting.id));
      if (
        form !== target ||
        !target.isConnected ||
        syncInFlight ||
        busy ||
        isDirty()
      )
        return;
      if (next.status === "closed") {
        toast(
          "Die Sitzung wurde abgeschlossen. Das PDF liegt im Sitzungsarchiv.",
        );
        location.hash = "#jourfix/" + next.jourfix;
      } else if (next.version > meeting.version)
        reconcile(next, current, target);
    } catch (error) {
      syncError = true;
      showError(error);
    }
  }
  async function refreshOverview() {
    const route = match();
    if (!route || route[2] || busy || overviewLoading || document.hidden)
      return;
    const root = document.querySelector("#content");
    if (
      !root?.querySelector("#jourfix-status") ||
      root.querySelector("details[open]") ||
      root.querySelector("#jourfix-agenda input")?.value ||
      root.contains(document.activeElement)
    )
      return;
    const token = renderToken;
    overviewLoading = true;
    try {
      const next = await request(path(route[1]));
      if (
        root.isConnected &&
        location.hash === route[0] &&
        token === renderToken &&
        !busy &&
        !root.contains(document.activeElement) &&
        !root.querySelector("details[open]") &&
        !root.querySelector("#jourfix-agenda input")?.value &&
        !same(overview, next)
      ) {
        overview = next;
        home(root, route[1]);
      }
    } catch {
      // Keep the current overview during a transient refresh failure.
    } finally {
      overviewLoading = false;
    }
  }
  setInterval(backgroundSync, 1500)?.unref?.();
  setInterval(refreshOverview, 4500)?.unref?.();
  async function render(force = false) {
    const route = match();
    if (!route) return;
    const [, kind, id] = route;
    const root = document.querySelector("#content");
    if (!force && root.dataset.jourfix === route[0]) return;
    root.dataset.jourfix = route[0];
    root.innerHTML = '<p role="status">Jourfix wird geladen …</p>';
    form = null;
    const token = ++renderToken;
    try {
      const [info, draft] = await Promise.all([
        request(path(kind)),
        id ? request(path(kind, "/" + id)) : null,
      ]);
      if (
        token !== renderToken ||
        location.hash !== route[0] ||
        !root.isConnected
      )
        return;
      overview = info;
      meeting = draft;
      syncError = false;
      if (draft?.status === "draft") {
        baseline = snapshot(draft);
        detail(root, kind);
      } else home(root, kind);
    } catch (error) {
      if (
        token === renderToken &&
        root.isConnected &&
        location.hash === route[0]
      ) {
        root.textContent = error.message;
        root.dataset.jourfix = "";
      }
    }
  }
  return { active, render, isDirty, saveBeforeLeave: () => save(false) };
}
