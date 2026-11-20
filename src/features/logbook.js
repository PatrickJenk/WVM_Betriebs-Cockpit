import { uuid } from "../services/ids.js";
import {
  findMentions,
  entryMentions,
  isPersonalEntry,
} from "../services/mentions.js";
import { isAdministrator } from "../auth/accounts.js";
import {
  archived as archivedEntry,
  canCorrectEntryTime,
  canDeleteEntry,
  roundActivities,
} from "../services/entry-status.js";
// Logbuch: Filter, Tabelle, Formular und Eintragsdetails.
export function createLogbook(context) {
  const {
    data,
    user,
    networks,
    sites,
    $,
    esc,
    icon,
    site,
    network,
    plant,
    fmt,
    time,
    overdue,
    options,
    show,
    modal,
    save,
    render,
    shell,
    toast,
    putFile,
    download,
    getState,
    resetFilters,
    selectFilter,
  } = context;
  const editor = (e) => e.updatedBy || e.createdBy;
  const account = (id) => data.users.find((user) => user.id === id);
  const author = (e) =>
    e.createdByName ||
    account(e.createdById)?.name ||
    data.users.find((user) => user.initials === e.createdBy)?.name ||
    e.createdBy ||
    "Unbekannt";
  const recipient = (id) => account(id) || { name: "Ehemaliger Benutzer" };
  const responsibility = (entry) => entry?.assigneeIds?.[0] || "";
  const copies = (entry) => entry?.ccIds || entry?.assigneeIds?.slice(1) || [];
  const assignees = (e) => (e.assigneeIds || []).map(recipient);
  const assigneeLabel = (user) =>
    user.email ? `${user.name} · ${user.email}` : user.name;
  function bindMentions(textarea) {
    if (!textarea?.addEventListener || !globalThis.document?.createElement)
      return;
    const choices = document.createElement("div");
    choices.className = "mention-choices";
    choices.hidden = true;
    choices.id = "mention-options";
    choices.setAttribute("role", "listbox");
    choices.setAttribute("aria-label", "Person erwähnen");
    textarea.parentElement.append(choices);
    textarea.setAttribute("aria-controls", choices.id);
    textarea.setAttribute("aria-autocomplete", "list");
    let matches = [],
      selected = 0,
      start = 0,
      end = 0;
    const choose = (person) => {
      textarea.setRangeText("@" + person.name + " ", start, end, "end");
      choices.hidden = true;
      textarea.focus();
    };
    const update = () => {
      end = textarea.selectionStart;
      const prefix = textarea.value.slice(0, end),
        match = prefix.match(/(^|[^\p{L}\p{N}_@])@([^@\n]{0,100})$/u);
      choices.replaceChildren();
      selected = 0;
      if (!match) {
        choices.hidden = true;
        return;
      }
      start = end - match[2].length - 1;
      const query = match[2].toLocaleLowerCase("de-CH");
      matches = data.users
        .filter(
          (p) =>
            p.active !== false &&
            p.name.toLocaleLowerCase("de-CH").includes(query),
        )
        .slice(0, 8);
      choices.hidden = !matches.length;
      matches.forEach((p, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "@" + p.name;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(index === 0));
        button.onmousedown = (event) => event.preventDefault();
        button.onpointerdown = (event) => event.preventDefault();
        button.onclick = () => choose(p);
        choices.append(button);
      });
    };
    textarea.addEventListener("input", update);
    textarea.addEventListener("click", update);
    textarea.addEventListener("keydown", (event) => {
      if (choices.hidden) return;
      if (event.key === "Escape") {
        choices.hidden = true;
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        selected =
          (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
          matches.length;
        Array.from(choices.children).forEach((b, i) =>
          b.setAttribute("aria-selected", String(i === selected)),
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(matches[selected]);
      }
    });
    textarea.addEventListener("blur", () => {
      choices.hidden = true;
    });
  }
  function people(e) {
    if (e.participants?.length) return e.participants;
    const records = [
      { by: e.createdBy, name: e.createdByName },
      ...(e.history || []),
      { by: e.updatedBy, name: e.updatedByName },
    ];
    const unique = new Map();
    for (const r of records) {
      if (!r.by && !r.name) continue;
      const account = data.users.find((u) => u.initials === r.by);
      const name = r.name || account?.name || r.by;
      unique.set(account?.id || name, {
        name,
        initials: account?.initials || r.by,
        company: account?.company,
      });
    }
    return [...unique.values()];
  }
  const person = (e) => {
    const participants = people(e);
    const companies = new Set(
      participants.map((p) => (p.company === "EPC" ? "EPC" : "WVM")),
    );
    const color =
      companies.size > 1
        ? "company-mixed"
        : companies.has("EPC")
          ? "company-epc"
          : "company-wvm";
    const single = participants[0];
    const initials =
      single?.initials ||
      data.users.find((u) => u.id === single?.id || u.name === single?.name)
        ?.initials ||
      e.createdBy;
    return `<details class="entry-people"><summary class="person ${color}" title="Ersteller und Bearbeiter anzeigen">${esc(initials)}</summary><div class="people-popup"><b>Ersteller und Bearbeiter</b><ul>${participants.map((p) => `<li class="${p.company === "EPC" ? "company-epc" : "company-wvm"}">${esc(p.name)}</li>`).join("")}</ul></div></details>`;
  };
  function badges(e) {
    let { current, filters, onlyOpen } = getState();
    return `<span class="badge ${e.status === "Erledigt" ? "done" : e.status === "Pendenz" ? "pending" : "progress"}">${esc(e.status)}</span>${overdue(e) ? '<span class="badge late">Überfällig</span>' : ""}`;
  }
  function filtered(entries) {
    let { current, filters, onlyOpen } = getState();
    return entries
      .filter((e) => context.isVisible(e))
      .filter((e) => {
        const s = site(e.siteId),
          q = (filters.search || "").toLowerCase();
        return (
          (!onlyOpen || e.status !== "Erledigt") &&
          (!filters.network || s.heatNetworkId === filters.network) &&
          (!filters.site || e.siteId === filters.site) &&
          (!filters.plant || e.plantId === filters.plant) &&
          (filters.status
            ? e.status === filters.status
            : filters.mine || e.status !== "Erledigt") &&
          (!filters.author || author(e) === filters.author) &&
          (!filters.assignee || responsibility(e) === filters.assignee) &&
          (!filters.activity || e.activity === filters.activity) &&
          (!filters.mine || isPersonalEntry(e, user, data.users)) &&
          (!filters.late || overdue(e)) &&
          (!filters.from || e.occurredAt.slice(0, 10) >= filters.from) &&
          (!filters.to || e.occurredAt.slice(0, 10) <= filters.to) &&
          (!filters.period || new Date(e.occurredAt) >= weekStart()) &&
          (!q ||
            [
              e.title,
              e.description,
              e.nextSteps,
              plant(e.plantId),
              s.name,
              network(s.heatNetworkId).name,
              e.createdBy,
              author(e),
              e.activity,
              ...assignees(e).map(assigneeLabel),
              ...copies(e).map((id) => assigneeLabel(recipient(id))),
            ]
              .join(" ")
              .toLowerCase()
              .includes(q))
        );
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
  function weekStart() {
    let { current, filters, onlyOpen } = getState();
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function logView(entries) {
    let { current, filters, onlyOpen } = getState();
    const rows = filtered(entries);
    const archived = filters.status === "Erledigt";
    const assigned = [...new Set(entries.map(responsibility).filter(Boolean))];

    return `<div class="panel-heading"><div><h2>${archived ? "Archiv · Erledigte Einträge" : current ? "Logbuch" : "Letzte Einträge"}</h2><p>${current ? "Alle Arbeiten und Beobachtungen an einem Ort." : "Aktuelle Betriebsdokumentation aus allen Standorten."}</p></div></div><div class="search-row"><label class="search">${icon("search")}<input id="search" aria-label="Logbuch durchsuchen" placeholder="Logbuch durchsuchen …" value="${esc(filters.search || "")}"></label><button class="secondary" id="reset">Filter zurücksetzen</button><button type="button" class="secondary" id="toggle-log-archive">${archived ? "Offene Arbeiten anzeigen" : "Archiv öffnen"}</button></div><div class="filters">${
      !current
        ? selectFilter(
            "network",
            "Wärmeverbund",
            networks.map((n) => [n.id, n.name]),
          ) +
          selectFilter(
            "site",
            "Standort",
            sites
              .filter(
                (s) => !filters.network || s.heatNetworkId === filters.network,
              )
              .map((s) => [s.id, s.name]),
          )
        : ""
    }${selectFilter(
      "plant",
      "Anlage",
      data.plants
        .filter(
          (p) =>
            p.active &&
            !p.deleted &&
            (!current || p.siteId === current) &&
            (!filters.site || p.siteId === filters.site) &&
            (!filters.network ||
              site(p.siteId).heatNetworkId === filters.network),
        )
        .map((p) => [
          p.id,
          current || filters.site
            ? p.name
            : site(p.siteId).name + " · " + p.name,
        ]),
    )}${selectFilter("status", "Status", ["Erledigt", "Pendenz", "In Bearbeitung"])}${selectFilter("activity", "Tätigkeit", roundActivities)}${selectFilter(
      "author",
      "Ersteller",
      [...new Set(entries.map(author))].sort((a, b) =>
        a.localeCompare(b, "de-CH"),
      ),
    )}${selectFilter(
      "assignee",
      "Zu erledigen durch",
      assigned
        .map((id) => [
          id,
          assigneeLabel(account(id) || { name: "Ehemaliger Benutzer" }),
        ])
        .sort((a, b) => a[1].localeCompare(b[1], "de-CH")),
    )}<label class="filter"><span>Von</span><input type="date" data-filter="from" value="${esc(filters.from || "")}"></label><label class="filter"><span>Bis</span><input type="date" data-filter="to" value="${esc(filters.to || "")}"></label></div>${filters.mine ? '<div class="active-filter">Meine Erwähnungen</div>' : ""}${onlyOpen || filters.late || filters.period ? '<div class="active-filter">Gefilterte Betriebsübersicht</div>' : ""}<div id="rows">${table(rows)}</div>`;
  }
  function table(rows) {
    let { current, filters, onlyOpen } = getState();
    return rows.length
      ? `<div class="table-scroll"><table><thead><tr><th>DATUM / ZEIT</th>${!current ? "<th>WÄRMEVERBUND / STANDORT</th>" : ""}<th>ANLAGE / KURZBESCHREIBUNG</th><th>STATUS</th><th>ERSTELLER</th><th>ZU ERLEDIGEN DURCH</th><th></th></tr></thead><tbody>${rows
          .map(
            (e) =>
              `<tr><td><b>${fmt(e.occurredAt)}</b><small>${time(e.occurredAt)} Uhr</small></td>${!current ? `<td><b>${esc(network(site(e.siteId).heatNetworkId).name)}</b><small>${esc(site(e.siteId).name)}</small></td>` : ""}<td class="description"><small>${esc([plant(e.plantId), e.activity].filter(Boolean).join(" · "))}</small><button data-entry="${e.id}">${esc(e.title)}</button></td><td><div class="badges">${badges(e)}</div></td><td>${esc(author(e))}</td><td>${esc(
                assignees(e)
                  .map((u) => u.name)
                  .join(", ") || "—",
              )}</td><td><button class="icon-button" data-entry="${e.id}" aria-label="Eintrag öffnen: ${esc(e.title)}" title="Eintrag öffnen">${icon("chevron")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<div class="empty">' +
          icon("search") +
          "<h3>Keine passenden Einträge</h3><p>Ändere die Filter oder erfasse einen neuen Logbucheintrag.</p></div>";
  }
  function bindFilters() {
    let { current, filters, onlyOpen } = getState();
    const search = $("#search");
    if (search)
      search.oninput = () => {
        filters.search = search.value;
        $("#rows").innerHTML = table(
          filtered(
            data.entries.filter((e) => !current || e.siteId === current),
          ),
        );
        document
          .querySelectorAll("[data-entry]")
          .forEach((b) => (b.onclick = () => entryDetail(b.dataset.entry)));
      };
    document.querySelectorAll("[data-filter]").forEach(
      (el) =>
        (el.onchange = () => {
          filters[el.dataset.filter] = el.value;
          if (el.dataset.filter === "network") {
            delete filters.site;
            delete filters.plant;
          }
          if (el.dataset.filter === "site") delete filters.plant;
          render();
        }),
    );
    if ($("#toggle-log-archive"))
      $("#toggle-log-archive").onclick = () => {
        const showArchive = filters.status !== "Erledigt";
        resetFilters();
        if (showArchive) getState().filters.status = "Erledigt";
        render();
      };
    if ($("#reset"))
      $("#reset").onclick = () => {
        resetFilters();
        render();
      };
  }
  function localInput(date = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date(date))
      .replace(" ", "T");
  }
  function swissISO(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const local = Date.parse(value + "Z");
    if (!Number.isFinite(local)) return null;
    // Zürich uses UTC+02:00 in summer and UTC+01:00 in winter.
    for (const offset of [2, 1]) {
      const candidate = new Date(local - offset * 3600000);
      if (localInput(candidate) === value) return candidate.toISOString();
    }
    return null;
  }
  function recipientPicker(key, label) {
    return `<div class="full recipient-picker" data-recipient-picker="${key}">
      <label>${label}<input type="search" autocomplete="off" placeholder="Name oder E-Mail eingeben" aria-controls="recipient-${key}"></label>
      <div class="mention-choices recipient-choices" id="recipient-${key}" hidden></div>
      <div class="recipient-selection"></div>
    </div>`;
  }
  function bindRecipientPicker(form, key, selection, onChange) {
    const picker = form.querySelector(`[data-recipient-picker="${key}"]`);
    const input = picker?.querySelector?.("input");
    if (!input) return () => {};
    const choices = picker.querySelector(".recipient-choices");
    const selected = picker.querySelector(".recipient-selection");
    const ids = () =>
      key === "cc"
        ? [...selection.cc]
        : selection.responsible
          ? [selection.responsible]
          : [];
    const redraw = () => {
      selected.replaceChildren();
      for (const id of ids()) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "secondary";
        const name = recipient(id).name;
        remove.textContent = name + " ×";
        remove.setAttribute("aria-label", name + " entfernen");
        remove.onclick = () => {
          if (key === "cc") selection.cc.delete(id);
          else selection.responsible = "";
          redraw();
          onChange();
          input.focus();
        };
        selected.append(remove);
      }
    };
    const suggest = () => {
      const term = input.value
        .trim()
        .replace(/^@/, "")
        .toLocaleLowerCase("de-CH");
      const matches = data.users
        .filter(
          (u) =>
            u.active !== false &&
            !ids().includes(u.id) &&
            (key !== "cc" || u.id !== selection.responsible) &&
            [u.name, u.email, u.initials]
              .join(" ")
              .toLocaleLowerCase("de-CH")
              .includes(term),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "de-CH"));
      choices.replaceChildren();
      input.setCustomValidity(
        input.value.trim()
          ? "Bitte ein Konto aus der Vorschlagsliste auswählen."
          : "",
      );
      choices.hidden = false;
      for (const match of matches) {
        const option = document.createElement("button");
        option.type = "button";
        option.textContent = "@" + assigneeLabel(match);
        option.onclick = () => {
          if (key === "cc") selection.cc.add(match.id);
          else {
            selection.responsible = match.id;
            selection.cc.delete(match.id);
          }
          input.value = "";
          input.setCustomValidity("");
          redraw();
          onChange();
          input.focus();
          choices.hidden = true;
        };
        choices.append(option);
      }
      if (!matches.length) choices.textContent = "Keine passenden Konten.";
    };
    input.onfocus = suggest;
    input.onclick = suggest;
    input.oninput = suggest;
    input.onkeydown = (event) => {
      if (choices.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        choices.hidden = true;
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        choices.querySelector("button")?.focus();
      } else if (event.key === "Enter" && choices.querySelector("button")) {
        event.preventDefault();
        choices.querySelector("button").click();
      }
    };
    picker.onfocusout = (event) => {
      if (!picker.contains(event.relatedTarget)) choices.hidden = true;
    };
    redraw();
    return redraw;
  }
  function entryForm(id) {
    if (!user.id) return;
    const { current } = getState(),
      entry = data.entries.find((e) => e.id === id);
    if (
      id &&
      (!entry ||
        !context.isVisible(entry) ||
        (!isAdministrator(user) && archivedEntry(entry)))
    )
      return;
    const fullEdit = !!entry && isAdministrator(user);
    const editableFields = !entry || fullEdit;
    const openedAt = new Date().toISOString();
    const canEditDate = !entry || canCorrectEntryTime(user, entry);
    const initialDate = localInput(entry?.occurredAt || openedAt);
    const dateField = `<label class="full">Ereignisdatum und Uhrzeit (Schweiz)<input name="occurredAt" type="datetime-local" required value="${esc(initialDate)}"></label>`;
    const sid = entry?.siteId || current || "";
    const nid = sid ? site(sid).heatNetworkId : "";
    const availablePlants = (siteId) =>
      data.plants.filter((p) => p.siteId === siteId && p.active && !p.deleted);
    const plantOptions = (siteId) => {
      const plants = availablePlants(siteId);
      const previous = data.plants.find(
        (p) => p.id === entry?.plantId && p.siteId === siteId,
      );
      if (fullEdit && previous && !plants.includes(previous))
        plants.push(previous);
      return options(
        plants.map((p) => [p.id, p.name]),
        entry?.plantId,
      );
    };
    const fixed = entry
      ? `<div class="entry-fixed full"><p><b>Wärmeverbund:</b> ${esc(network(nid).name)}<br><b>Standort:</b> ${esc(site(sid).name)}<br><b>Anlage:</b> ${esc(plant(entry.plantId))}${canEditDate ? "" : `<br><b>Datum / Uhrzeit:</b> ${fmt(entry.occurredAt)} ${time(entry.occurredAt)}`}<br><b>Titel:</b> ${esc(entry.title)}<br><b>Status:</b> ${esc(entry.status)}</p></div><div class="full"><h3>Bisherige Beschreibung</h3><p class="prewrap">${esc(entry.description)}</p></div>`
      : "";
    show(
      `<form id="entry-form"><div class="modal-heading"><h2>${fullEdit ? "Logbucheintrag bearbeiten" : entry ? "Logbucheintrag ergänzen" : "Neuer Logbucheintrag"}</h2><button type="button" class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><div class="form-grid">${
        !editableFields
          ? fixed + (canEditDate ? dateField : "")
          : `<label>Wärmeverbund<select name="networkId" required><option value="">Bitte wählen</option>${options(
              networks.map((n) => [n.id, n.name]),
              nid,
            )}</select></label><label>Standort<select name="siteId" required ${nid ? "" : "disabled"}><option value="">Bitte Standort wählen</option>${options(
              sites
                .filter((s) => s.heatNetworkId === nid)
                .map((s) => [s.id, s.name]),
              sid,
            )}</select></label>${dateField}<label class="full">Anlage<select name="plantId" required ${sid ? "" : "disabled"}><option value="">Bitte Anlage wählen</option>${plantOptions(sid)}</select></label><label class="full">Titel / Kurzbeschreibung<input name="title" required maxlength="300" value="${esc(entry?.title || "")}"></label>`
      }<label class="full">Tätigkeit<select name="activity"><option value="">Keine Tätigkeit ausgewählt</option>${options(roundActivities, entry?.activity)}</select></label><label class="full">${!editableFields ? "Beschreibung ergänzen" : "Beschreibung"}<span class="mentions-info">@Name schreiben, um Personen zu markieren.</span><textarea name="description" rows="4" ${editableFields ? "required" : ""} placeholder="${entry ? "Neue Feststellungen oder Arbeiten ergänzen …" : "Feststellungen, Arbeiten und Messwerte dokumentieren …"}">${fullEdit ? esc(entry.description) : ""}</textarea></label>${`<label class="full">Status<select name="status">${options(["Erledigt", "Pendenz", "In Bearbeitung"], entry?.status || "Erledigt")}</select></label>${!editableFields ? "" : `<div class="full form-grid pending-fields"><label>Fälligkeitsdatum (optional)<input name="dueDate" type="date" value="${esc(entry?.dueDate || "")}"></label><label class="full">Notiz / nächste Schritte<textarea name="nextSteps" rows="3">${esc(entry?.nextSteps || "")}</textarea></label></div>`}`}<label class="full">Dateien oder Bilder (optional)<input name="files" type="file" multiple></label>${fullEdit && entry.attachments?.length ? `<fieldset class="full"><legend>Bestehende Anhänge entfernen</legend>${entry.attachments.map((file) => `<label class="check-label"><input type="checkbox" data-remove-attachment value="${esc(file.id)}"> ${esc(file.name)}</label>`).join("")}</fieldset>` : ""}</div><p class="form-info">${fullEdit ? "Die ursprüngliche Erfassungszeit und die Urheberschaft bleiben erhalten." : entry ? "Bestehende Angaben bleiben erhalten. Beschreibung und Dateien werden hinzugefügt." : "Ereignisdatum und Uhrzeit können für nachträgliche Einträge angepasst werden."}</p><p id="form-error" role="alert"></p></div><div class="modal-footer"><button type="button" class="secondary cancel">Abbrechen</button><button class="primary" type="submit">${fullEdit ? "Änderungen speichern" : entry ? "Ergänzung speichern" : "Eintrag speichern"}</button></div></form>`,
    );
    const form = $("#entry-form"),
      fields = form.elements;
    const recipients = {
      responsible: responsibility(entry),
      cc: new Set(copies(entry)),
    };
    form
      .querySelector(".form-grid")
      ?.insertAdjacentHTML?.(
        "beforeend",
        `${recipientPicker("responsible", "Zu erledigen durch")}${recipientPicker("cc", "CC · Zur Information")}${entry && !fullEdit ? `<label class="full">Fälligkeitsdatum<input name="dueDate" type="date" value="${esc(entry.dueDate || "")}"></label>` : ""}`,
      );
    const redrawResponsible = bindRecipientPicker(
      form,
      "responsible",
      recipients,
      () => redrawCopies(),
    );
    const redrawCopies = bindRecipientPicker(form, "cc", recipients, () =>
      redrawResponsible(),
    );
    bindMentions(fields.description);
    if (fields.nextSteps) bindMentions(fields.nextSteps);
    form.querySelector(".cancel").onclick = () => modal.close();
    if (editableFields) {
      const refreshPlants = () => {
        const plants = availablePlants(fields.siteId.value);
        fields.plantId.innerHTML =
          '<option value="">' +
          (plants.length
            ? "Bitte Anlage wählen"
            : "Keine Anlagen freigegeben") +
          "</option>" +
          plantOptions(fields.siteId.value);
        fields.plantId.disabled = !fields.siteId.value;
      };
      fields.networkId.onchange = () => {
        fields.siteId.innerHTML =
          '<option value="">Bitte Standort wählen</option>' +
          options(
            sites
              .filter((s) => s.heatNetworkId === fields.networkId.value)
              .map((s) => [s.id, s.name]),
          );
        fields.siteId.disabled = !fields.networkId.value;
        refreshPlants();
      };
      fields.siteId.onchange = refreshPlants;
      const toggle = () =>
        (form.querySelector(".pending-fields").hidden =
          fields.status.value === "Erledigt");
      toggle();
      fields.status.onchange = toggle;
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const description = fields.description.value.trim(),
        files = Array.from(fields.files.files);
      const sameRecipients =
        recipients.responsible === responsibility(entry) &&
        [...recipients.cc].sort().join(",") ===
          [...copies(entry)].sort().join(",");
      if (
        entry &&
        !fullEdit &&
        !description &&
        !files.length &&
        fields.status.value === entry.status &&
        (!fields.occurredAt || fields.occurredAt.value === initialDate) &&
        (fields.activity?.value || "") === (entry.activity || "") &&
        (!fields.dueDate || fields.dueDate.value === (entry.dueDate || "")) &&
        sameRecipients
      ) {
        $("#form-error").textContent =
          "Bitte eine Beschreibung oder Dateien ergänzen.";
        return;
      }
      if (
        editableFields &&
        (!fields.title.value.trim() ||
          !description ||
          (!(
            entry?.siteId === fields.siteId.value &&
            entry?.plantId === fields.plantId.value
          ) &&
            !availablePlants(fields.siteId.value).some(
              (p) => p.id === fields.plantId.value,
            )))
      ) {
        $("#form-error").textContent =
          "Bitte Standort, freigegebene Anlage, Titel und Beschreibung auswählen.";
        return;
      }
      const occurredAt =
        !fields.occurredAt || (entry && fields.occurredAt.value === initialDate)
          ? entry?.occurredAt || openedAt
          : swissISO(fields.occurredAt.value);
      if (!occurredAt) {
        $("#form-error").textContent =
          "Bitte ein gültiges Ereignisdatum mit Uhrzeit in der Schweiz eingeben.";
        return;
      }
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const removed = new Set(
          Array.from(
            form.querySelectorAll?.("[data-remove-attachment]:checked") || [],
            (input) => input.value,
          ),
        );
        const attachments = (entry?.attachments || []).filter(
          (file) => !removed.has(file.id),
        );
        for (const file of files) {
          const fid = uuid();
          await putFile(fid, file);
          attachments.push({
            id: fid,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }
        const now = new Date().toISOString();
        const next = entry
          ? {
              ...entry,
              ...(fullEdit
                ? {
                    title: fields.title.value.trim(),
                    siteId: fields.siteId.value,
                    plantId: fields.plantId.value,
                    nextSteps: fields.nextSteps.value,
                  }
                : {}),
              occurredAt,
              status: fields.status.value,
              completedAt:
                fields.status.value === "Erledigt"
                  ? entry.status === "Erledigt"
                    ? entry.completedAt || entry.updatedAt
                    : now
                  : null,
              dueDate:
                fields.status.value === "Erledigt"
                  ? ""
                  : (fields.dueDate?.value ?? entry.dueDate),
              description: fullEdit
                ? description
                : description
                  ? entry.description +
                    "\n\n" +
                    user.name +
                    " · " +
                    fmt(now) +
                    " " +
                    time(now) +
                    "\n" +
                    description
                  : entry.description,
              attachments,
              updatedAt: now,
              updatedBy: user.initials,
              updatedByName: user.name,
              updatedCompany: user.company,
            }
          : {
              id: uuid(),
              siteId: fields.siteId.value,
              plantId: fields.plantId.value,
              title: fields.title.value.trim(),
              description,
              status: fields.status.value,
              dueDate:
                fields.status.value === "Erledigt" ? "" : fields.dueDate.value,
              nextSteps: fields.nextSteps.value,
              occurredAt,
              createdAt: now,
              createdBy: user.initials,
              createdById: user.id,
              createdByName: user.name,
              createdCompany: user.company,
              updatedAt: now,
              updatedBy: user.initials,
              updatedByName: user.name,
              updatedCompany: user.company,
              completedAt: fields.status.value === "Erledigt" ? now : null,
              attachments,
              history: [],
            };
        const old = data.entries;
        if (fields.activity?.value || entry?.activity)
          next.activity = fields.activity?.value || "";
        if (!entry || !sameRecipients) {
          next.assigneeIds = recipients.responsible
            ? [recipients.responsible]
            : [];
          next.ccIds = [...recipients.cc];
        }
        next.mentions = [
          ...new Map(
            [
              ...(entry?.mentions || []),
              ...findMentions(
                [next.description, next.nextSteps].filter(Boolean).join("\n"),
                data.users,
              ),
            ].map((p) => [p.id, p]),
          ).values(),
        ];
        data.entries = entry
          ? data.entries.map((e) => (e.id === id ? next : e))
          : [next, ...data.entries];
        if (!save()) {
          data.entries = old;
          button.disabled = false;
          return;
        }
        modal.close();
        shell();
        toast(
          next.status === "Erledigt"
            ? "Erledigter Eintrag im Archiv gespeichert."
            : "Logbucheintrag gespeichert.",
        );
      } catch {
        $("#form-error").textContent =
          "Speichern nicht möglich. Bitte Serververbindung prüfen.";
        button.disabled = false;
      }
    };
  }
  function entryDetail(id) {
    let { current, filters, onlyOpen } = getState();
    const e = data.entries.find((x) => x.id === id);
    if (!e || !context.isVisible(e)) return;
    const mayEdit = isAdministrator(user) || !archivedEntry(e);
    const mayDelete = canDeleteEntry(user, e);
    show(
      `<div class="modal-heading"><div><div class="eyebrow">${esc(site(e.siteId).name)} · ${esc([plant(e.plantId), e.activity].filter(Boolean).join(" · "))}</div><h2>${esc(e.title)}</h2></div><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><div class="detail-meta">${badges(e)}</div><p class="muted">${fmt(e.occurredAt)} · ${time(e.occurredAt)} Uhr · Erfasst von ${esc(e.createdByName || data.users.find((u) => u.initials === e.createdBy)?.name || e.createdBy)}<br>Ersteller und Bearbeiter: ${person(e)}<br>Zuletzt ergänzt: ${esc(e.updatedByName || editor(e))} · ${fmt(e.updatedAt)} ${time(e.updatedAt)}</p>${
        entryMentions(e, data.users).length
          ? `<p><b>Erwähnte Personen:</b> ${entryMentions(e, data.users)
              .map((p) => esc(p.name))
              .join(", ")}</p>`
          : ""
      }<h3>Dokumentation</h3><p class="prewrap">${esc(e.description)}</p>${e.dueDate ? `<p><b>Fällig:</b> ${fmt(e.dueDate + "T12:00:00")}</p>` : ""}${e.nextSteps ? `<h3>Nächste Schritte</h3><p class="prewrap">${esc(e.nextSteps)}</p>` : ""}${e.attachments?.length ? `<h3>Anhänge</h3>${e.attachments.map((a) => `<button class="secondary attachment" data-file="${a.id}">${icon("file")} ${esc(a.name)}</button>`).join("")}` : ""}${isAdministrator(user) ? `<details class="history"><summary>Änderungsverlauf (${e.history?.length || 0})</summary><p>Erstellt am ${fmt(e.createdAt)} · ${time(e.createdAt)} · ${esc(e.createdBy)}</p>${(e.history || []).map((h) => `<p>${fmt(h.at)} · ${time(h.at)} · ${esc(h.name || h.by)}<br>Vorher: ${esc(h.status)} · ${esc(h.title)}${h.occurredAt ? ` · Ereignis: ${esc(fmt(h.occurredAt))} ${esc(time(h.occurredAt))}` : ""}</p>`).join("")}</details>` : ""}</div><div class="modal-footer">${mayDelete ? '<button class="danger-button" id="delete-entry">Eintrag löschen</button>' : ""}${mayEdit ? '<button class="secondary" id="edit">Bearbeiten</button>' : ""}${mayEdit && e.status !== "Erledigt" ? '<button class="primary" id="complete">' + icon("check") + " Als erledigt markieren</button>" : ""}</div>`,
    );
    if (mayDelete) $("#delete-entry").onclick = () => removeEntry(id);
    if (responsibility(e) || copies(e).length)
      document.querySelector("#modal .detail-meta")?.insertAdjacentHTML?.(
        "afterend",
        `${responsibility(e) ? `<p><b>Zu erledigen durch:</b> ${esc(recipient(responsibility(e)).name)}</p>` : ""}${
          copies(e).length
            ? `<p><b>CC:</b> ${esc(
                copies(e)
                  .map((id) => recipient(id).name)
                  .join(", "),
              )}</p>`
            : ""
        }`,
      );
    if (mayEdit)
      $("#edit").onclick = () => {
        modal.close();
        entryForm(id);
      };
    if ($("#complete"))
      $("#complete").onclick = () => {
        const previous = structuredClone(e);
        e.history ??= [];
        e.history.push({
          at: new Date().toISOString(),
          by: user.initials,
          name: user.name,
          status: e.status,
          title: e.title,
          description: e.description,
          dueDate: e.dueDate,
          nextSteps: e.nextSteps,
        });
        e.status = "Erledigt";
        e.updatedAt = new Date().toISOString();
        e.completedAt = e.updatedAt;
        e.updatedBy = user.initials;
        e.updatedByName = user.name;
        e.updatedCompany = user.company;
        e.dueDate = "";
        if (!save()) {
          Object.assign(e, previous);
          return;
        }
        modal.close();
        shell();
        toast("Pendenz abgeschlossen. Die Historie bleibt erhalten.");
      };
    modal
      .querySelectorAll("[data-file]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            download(
              b.dataset.file,
              e.attachments.find((a) => a.id === b.dataset.file).name,
            )),
      );
  }
  function removeEntry(id) {
    const entry = data.entries.find((e) => e.id === id);
    if (!entry || !canDeleteEntry(user, entry)) return;
    modal.close();
    show(
      `<div class="modal-heading"><h2>Logbucheintrag löschen?</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>«${esc(entry.title)}» wird mit seinem Änderungsverlauf und seinen Anhängen dauerhaft gelöscht.</p></div><div class="modal-footer"><button class="secondary" id="cancel-entry-delete">Abbrechen</button><button class="danger-button" id="confirm-entry-delete">Endgültig löschen</button></div>`,
    );
    $("#cancel-entry-delete").onclick = () => {
      modal.close();
      entryDetail(id);
    };
    $("#confirm-entry-delete").onclick = () => {
      if (!canDeleteEntry(user, entry)) return;
      const previous = data.entries;
      data.entries = data.entries.filter((e) => e.id !== id);
      if (!save()) {
        data.entries = previous;
        return;
      }
      modal.close();
      shell();
      toast("Logbucheintrag gelöscht.");
    };
  }
  return { logView, bindFilters, entryForm, entryDetail };
}
