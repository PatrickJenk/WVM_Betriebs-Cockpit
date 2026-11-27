import { createJourfix } from "./features/jourfix.js";
import { createManagement } from "./admin/management.js";
import { canLead } from "./auth/roles.js";
import { createStructure } from "./admin/structure.js";
import {
  controlSheetTab,
  generalDocumentationId,
  siteTabs,
} from "./services/structure.js";
import { isOverdue } from "./services/entry-status.js";
import { entryMentions, mentionSummary } from "./services/mentions.js";
import { uuid } from "./services/ids.js";
// Einstiegspunkt: Daten laden, Navigation und Ansichten verbinden.
import {
  user,
  networks,
  sites,
  categories,
  stationIcon,
  stationLabel,
} from "./data/seed.js";
import {
  repository,
  putFile,
  getFile,
  deleteFile,
  lastError,
  authSettings,
  authHeaders,
  mentionState,
} from "./services/repository.js";
import { createAdministration } from "./admin/administration.js";
import { createCollaboration } from "./features/collaboration.js";
import {
  initializeAccounts,
  createAccounts,
  isAdministrator,
} from "./auth/accounts.js";
import { createLogbook } from "./features/logbook.js";
import { createDocuments } from "./features/documents.js";
import { createDashboard } from "./features/dashboard.js";
import { createControlRounds } from "./features/control-rounds.js";
import { newestControlSheetFirst } from "./services/control-sheet.js";
let data;
try {
  data = repository.load();
} catch {
  data = null;
}
if (!data) {
  document.querySelector("#app").textContent =
    "Der Server ist nicht erreichbar oder nicht korrekt eingerichtet. Bitte Serverkonsole prüfen.";
  throw Error("Storage unavailable");
}
data.folders ??= [];
initializeAccounts(data, user);
for (const sid of sites.map((s) => s.id)) {
  const loose = data.documents.filter(
    (d) =>
      d.siteId === sid &&
      !data.folders.some((f) => f.id === d.folderId && f.siteId === sid),
  );
  if (loose.length) {
    const id = uuid();
    data.folders.push({
      id,
      siteId: sid,
      parentId: null,
      name: "Bisherige Unterlagen",
    });
    loose.forEach((d) => (d.folderId = id));
  }
}
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let current = null,
  tab = "log",
  filters = {},
  onlyOpen = false;
const modal = $("#modal");
const icon = (name) => {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    heat: "M12 3c3 4-2 5 1 8 1-2 3-3 3-3 4 6 3 13-4 13S2 15 7 9c0 4 2 4 2 4-1-4 3-6 3-10Z",
    pin: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
    meter: "M4 4h16v16H4Z M7 8h10v5H7Z M8 17h.01 M12 17h.01 M16 17h.01",
    "heat-exchange":
      "M4 8h16 M16 4l4 4-4 4 M20 16H4 M8 12l-4 4 4 4 M9 5v14 M15 5v14",
    clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0",
    check: "m5 12 4 4L19 6",
    alert: "M12 8v5 M12 17h.01 M12 3 2 21h20Z",
    search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 1 1 16 0",
    file: "M14 2H5v20h14V7Z M14 2v6h5 M8 13h8 M8 17h6",
    folder: "M3 6h6l2 2h10v12H3z",
    person:
      "M16 21v-2a4 4 0 0 0-4-4h-1a4 4 0 0 0-4 4v2 M15.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
    plus: "M12 5v14 M5 12h14",
    chevron: "m9 5 7 7-7 7",
    menu: "M3 6h18 M3 12h18 M3 18h18",
    upload: "M12 16V3 m-5 5 5-5 5 5 M4 16v5h16v-5",
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${(
    paths[name] || paths.file
  )
    .split(" M")
    .map((p, i) => `<path d="${i ? "M" : ""}${p}"/>`)
    .join("")}</svg>`;
};
const site = (id) => sites.find((s) => s.id === id),
  network = (id) => networks.find((n) => n.id === id),
  plant = (id) => data.plants.find((p) => p.id === id)?.name || "Sonstiges";
const fmt = (d) =>
  new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
const time = (d) =>
  new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(
    new Date(),
  );
const overdue = (entry) => isOverdue(entry);
export function isVisible(entry) {
  return !!entry;
}
const open = (entries) => entries.filter((e) => e.status !== "Erledigt");
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
function save() {
  try {
    repository.save(data);
    return true;
  } catch (error) {
    recoverSession(error);
    toast(error.message || "Speichern fehlgeschlagen. Bitte erneut versuchen.");
    return false;
  }
}
const options = (values, selected) =>
  values
    .map((v) => {
      const [id, label] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
function syncStructure() {
  data.structure ??= {
    networks: structuredClone(networks),
    sites: structuredClone(sites),
    groups: [],
    sections: [],
  };
  networks.splice(0, networks.length, ...data.structure.networks);
  sites.splice(0, sites.length, ...data.structure.sites);
}
function shell() {
  syncStructure();
  if (current && !site(current)) {
    current = null;
    tab = "log";
    filters = {};
    history.replaceState(null, "", "#dashboard");
  }
  if (!user.id) {
    accounts.login();
    return;
  }
  const hash = location.hash;
  const documentation = hash === "#documentation";
  const personnel = hash === "#personnel" || hash === "#contacts";
  const inLeadership = jourfix.active();
  const access =
    data.jourfixAccess ||
    (isAdministrator(user) ? ["epc", "wvm"] : canLead(user) ? ["epc"] : []);
  const verbund = selectedNetwork();
  const networkOverview = hash === "#networks" || !!verbund;
  const dashboardActive =
    !current &&
    !documentation &&
    !personnel &&
    !inLeadership &&
    !networkOverview;
  const navLink = (route, label, active, symbol = "file") =>
    `<a href="${route}" class="nav-handbook${active ? ' active" aria-current="page' : ""}">${icon(symbol)} ${label}</a>`;
  const pageTitle = inLeadership
    ? "Austausch EPC + WVM"
    : verbund?.name ||
      (current
        ? site(current).name
        : documentation
          ? "Dokumentationen"
          : personnel
            ? "Betriebspersonal"
            : "Wärmeverbünde");
  const activeNetwork =
    verbund?.id || (current && site(current)?.heatNetworkId);
  const profileRole = user.backupAdmin
    ? "Backup-Admin · Notfallzugang"
    : user.systemRole === "main"
      ? "Hauptadministrator"
      : user.role;
  $("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="#dashboard"><span class="partner-logos sidebar-logos"><img class="marzili" src="/assets/marzili-logo.png" alt="Wärmeverbund Marzili Bern AG"><span class="partner-cross" aria-hidden="true">×</span><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></span><span class="brand-title">Wärmeverbund<small>Betriebs Cockpit</small></span></a><div class="nav-label">BETRIEB</div><a href="#dashboard" class="nav-dashboard${dashboardActive ? ' active" aria-current="page' : ""}">${icon("grid")} Dashboard</a>${navLink("#documentation", "Dokumentationen", documentation, "folder")}${navLink("#personnel", "Betriebspersonal", personnel, "person")}<div class="nav-label">WÄRMEVERBÜNDE</div>${networks
      .map((n) =>
        navLink(
          "#network/" + encodeURIComponent(n.id),
          "Wärmeverbund " + esc(n.name),
          activeNetwork === n.id,
          "pin",
        ),
      )
      .join(
        "",
      )}${access.length ? '<div class="nav-label">BETRIEBSFÜHRUNG</div>' + (access.includes("epc") ? navLink("#jourfix/epc", "Austausch EPC + WVM", location.hash.startsWith("#jourfix/epc")) : "") + (access.includes("wvm") ? navLink("#jourfix/wvm", "JF WVM", location.hash.startsWith("#jourfix/wvm")) : "") : ""}<div class="sidebar-bottom"><div class="local-info">Gemeinsame Betriebsplattform<small>Gemeinsame Serverdaten</small></div><div class="profile"><span class="avatar">${esc(user.initials)}</span><div>${esc(user.name)}<small>${esc(profileRole)}</small></div></div><div class="account-controls">${isAdministrator(user) ? '<button id="manage-cockpit">Cockpit verwalten</button>' : ""}${user.backupAdmin ? "" : '<button id="own-password-button">Passwort ändern</button>'}<button id="logout">Abmelden</button></div></div></aside><main><header class="topbar"><button class="icon-button mobile-toggle" title="Navigation öffnen" aria-label="Navigation öffnen">${icon("menu")}</button><span>${inLeadership ? "Betriebsführung" : "Betrieb"}${dashboardActive ? "" : ` <b>/</b> ${esc(pageTitle)}`}</span><div class="top-right"><span class="date">${fmt(new Date())}</span><span class="avatar small">${esc(user.initials)}</span></div></header><div class="content" id="content"></div></main>`;
  $(".mobile-toggle").onclick = () => $(".sidebar").classList.toggle("shown");
  $(".brand").onclick = resetDashboard;
  $(".nav-dashboard").onclick = resetDashboard;
  $("#logout").onclick = accounts.logout;
  if ($("#own-password-button"))
    $("#own-password-button").onclick = accounts.ownPassword;
  if (isAdministrator(user) && user.hostingPasswordChangeRequired) {
    $(".topbar").insertAdjacentHTML?.(
      "afterend",
      '<aside class="hosting-password-notice" role="status">Bitte ändere das Passwort von WVM-admin vor der Online-Freigabe. Verwende ein neues Passwort mit mindestens 12, besser 20 Zeichen. <button id="hosting-change-password" class="secondary">Passwort ändern</button></aside>',
    );
    if ($("#hosting-change-password"))
      $("#hosting-change-password").onclick = accounts.ownPassword;
  }
  if ($("#manage-cockpit"))
    $("#manage-cockpit").onclick = () =>
      createManagement({
        user,
        show,
        structure,
        accounts,
        collaboration,
      }).open();
  render();
}
function selectedNetwork() {
  return networks.find(
    (n) => location.hash === "#network/" + encodeURIComponent(n.id),
  );
}
function renderNetworks(verbund) {
  const root = $("#content");
  const card = (href, symbol, name, subtitle = "", search = "") =>
    `<article class="documentation-card station-card" data-station-search="${esc(search)}"><a class="documentation-card-open station-card-link" href="${href}">
      <span class="station-card-icon">${icon(symbol)}</span>
      <span class="station-card-text"><strong>${esc(name)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</span>
      <span class="station-card-end">${icon("chevron")}</span>
    </a></article>`;
  if (!verbund) {
    root.innerHTML = `<div class="page-heading"><h1>Wärmeverbünde</h1></div><div class="documentation-grid">${networks.map((n) => card("#network/" + encodeURIComponent(n.id), "heat", "Wärmeverbund " + n.name)).join("") || "<p>Keine Wärmeverbünde vorhanden.</p>"}</div>`;
    return;
  }
  const previousSearch = $("#station-search");
  const searchText =
    previousSearch?.dataset?.network === verbund.id ? previousSearch.value : "";
  const keepFocus = previousSearch && document.activeElement === previousSearch;
  const members = sites.filter((s) => s.heatNetworkId === verbund.id);
  const cards = (rows) =>
    rows
      .map((s) => {
        const group = data.structure.groups.find((g) => g.id === s.groupId);
        const code =
          verbund.id === "marzili"
            ? { eiger: "E73", monbijou: "M68", holzikofen: "H36" }[s.id]
            : "";
        const subtitle = [group?.name, code ? s.name : s.address]
          .filter(Boolean)
          .join(" · ");
        return card(
          "#site/" + encodeURIComponent(s.id),
          stationIcon(s),
          code || s.name,
          subtitle,
          [code, s.name, s.address, subtitle, stationLabel(s)].join(" "),
        );
      })
      .join("");
  const stationSection = (label, rows) =>
    `<section class="station-section"><h2>${label}</h2><div class="documentation-grid">${cards(rows)}</div>
      <p class="muted" data-station-empty ${rows.length ? "hidden" : ""}>${rows.length ? "Keine passenden Standorte." : "Keine Standorte vorhanden."}</p></section>`;
  root.innerHTML = `<a href="#networks">← Alle Wärmeverbünde</a><div class="page-heading"><h1>Wärmeverbund ${esc(verbund.name)}</h1></div>
    <label class="station-search">Standort suchen<input id="station-search" data-network="${esc(verbund.id)}" type="search" value="${esc(searchText)}" placeholder="Name, Adresse oder Unterkategorie"></label>
    ${stationSection(
      "Heizzentralen",
      members.filter((s) => !s.type),
    )}
    ${stationSection(
      "Unterstationen",
      members.filter((s) => s.type),
    )}`;
  {
    const search = $("#station-search");
    const sections = document.querySelectorAll("#content .station-section");
    const filter = () => {
      const term = search.value.trim().toLocaleLowerCase("de-CH");
      for (const section of sections) {
        let matches = 0;
        for (const station of section.querySelectorAll(
          "[data-station-search]",
        )) {
          station.hidden = !station.dataset.stationSearch
            .toLocaleLowerCase("de-CH")
            .includes(term);
          if (!station.hidden) matches++;
        }
        section.querySelector("[data-station-empty]").hidden = matches > 0;
      }
    };
    search.oninput = filter;
    if (searchText) filter();
    if (keepFocus) search.focus({ preventScroll: true });
  }
}
function controlTemplate(siteId) {
  return data.controlTemplates?.find(
    (item) => item.siteId === siteId && !item.kind,
  );
}
function controlSheetView(siteId) {
  const template = controlTemplate(siteId);
  const archive = data.documents
    .filter((doc) => doc.siteId === siteId && doc.controlRun)
    .sort(newestControlSheetFirst);
  const runs = new Map(
    (data.controlRuns || []).map((run) => [run.documentId, run]),
  );
  return `<div class="panel-heading"><h2>Kontrollblatt</h2>${isAdministrator(user) ? '<button type="button" class="secondary" id="control-edit-template">Vorlagen bearbeiten</button>' : ""}</div>
    <div class="form-body"><button class="control-open-card secondary" type="button" id="control-open">${icon("file")}<span><strong>Neuer Kontrollrundgang</strong><small>Kontrollblatt öffnen</small></span></button></div>
    ${template?.sourceId ? '<details class="form-body"><summary>Bisherige PDF-Vorlage</summary><button type="button" class="secondary" id="control-open-pdf">PDF-Vorlage öffnen</button></details>' : ""}
    ${
      archive.length
        ? `<div class="form-body"><h3>Abgelegte Kontrollblätter</h3><div class="table-scroll"><table class="explorer-files"><thead><tr><th>Kontrollblatt</th><th>Kontrollintervall</th><th>Erstellt am</th></tr></thead><tbody>${archive
            .map((doc) => {
              const run = runs.get(doc.id);
              return `<tr><td><a href="/api/files/${encodeURIComponent(doc.id)}?inline=1" target="_blank" rel="noopener noreferrer">${esc(run?.title || doc.name)}</a></td><td>${esc(run?.interval || "–")}</td><td>${esc(fmt(doc.uploadedAt))}</td></tr>`;
            })
            .join("")}</tbody></table></div></div>`
        : ""
    }`;
}
async function openControlSheet(siteId, template) {
  show(`<div class="modal-heading"><div><h2>${esc(template.title || "Kontrollblatt")}</h2><p>${esc(site(siteId).name)}</p></div><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div>
    <div class="control-workspace-body"><div id="control-pdf-viewer" role="region" aria-label="Ausfüllbares PDF" tabindex="0"><div class="pdfViewer"></div></div></div>
    <div class="modal-footer control-pdf-footer"><div class="control-pdf-zoom" role="group" aria-label="PDF-Zoom" hidden><button class="secondary" type="button" data-pdf-zoom="out" aria-label="PDF verkleinern">−</button><button class="secondary" type="button" data-pdf-zoom="fit">Seitenbreite</button><button class="secondary" type="button" data-pdf-zoom="in" aria-label="PDF vergrössern">+</button></div><p id="control-pdf-status" role="status">PDF wird geladen …</p><button class="primary" id="control-pdf-save" type="button" disabled>Abschliessen und PDF ablegen</button></div>`);
  modal.classList.add("control-workspace");
  const request = new AbortController();
  const viewer = $("#control-pdf-viewer");
  const status = $("#control-pdf-status");
  const save = $("#control-pdf-save");
  const close = modal.querySelector(".close");
  const runId = uuid();
  modal.addEventListener(
    "close",
    () => {
      request.abort();
      modal.classList.remove("control-workspace");
    },
    { once: true },
  );
  const previewRoute =
    "/api/sites/" + encodeURIComponent(siteId) + "/control-preview";
  try {
    const { openControlPdf } = await import("./features/control-pdf.js");
    const editor = await openControlPdf(
      viewer,
      previewRoute,
      authHeaders(),
      template,
      request.signal,
    );
    if (!modal.open) return;
    status.textContent = "";
    save.disabled = false;
    viewer.addEventListener("input", () => {
      if (!save.disabled) status.textContent = "";
    });
    const zoom = modal.querySelector(".control-pdf-zoom");
    zoom.hidden = false;
    zoom.onclick = (event) => {
      const direction =
        event.target.closest("[data-pdf-zoom]")?.dataset.pdfZoom;
      if (direction) editor.zoom(direction);
    };
    save.onclick = async () => {
      save.disabled = true;
      close.disabled = true;
      status.textContent = "PDF wird gespeichert …";
      try {
        const bytes = await editor.save();
        await repository.saveControlPdf(
          siteId,
          template.version,
          runId,
          bytes,
          data,
        );
        modal.close();
        render();
        toast("Kontrollblatt abgeschlossen und unter «Dokumente» abgelegt.");
      } catch (error) {
        status.textContent = error.message;
        save.disabled = false;
        close.disabled = false;
      }
    };
  } catch (error) {
    if (!request.signal.aborted) status.textContent = error.message;
  }
}
function bindControlSheet(siteId) {
  $("#control-open").onclick = () => controlRounds.create(siteId);
  if ($("#control-edit-template"))
    $("#control-edit-template").onclick = () => controlRounds.edit(siteId);
  const legacy = $("#control-open-pdf");
  if (legacy)
    legacy.onclick = () => openControlSheet(siteId, controlTemplate(siteId));
}
function render() {
  if (!user.id) {
    accounts.login();
    return;
  }
  const verbund = selectedNetwork();
  if (location.hash === "#networks" || verbund) {
    renderNetworks(verbund);
    return;
  }
  if (location.hash === "#documentation") {
    $("#content").innerHTML = generalView();
    bindGeneral();
    return;
  }
  if (location.hash === "#personnel" || location.hash === "#contacts") {
    collaboration.contacts();
    return;
  }
  if (jourfix.active()) {
    jourfix.render();
    return;
  }
  const s = current ? site(current) : null;
  const tabs = s ? siteTabs(data, current) : [];
  if (s && !tabs.some((t) => t.key === tab)) {
    tab = tabs[0]?.key || null;
    filters = {};
  }
  const entries = data.entries.filter(
    (e) => isVisible(e) && (!current || e.siteId === current),
  );
  const mentions =
    !s &&
    mentionSummary(
      data.entries.filter((e) => isVisible(e)),
      user,
      data.users,
      mentionState.seen,
    );
  const pageActions = `<div class="page-actions">${mentions ? `<button class="secondary mentions-button mentions-${mentions.color}" id="my-mentions" title="Meine Erwähnungen" aria-label="Meine Erwähnungen"><span aria-hidden="true">✉</span></button>` : ""}<button class="primary new-entry">${icon("plus")} Neuer Logbucheintrag</button></div>`;
  $("#content").innerHTML =
    `${s ? `<a href="#network/${encodeURIComponent(s.heatNetworkId)}">← Wärmeverbund ${esc(network(s.heatNetworkId).name)}</a>` : ""}${!current ? '<a href="#dashboard" class="dashboard-logo partner-logos" aria-label="Dashboard"><img class="marzili" src="/assets/marzili-logo.png" alt="Wärmeverbund Marzili Bern AG"><span class="partner-cross" aria-hidden="true">×</span><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></a>' : ""}<div class="page-heading"><div><div class="eyebrow">${s ? "WÄRMEVERBUND " + esc(network(s.heatNetworkId).name.toUpperCase()) : "GEMEINSAM. ÜBERSICHTLICH. IM BETRIEB."}</div><h1>${s ? esc(s.name) : "Wärmeverbund Betriebs Cockpit"}</h1><p>${s ? stationLabel(s) + " · Betriebsdokumentation und Unterlagen." : "Übersicht über aktuelle Einträge und offene Pendenzen aller Wärmeverbünde."}</p></div>${pageActions}</div>${
      s
        ? `<div class="site-banner"><span class="station-type">${icon(stationIcon(s))} ${esc(stationLabel(s))}</span><a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address + ", Schweiz")}" target="_blank" rel="noopener noreferrer" title="Adresse in Google Maps öffnen">${icon("pin")} ${esc(s.address)} </a>${isAdministrator(user) ? '<button class="secondary" id="manage-plants">Anlagen verwalten</button>' : ""}</div><div class="tabs">${tabs.map((t) => `<div class="tab-item"><button data-tab="${esc(t.key)}" class="${tab === t.key ? "selected" : ""}">${icon("file")} ${esc(t.name)}</button>${isAdministrator(user) ? `<button class="tab-edit" data-edit-section="${esc(t.id)}" aria-label="Register bearbeiten: ${esc(t.name)}" title="Register bearbeiten">✎</button>` : ""}</div>`).join("")}${isAdministrator(user) ? '<button id="new-section" title="Register hinzufügen">+ Register</button><button id="manage-tabs" title="Register und Reihenfolge verwalten">✎ Register verwalten</button>' : ""}</div>`
        : dashboard()
    }<section class="panel">${s && !tab ? '<div class="empty"><h3>Keine Register eingeblendet</h3><p>Administratoren können über «Register verwalten» Register wieder einblenden oder hinzufügen.</p></div>' : s && tab === controlSheetTab ? controlSheetView(current) : s && tab !== "log" ? documentsView() : logView(entries)}</section><footer>Wärmeverbund Betriebs Cockpit <span>Daten werden zentral und geschützt am Server gespeichert</span></footer>`;
  $(".new-entry").onclick = () => entryForm();
  if ($(".dashboard-logo")) $(".dashboard-logo").onclick = resetDashboard;
  if ($("#my-mentions"))
    $("#my-mentions").onclick = () => {
      try {
        repository.markMentionsSeen?.(mentions.entries.map((e) => e.id));
      } catch (error) {
        toast(error.message);
        return;
      }
      current = null;
      tab = "log";
      onlyOpen = false;
      filters = { mine: true };
      if (location.hash !== "#dashboard")
        history.replaceState(null, "", "#dashboard");
      shell();
    };
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        filters = {};
        render();
      }),
  );
  document.querySelectorAll("[data-network]").forEach(
    (b) =>
      (b.onclick = () => {
        filters = { network: b.dataset.network };
        render();
      }),
  );
  document.querySelectorAll("[data-kpi]").forEach(
    (b) =>
      (b.onclick = () => {
        onlyOpen = b.dataset.kpi === "open";
        filters =
          b.dataset.kpi === "late"
            ? { late: true }
            : b.dataset.kpi === "week"
              ? { period: "week" }
              : {};
        render();
        document
          .querySelector(".panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
  );
  bindFilters();
  document
    .querySelectorAll("[data-entry]")
    .forEach((b) => (b.onclick = () => entryDetail(b.dataset.entry)));
  if (s && tab === controlSheetTab) bindControlSheet(current);
  else if (s && tab && tab !== "log") bindDocs();
  if ($("#new-section"))
    $("#new-section").onclick = () =>
      structure.form("sections", null, { siteId: current });
  if ($("#manage-tabs"))
    $("#manage-tabs").onclick = () => structure.manageTabs(current);
  document.querySelectorAll("[data-edit-section]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        structure.form("sections", b.dataset.editSection, { siteId: current });
      }),
  );
  if ($("#manage-plants"))
    $("#manage-plants").onclick = () => admin.plants(current);
}

function selectFilter(key, label, values) {
  return `<label class="filter"><span>${label}</span><select data-filter="${key}"><option value="">${key === "status" ? "Offene Arbeiten" : "Alle"}</option>${options(values, filters[key])}</select></label>`;
}
function show(html, back) {
  modal.innerHTML = html;
  modal.showModal();
  const close = modal.querySelector(".close");
  if (close.tagName === "BUTTON") close.type = "button";
  close.onclick = () => modal.close();
  if (back) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary modal-back";
    button.textContent = "Zurück";
    button.onclick = back;
    close.before(button);
  }
}
let sessionDialog;
function recoverSession(error) {
  if (
    error.status !== 401 ||
    !modal.open ||
    !user.id ||
    sessionDialog ||
    !modal.querySelector(
      "#entry-form, #control-round-form, #control-form-editor",
    )
  )
    return;
  const accountId = user.id;
  const dialog = document.createElement("dialog");
  sessionDialog = dialog;
  dialog.innerHTML = `<form class="form-body">
    <h2>Erneut anmelden</h2>
    <p>Deine Eingaben bleiben geöffnet. Melde dich mit demselben Konto an und speichere danach erneut.</p>
    <label>Benutzername<input name="username" autocomplete="username" value="${esc(user.initials)}" required></label>
    <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
    <p role="alert"></p>
    <button type="submit" class="primary">Anmelden</button>
    <button type="button" class="secondary">Abbrechen</button>
  </form>`;
  document.body.append(dialog);
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      sessionDialog = null;
    },
    { once: true },
  );
  dialog.querySelector('button[type="button"]').onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const fields = event.currentTarget.elements;
    try {
      repository.reauthenticate(
        fields.username.value.trim(),
        fields.password.value,
        accountId,
      );
      dialog.close();
      toast("Wieder angemeldet. Bitte speichere erneut.");
    } catch (loginError) {
      dialog.querySelector('[role="alert"]').textContent = loginError.message;
    } finally {
      fields.password.value = "";
    }
  };
  dialog.showModal();
}
const getState = () =>
  location.hash === "#documentation"
    ? { current: generalDocumentationId, tab: "docs", filters, onlyOpen }
    : { current, tab, filters, onlyOpen };
const context = {
  data,
  user,
  isVisible,
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
  open,
  options,
  show,
  modal,
  save,
  checkSession: repository.checkSession,
  recoverSession,
  render,
  shell,
  toast,
  putFile,
  getFile,
  deleteFile,
  getState,
  onStructureChange: (result) => {
    if (
      result.kind === "sections" &&
      !result.deleted &&
      result.siteId === current
    ) {
      tab = result.tab;
      filters = {};
    }
    shell();
  },
  selectFilter,
  resetFilters: () => {
    filters = {};
    onlyOpen = false;
  },
  getAdmin: () => admin,
};
const structure = createStructure(context);
const collaboration = createCollaboration(context);
const { documentsView, bindDocs, generalView, bindGeneral, download } =
  createDocuments({
    ...context,
    site: (id) =>
      id === generalDocumentationId ? { name: "Dokumentationen" } : site(id),
  });
const { logView, bindFilters, entryForm, entryDetail } = createLogbook({
  ...context,
  download,
});
const dashboard = createDashboard(context);
const controlRounds = createControlRounds({ ...context, repository });
const jourfix = createJourfix(context);
const accounts = createAccounts({
  data,
  user,
  esc,
  options,
  show,
  modal,
  save,
  shell,
  toast,
  authenticate: repository.authenticate
    ? (name, password) => {
        const chosen = repository.authenticate(name, password);
        if (chosen) Object.assign(data, repository.load());
        return chosen;
      }
    : undefined,
  changePassword: repository.changePassword
    ? (password, currentPassword) =>
        repository.changePassword(password, data, currentPassword)
    : undefined,
  getAuthError: () => lastError,
  getPasswordMinimum: () => authSettings?.passwordMinimum || 8,
  getAudit: repository.audit,
  editAccount: collaboration.account,
  manageAccount: async (path, method, values) => {
    const result = await repository.manageAccount(path, method, values);
    Object.assign(data, repository.load());
    if (accounts.restore()) shell();
    return result;
  },
  onLogin: () =>
    repository.migrateLocal?.(data, toast).then(() => {
      if (user.id) route();
    }),
  onLogout: () => {
    repository.logout?.();
    controlRounds.clear();
  },
});
const admin = createAdministration({
  getState,
  data,
  user,
  esc,
  options,
  show,
  modal,
  save,
  render,
  toast,
});
function resetDashboard(event) {
  event?.preventDefault();
  history.replaceState(null, "", "#dashboard");
  route();
}
let lastRoute = location.hash;
let routing = false;
async function route() {
  if (routing) return;
  if (jourfix.isDirty()) {
    routing = true;
    try {
      await jourfix.saveBeforeLeave();
    } catch (error) {
      history.replaceState(null, "", lastRoute);
      toast(error.message);
      return;
    } finally {
      routing = false;
    }
  }
  if (/^#leadership(?:\/|$)/.test(location.hash))
    history.replaceState(null, "", "#jourfix/epc");
  lastRoute = location.hash;
  syncStructure();
  const match = sites.find(
    (s) => location.hash === "#site/" + encodeURIComponent(s.id),
  );
  current = match?.id || null;
  tab = "log";
  filters = {};
  onlyOpen = false;
  shell();
  const entryMatch = location.hash.match(/^#entry\/([a-zA-Z0-9-]{1,100})$/);
  if (entryMatch) {
    const entry = data.entries.find(
      (e) => e.id === entryMatch[1] && isVisible(e),
    );
    if (entry) entryDetail(entry.id);
    else toast("Eintrag nicht verfügbar oder keine Berechtigung.");
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (event) => {
  if (
    jourfix.isDirty() ||
    (modal.open &&
      modal.querySelector('#entry-form input[type="file"]')?.files.length)
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === "waerme-cockpit-v1") {
    Object.assign(data, repository.load());
    data.folders ??= [];
    if (!accounts.restore()) {
      accounts.logout();
      return;
    }
    shell();
  }
});
modal.addEventListener("cancel", (event) => event.preventDefault());
setInterval(() => {
  if (user.id && !jourfix.active()) render();
}, 60000);
if (accounts.restore()) {
  route();
  repository.migrateLocal?.(data, toast).then(() => {
    if (user.id) render();
  });
} else accounts.login();

let syncing = false;
setInterval(async () => {
  if (!user.id || modal.open || syncing || !repository.refresh) return;
  syncing = true;
  try {
    const updated = await repository.refresh();
    if (updated && !modal.open) {
      Object.assign(data, updated);
      if (!accounts.restore()) accounts.logout();
      else if (!jourfix.active()) shell();
    }
  } catch (error) {
    if (error.status === 401 && !modal.open) accounts.logout();
  } finally {
    syncing = false;
  }
}, 2500);
