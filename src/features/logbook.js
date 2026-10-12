import { uuid } from "../services/ids.js";
import {
  findMentions,
  entryMentions,
  isPersonalEntry,
} from "../services/mentions.js";
import { isAdministrator } from "../auth/accounts.js";
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
    return `<details class="entry-people"><summary class="person ${color}" title="Ersteller und Bearbeiter anzeigen">${participants.length === 1 ? esc(initials) : participants.length}</summary><div class="people-popup"><b>Ersteller und Bearbeiter</b><ul>${participants.map((p) => `<li class="${p.company === "EPC" ? "company-epc" : "company-wvm"}">${esc(p.name)}</li>`).join("")}</ul></div></details>`;
  };
  function badges(e) {
    let { current, filters, onlyOpen } = getState();
    return `<span class="badge ${e.status === "Erledigt" ? "done" : e.status === "Pendenz" ? "pending" : "progress"}">${esc(e.status)}</span>${overdue(e) ? '<span class="badge late">Überfällig</span>' : ""}`;
  }
  function priority(e) {
    let { current, filters, onlyOpen } = getState();
    return e.priority
      ? `<span class="priority ${e.priority.toLowerCase()}"><i></i>${esc(e.priority)}</span>`
      : '<span class="muted">—</span>';
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
          (!filters.status || e.status === filters.status) &&
          (!filters.priority || e.priority === filters.priority) &&
          (!filters.person || editor(e) === filters.person) &&
          (!filters.mine || isPersonalEntry(e, user, data.users)) &&
          (!filters.high ||
            (["Hoch", "Kritisch"].includes(e.priority) &&
              e.status !== "Erledigt")) &&
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
    return `<div class="panel-heading"><div><h2>${current ? "Logbuch" : "Letzte Einträge"}</h2><p>${current ? "Alle Arbeiten und Beobachtungen an einem Ort." : "Aktuelle Betriebsdokumentation aus allen Standorten."}</p></div><span class="result-count">${rows.length} Einträge</span></div><div class="search-row"><label class="search">${icon("search")}<input id="search" aria-label="Logbuch durchsuchen" placeholder="Logbuch durchsuchen …" value="${esc(filters.search || "")}"></label><button class="secondary" id="reset">Filter zurücksetzen</button></div><div class="filters">${
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
    )}${selectFilter("status", "Status", ["Erledigt", "Pendenz", "In Bearbeitung"])}${selectFilter("priority", "Priorität", ["Gering", "Mittel", "Hoch"])}${selectFilter("person", "Person", Array.from(new Set(entries.map(editor))))}<label class="filter"><span>Von</span><input type="date" data-filter="from" value="${esc(filters.from || "")}"></label><label class="filter"><span>Bis</span><input type="date" data-filter="to" value="${esc(filters.to || "")}"></label></div>${filters.mine ? '<div class="active-filter">Meine Erwähnungen</div>' : ""}${onlyOpen || filters.high || filters.late || filters.period ? '<div class="active-filter">Gefilterte Betriebsübersicht</div>' : ""}<div id="rows">${table(rows)}</div>`;
  }
  function table(rows) {
    let { current, filters, onlyOpen } = getState();
    return rows.length
      ? `<div class="table-scroll"><table><thead><tr><th>DATUM / ZEIT</th>${!current ? "<th>WÄRMEVERBUND / STANDORT</th>" : ""}<th>ANLAGE / KURZBESCHREIBUNG</th><th>STATUS</th><th>PRIORITÄT</th><th>BETEILIGTE PERSONEN</th><th></th></tr></thead><tbody>${rows.map((e) => `<tr><td><b>${fmt(e.occurredAt)}</b><small>${time(e.occurredAt)} Uhr</small></td>${!current ? `<td><b>${esc(network(site(e.siteId).heatNetworkId).name)}</b><small>${esc(site(e.siteId).name)}</small></td>` : ""}<td class="description"><small>${esc(plant(e.plantId))}</small><button data-entry="${e.id}">${esc(e.title)}</button></td><td><div class="badges">${badges(e)}</div></td><td>${priority(e)}</td><td>${person(e)}</td><td><button class="icon-button" data-entry="${e.id}" aria-label="Eintrag öffnen: ${esc(e.title)}" title="Eintrag öffnen">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`
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
        $(".result-count").textContent =
          filtered(data.entries.filter((e) => !current || e.siteId === current))
            .length + " Einträge";
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
    let { current, filters, onlyOpen } = getState();
    const guess = new Date(value + "Z");
    const offset = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Zurich",
        timeZoneName: "shortOffset",
      })
        .formatToParts(guess)
        .find((p) => p.type === "timeZoneName")
        .value.replace("GMT", ""),
    );
    return new Date(guess.getTime() - offset * 3600000).toISOString();
  }
  function entryForm(id) {
    if (!user.id) return;
    const { current } = getState(),
      entry = data.entries.find((e) => e.id === id);
    if (id && (!entry || !context.isVisible(entry))) return;
    const openedAt = new Date().toISOString();
    const sid = entry?.siteId || current || "";
    const nid = sid ? site(sid).heatNetworkId : "";
    const availablePlants = (siteId) =>
      data.plants.filter((p) => p.siteId === siteId && p.active && !p.deleted);
    const fixed = entry
      ? `<div class="entry-fixed full"><p><b>Wärmeverbund:</b> ${esc(network(nid).name)}<br><b>Standort:</b> ${esc(site(sid).name)}<br><b>Anlage:</b> ${esc(plant(entry.plantId))}<br><b>Datum / Uhrzeit:</b> ${fmt(entry.occurredAt)} ${time(entry.occurredAt)}<br><b>Titel:</b> ${esc(entry.title)}<br><b>Status:</b> ${esc(entry.status)}<br><b>Priorität:</b> ${esc(entry.priority || "—")}</p></div><div class="full"><h3>Bisherige Beschreibung</h3><p class="prewrap">${esc(entry.description)}</p></div>`
      : "";
    show(
      `<form id="entry-form"><div class="modal-heading"><h2>${entry ? "Logbucheintrag ergänzen" : "Neuer Logbucheintrag"}</h2><button type="button" class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><div class="form-grid">${
        entry
          ? fixed
          : `<label>Wärmeverbund<select name="networkId" required><option value="">Bitte wählen</option>${options(
              networks.map((n) => [n.id, n.name]),
              nid,
            )}</select></label><label>Standort<select name="siteId" required ${nid ? "" : "disabled"}><option value="">Bitte Standort wählen</option>${options(
              sites
                .filter((s) => s.heatNetworkId === nid)
                .map((s) => [s.id, s.name]),
              sid,
            )}</select></label><label class="full">Datum und Uhrzeit<input readonly value="${fmt(openedAt)} ${time(openedAt)}"></label><label class="full">Anlage<select name="plantId" required ${sid ? "" : "disabled"}><option value="">Bitte Anlage wählen</option>${options(availablePlants(sid).map((p) => [p.id, p.name]))}</select></label><label class="full">Titel / Kurzbeschreibung<input name="title" required maxlength="180"></label>`
      }<label class="full">${entry ? "Beschreibung ergänzen" : "Beschreibung"}<span class="mentions-info">@Name schreiben, um Personen zu markieren.</span><textarea name="description" rows="4" ${entry ? "" : "required"} placeholder="${entry ? "Neue Feststellungen oder Arbeiten ergänzen …" : "Feststellungen, Arbeiten und Messwerte dokumentieren …"}"></textarea></label>${`<label class="full">Status<select name="status">${options(["Erledigt", "Pendenz", "In Bearbeitung"], "Erledigt")}</select></label><label class="full">Priorität<select name="priority">${options(["Gering", "Mittel", "Hoch"], entry?.priority || "Mittel")}</select></label>${entry ? "" : `<div class="full form-grid pending-fields"><label>Fälligkeitsdatum (optional)<input name="dueDate" type="date"></label><label class="full">Notiz / nächste Schritte<textarea name="nextSteps" rows="3"></textarea></label></div>`}`}<label class="full">Dateien oder Bilder (optional)<input name="files" type="file" multiple></label></div><p class="form-info">${entry ? "Bestehende Angaben bleiben erhalten. Beschreibung und Dateien werden hinzugefügt." : "Datum und Uhrzeit entsprechen dem Öffnen dieses Formulars."}</p><p id="form-error" role="alert"></p></div><div class="modal-footer"><button type="button" class="secondary cancel">Abbrechen</button><button class="primary" type="submit">${entry ? "Ergänzung speichern" : "Eintrag speichern"}</button></div></form>`,
    );
    const form = $("#entry-form"),
      fields = form.elements;
    bindMentions(fields.description);
    if (fields.nextSteps) bindMentions(fields.nextSteps);
    form.querySelector(".cancel").onclick = () => modal.close();
    if (!entry) {
      const refreshPlants = () => {
        const plants = availablePlants(fields.siteId.value);
        fields.plantId.innerHTML =
          '<option value="">' +
          (plants.length
            ? "Bitte Anlage wählen"
            : "Keine Anlagen freigegeben") +
          "</option>" +
          options(plants.map((p) => [p.id, p.name]));
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
      if (
        entry &&
        !description &&
        !files.length &&
        fields.status.value === entry.status &&
        fields.priority.value === entry.priority
      ) {
        $("#form-error").textContent =
          "Bitte eine Beschreibung oder Dateien ergänzen.";
        return;
      }
      if (
        !entry &&
        (!fields.title.value.trim() ||
          !description ||
          !availablePlants(fields.siteId.value).some(
            (p) => p.id === fields.plantId.value,
          ))
      ) {
        $("#form-error").textContent =
          "Bitte Standort, freigegebene Anlage, Titel und Beschreibung auswählen.";
        return;
      }
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const attachments = [...(entry?.attachments || [])];
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
              status: fields.status.value,
              priority: fields.priority.value,
              completedAt:
                fields.status.value === "Erledigt"
                  ? entry.status === "Erledigt"
                    ? entry.completedAt || entry.updatedAt
                    : now
                  : null,
              dueDate: fields.status.value === "Erledigt" ? "" : entry.dueDate,
              description: description
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
              priority: fields.priority.value,
              dueDate:
                fields.status.value === "Erledigt" ? "" : fields.dueDate.value,
              nextSteps: fields.nextSteps.value,
              occurredAt: openedAt,
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
        toast("Logbucheintrag gespeichert.");
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
    show(
      `<div class="modal-heading"><div><div class="eyebrow">${esc(site(e.siteId).name)} · ${esc(plant(e.plantId))}</div><h2>${esc(e.title)}</h2></div><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><div class="detail-meta">${badges(e)} ${priority(e)}</div><p class="muted">${fmt(e.occurredAt)} · ${time(e.occurredAt)} Uhr · Erfasst von ${esc(e.createdByName || data.users.find((u) => u.initials === e.createdBy)?.name || e.createdBy)}<br>Ersteller / Bearbeiter: ${person(e)}<br>Zuletzt ergänzt: ${esc(e.updatedByName || editor(e))} · ${fmt(e.updatedAt)} ${time(e.updatedAt)}</p>${
        entryMentions(e, data.users).length
          ? `<p><b>Erwähnte Personen:</b> ${entryMentions(e, data.users)
              .map((p) => esc(p.name))
              .join(", ")}</p>`
          : ""
      }<h3>Dokumentation</h3><p class="prewrap">${esc(e.description)}</p>${e.dueDate ? `<p><b>Fällig:</b> ${fmt(e.dueDate + "T12:00:00")}</p>` : ""}${e.nextSteps ? `<h3>Nächste Schritte</h3><p class="prewrap">${esc(e.nextSteps)}</p>` : ""}${e.attachments?.length ? `<h3>Anhänge</h3>${e.attachments.map((a) => `<button class="secondary attachment" data-file="${a.id}">${icon("file")} ${esc(a.name)}</button>`).join("")}` : ""}${isAdministrator(user) ? `<details class="history"><summary>Änderungsverlauf (${e.history?.length || 0})</summary><p>Erstellt am ${fmt(e.createdAt)} · ${time(e.createdAt)} · ${esc(e.createdBy)}</p>${(e.history || []).map((h) => `<p>${fmt(h.at)} · ${time(h.at)} · ${esc(h.name || h.by)}<br>Vorher: ${esc(h.status)} · ${esc(h.title)}</p>`).join("")}</details>` : ""}</div><div class="modal-footer">${isAdministrator(user) ? '<button class="danger-button" id="delete-entry">Eintrag löschen</button>' : ""}<button class="secondary" id="edit">Bearbeiten</button>${e.status !== "Erledigt" ? '<button class="primary" id="complete">' + icon("check") + " Als erledigt markieren</button>" : ""}</div>`,
    );
    if (isAdministrator(user))
      $("#delete-entry").onclick = () => removeEntry(id);
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
          priority: e.priority,
          dueDate: e.dueDate,
          nextSteps: e.nextSteps,
        });
        e.status = "Erledigt";
        e.updatedAt = new Date().toISOString();
        e.completedAt = e.updatedAt;
        e.updatedBy = user.initials;
        e.updatedByName = user.name;
        e.updatedCompany = user.company;
        // Priorität bleibt auch nach Abschluss erhalten.
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
    if (!isAdministrator(user)) return;
    const entry = data.entries.find((e) => e.id === id);
    if (!entry) return;
    modal.close();
    show(
      `<div class="modal-heading"><h2>Logbucheintrag löschen?</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>«${esc(entry.title)}» wird mit seinem Änderungsverlauf und seinen Anhängen dauerhaft gelöscht.</p></div><div class="modal-footer"><button class="secondary" id="cancel-entry-delete">Abbrechen</button><button class="danger-button" id="confirm-entry-delete">Endgültig löschen</button></div>`,
    );
    $("#cancel-entry-delete").onclick = () => {
      modal.close();
      entryDetail(id);
    };
    $("#confirm-entry-delete").onclick = () => {
      if (!isAdministrator(user)) return;
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
