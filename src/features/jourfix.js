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
    renderToken = 0;
  const match = () =>
    location.hash.match(/^#jourfix\/(epc|wvm)(?:\/([a-zA-Z0-9-]+))?$/);
  const active = () => !!match();
  const path = (kind, suffix = "") => "/jourfix/" + kind + suffix;
  const options = (values, selected) =>
    values
      .map(
        (v) => `<option ${selected === v ? "selected" : ""}>${esc(v)}</option>`,
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
    else toast(error.message);
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
    root.innerHTML = `<div class="page-heading"><h1>${esc(overview.title)}</h1><button id="jourfix-new" class="primary">Jourfix vorbereiten</button></div>
      <p id="jourfix-status" role="status"></p>
      <section class="panel leadership-panel"><h2>Sitzungsarchiv</h2>
      ${overview.meetings.map((m) => `<p>${m.status === "draft" ? `<a href="#jourfix/${kind}/${esc(m.id)}">Entwurf fortsetzen</a>` : `<button class="secondary" data-jourfix-pdf="${esc(m.id)}">PDF herunterladen</button>`} ${esc(fullDate(m.date))} ${esc(m.time || "")} · ${esc(m.title)}</p>`).join("") || "<p>Keine Sitzungen vorhanden.</p>"}</section>
      ${overview.template ? '<p><button class="secondary" id="jourfix-template-download">Word-Vorlage herunterladen</button></p>' : ""}
      ${
        admin
          ? `<details class="panel leadership-panel"><summary>Zugriff und Word-Vorlage verwalten</summary>
      <form id="jourfix-access"><h2>Zugriff freigeben</h2><div class="jourfix-people">
      ${overview.people.map((p) => `<label class="check-label"><input type="checkbox" name="access" value="${esc(p.id)}" ${p.access ? "checked" : ""} ${p.admin ? "disabled" : ""}>${esc(p.name)}${p.admin ? " (Admin)" : ""}</label>`).join("")}
      </div><button class="secondary">Zugriff speichern</button></form>
      <form id="jourfix-template"><h2>Word-Vorlage</h2><label>Fragen und Hinweise (.docx)<input type="file" accept=".docx" required></label><button class="secondary">Vorlage speichern</button>
      ${overview.template ? '<button type="button" id="jourfix-template-remove" class="secondary">Vorlage entfernen</button>' : ""}</form></details>`
          : ""
      }`;
    root.querySelector("#jourfix-new").onclick = action(async () => {
      const draft = await request(path(kind), "POST");
      location.hash = "#jourfix/" + kind + "/" + draft.id;
    });
    root.querySelectorAll("[data-jourfix-pdf]").forEach((button) => {
      button.onclick = action(() =>
        download(
          path(kind, "/" + button.dataset.jourfixPdf + "/pdf"),
          "Jourfix-" + button.dataset.jourfixPdf.slice(0, 8) + ".pdf",
        ),
      );
    });
    const templateDownload = root.querySelector("#jourfix-template-download");
    if (templateDownload)
      templateDownload.onclick = action(() =>
        download(path(kind, "/template"), "Jourfix-Vorlage.docx"),
      );
    if (!admin) return;
    const update = async (data) => {
      await request(path(kind, "/settings"), "PUT", data);
      await render(true);
      toast("Einstellungen gespeichert.");
    };
    root.querySelector("#jourfix-access").onsubmit = action((e) =>
      update({ access: new FormData(e.currentTarget).getAll("access") }),
    );
    root.querySelector("#jourfix-template").onsubmit = action(async (e) => {
      const file = e.currentTarget.querySelector("input").files[0];
      if (!file || file.size > 1400000 || !/\.docx$/i.test(file.name))
        throw Error("Bitte eine Word-Datei (.docx) bis 1,4 MB wählen.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await update({ template: btoa(binary) });
    });
    const remove = root.querySelector("#jourfix-template-remove");
    if (remove) remove.onclick = action(() => update({ template: "" }));
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
  function detail(root, kind) {
    const epc = kind === "epc";
    const people = [...overview.people];
    for (const p of meeting.people)
      if (!people.some((u) => u.id === p.id)) people.push(p);
    root.innerHTML = `<a href="#jourfix/${kind}">← Sitzungsübersicht</a><div class="page-heading"><h1>${esc(overview.title)}</h1></div>
      <p id="jourfix-status" role="status"></p>
      <form id="jourfix-form">
      <section class="panel leadership-panel form-grid">${field("date", "Datum", "date")}${field("time", "Uhrzeit", "time")}${epc ? field("chair", "Sitzungsleitung") : ""}</section>
      <section class="panel leadership-panel"><h2>Beteiligte Personen</h2><div class="jourfix-people">${people
        .filter((p) => p.access || meeting.people.some((u) => u.id === p.id))
        .map((p) => {
          const saved = meeting.people.find((u) => u.id === p.id);
          return `<div data-jourfix-person="${esc(p.id)}"><label class="check-label"><input name="selected" type="checkbox" ${saved ? "checked" : ""}>${esc(p.name)}</label>
        ${epc ? `<select name="attendance" aria-label="Anwesenheit ${esc(p.name)}">${options(attendance, saved?.status)}</select>` : ""}
        <label class="check-label"><input name="mail" type="checkbox" ${(saved?.mail ?? p.email) ? "checked" : ""} ${p.email && p.access ? "" : "disabled"}>PDF per E-Mail</label></div>`;
        })
        .join("")}</div></section>
      ${epc ? `<section class="panel leadership-panel">${area("agenda", "Traktandenliste")}</section>` : ""}
      <section class="panel leadership-panel"><h2>Pendenzen</h2><div class="table-scroll"><table class="jourfix-table"><thead><tr>${epc ? "" : "<th>Wärmeverbund</th>"}<th>Pendenz</th><th>Verantwortlich</th><th>Status</th><th>Termin</th><th></th></tr></thead><tbody>${meeting.items.map((p) => row(p, kind)).join("")}</tbody></table></div><button id="jourfix-add" type="button" class="secondary">Pendenz hinzufügen</button></section>
      <section class="panel leadership-panel form-grid">${epc ? area("decisions", "Beschlüsse und Entscheidungen") : ""}${area("topics", epc ? "Neue Themen und Rückmeldungen" : "Fragen und offene Notizen")}${area("summary", "Zusammenfassung")}${epc ? field("nextDate", "Nächster Jourfix", "date") : ""}</section>
      <div class="lead-footer"><button class="secondary">Entwurf speichern</button><button type="button" class="primary" id="jourfix-close">Jourfix abschliessen</button></div></form>`;
    form = root.querySelector("#jourfix-form");
    const rows = form.querySelector("tbody");
    const changed = () => {
      form.dataset.dirty = "true";
    };
    form.oninput = changed;
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
    rows.onclick = (event) => {
      if (!event.target.closest("[data-remove-item]")) return;
      event.target.closest("tr").remove();
      changed();
    };
    root.querySelector("#jourfix-add").onclick = () => {
      rows.insertAdjacentHTML("beforeend", row(freshItem(), kind));
      rows.lastElementChild.querySelector("textarea").focus();
      changed();
    };
    form.onsubmit = action(async () => {
      await save();
      toast("Entwurf gespeichert.");
    });
    root.querySelector("#jourfix-close").onclick = action(async () => {
      if (
        !form.reportValidity() ||
        !confirm("Jourfix abschliessen und Protokoll archivieren?")
      )
        return;
      const result = await request(
        path(kind, "/" + meeting.id + "/close"),
        "POST",
        values(),
      );
      form.dataset.dirty = "";
      toast(
        result.queued
          ? `PDF archiviert. ${result.queued} E-Mail(s) zum Versand vorgemerkt.`
          : "PDF archiviert.",
      );
      location.hash = "#jourfix/" + kind;
    });
  }
  function values() {
    const value = (name) => form.elements.namedItem(name)?.value || "";
    const controls = (element, name) =>
      element.querySelector(`[name="${name}"]`);
    const data = { version: meeting.version };
    for (const name of [
      "date",
      "time",
      "chair",
      "agenda",
      "decisions",
      "topics",
      "summary",
      "nextDate",
    ])
      data[name] = value(name);
    data.people = [...form.querySelectorAll("[data-jourfix-person]")]
      .filter((p) => controls(p, "selected").checked)
      .map((p) => ({
        id: p.dataset.jourfixPerson,
        status: controls(p, "attendance")?.value || "Offen",
        mail: controls(p, "mail").checked && !controls(p, "mail").disabled,
      }));
    data.items = [...form.querySelectorAll("[data-jourfix-item]")].map((p) => ({
      title: controls(p, "title").value,
      responsible: controls(p, "responsible").value,
      due: controls(p, "due").value,
      status: controls(p, "itemStatus").value,
      networks: [...p.querySelectorAll('[name="network"]:checked')].map(
        (n) => n.value,
      ),
    }));
    return data;
  }
  const isDirty = () => form?.dataset.dirty === "true";
  async function save() {
    if (!form?.reportValidity())
      throw Error("Bitte die Pflichtfelder ausfüllen.");
    const target = form;
    const input = values();
    const saved = await request(
      path(meeting.jourfix, "/" + meeting.id),
      "PUT",
      input,
    );
    meeting = saved;
    if (
      form === target &&
      JSON.stringify({ ...values(), version: input.version }) ===
        JSON.stringify(input)
    )
      form.dataset.dirty = "";
  }
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
      if (draft?.status === "draft") detail(root, kind);
      else home(root, kind);
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
  return { active, render, isDirty, saveBeforeLeave: save };
}
