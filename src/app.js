import { createStructure } from "./admin/structure.js";
import { siteTabs } from "./services/structure.js";
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
  mentionState,
} from "./services/repository.js";
import { createAdministration } from "./admin/administration.js";
import {
  initializeAccounts,
  createAccounts,
  isAdministrator,
} from "./auth/accounts.js";
import { createLogbook } from "./features/logbook.js";
import { createDocuments } from "./features/documents.js";
import { createDashboard } from "./features/dashboard.js";
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
export function isVisible(entry, now = new Date()) {
  if (!entry) return false;
  if (isAdministrator(user) || entry.status !== "Erledigt") return true;
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
  }).format(now);
  const month = Number(date.slice(5, 7));
  const quarterStart =
    date.slice(0, 4) +
    "-" +
    String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0") +
    "-01";
  const completed = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
  }).format(new Date(entry.completedAt || entry.updatedAt || entry.createdAt));
  return completed >= quarterStart;
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
let navState = {};
function navExpanded(id) {
  return navState[id] === true;
}
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
  $("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="#dashboard"><span class="partner-logos sidebar-logos"><img class="marzili" src="/assets/marzili-logo.png" alt="Wärmeverbund Marzili Bern AG"><span class="partner-cross" aria-hidden="true">×</span><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></span><span class="brand-title">Wärmeverbund<small>Betriebs Cockpit</small></span></a><div class="nav-label">BETRIEBSFÜHRUNG</div><a href="#dashboard" class="nav-dashboard ${!current ? "active" : ""}">${icon("grid")} Dashboard</a><a href="/api/handbook" target="_blank" rel="noopener noreferrer" class="nav-handbook">${icon("file")} Benutzerhandbuch</a><div class="nav-label">WÄRMEVERBÜNDE ${isAdministrator(user) ? '<button class="nav-add" id="network-add" title="Wärmeverbund hinzufügen">+</button>' : ""}</div>${networks
      .map(
        (n) =>
          `<details class="network-group" data-nav-group="${n.id}" ${navExpanded(n.id) ? "open" : ""}><summary>${icon("pin")}<span>Wärmeverbund ${esc(n.name)}</span>${editStructure("networks", n)}<span class="caret">⌄</span></summary>${[
            ["heating", "Heizzentralen", "heat", false],
            ["substations", "Unterstationen", "meter", true],
          ]
            .map(([key, label, symbol, substation]) => {
              const members = sites.filter(
                (s) =>
                  s.heatNetworkId === n.id &&
                  !s.groupId &&
                  Boolean(s.type) === substation,
              );
              const groupId = n.id + "-" + key;
              return `<details class="station-group" data-nav-group="${groupId}" ${navExpanded(groupId, members) ? "open" : ""}><summary>${icon(symbol)}<span>${label}</span><small>${members.length}</small><span class="caret">⌄</span></summary>${isAdministrator(user) ? `<button class="nav-create" data-new-site="${esc(n.id)}" data-site-type="${substation ? "mbus" : ""}">+ ${substation ? "Unterstation" : "Heizzentrale"}</button>` : ""}${members.map((s) => `<div class="site-nav-row"><a class="site-link ${current === s.id ? "active" : ""}" href="#site/${s.id}" title="${esc(stationLabel(s))}">${icon(stationIcon(s))}${esc(s.name)}${open(data.entries.filter((e) => e.siteId === s.id)).length ? '<span class="nav-count">' + open(data.entries.filter((e) => e.siteId === s.id)).length + "</span>" : ""}</a>${editStructure("sites", s)}</div>`).join("")}</details>`;
            })
            .join(
              "",
            )}${categoryTree(n.id)}${isAdministrator(user) ? `<button class="nav-create" data-new-group="${esc(n.id)}">+ Unterkategorie</button>` : ""}</details>`,
      )
      .join(
        "",
      )}<div class="sidebar-bottom"><div class="local-info">Gemeinsame Betriebsplattform<small>Gemeinsame Serverdaten</small></div><div class="profile"><span class="avatar">${esc(user.initials)}</span><div>${esc(user.name)}<small>${esc(user.role)}</small></div></div><div class="account-controls">${isAdministrator(user) ? '<button id="manage-structure">Navigation verwalten</button><button id="manage-users">Benutzer verwalten</button>' : ""}<button id="logout">Abmelden</button></div></div></aside><main><header class="topbar"><button class="icon-button mobile-toggle" title="Navigation öffnen" aria-label="Navigation öffnen">${icon("menu")}</button><span>Betriebsführung <b>/</b> ${current ? esc(site(current).name) : "Übersicht"}</span><div class="top-right"><span class="date">${fmt(new Date())}</span><span class="avatar small">${esc(user.initials)}</span></div></header><div class="content" id="content"></div></main>`;
  document.querySelectorAll("[data-nav-group]").forEach((group) => {
    group.ontoggle = () => {
      navState[group.dataset.navGroup] = group.open;
      sessionStorage.setItem("cockpit-nav-groups", JSON.stringify(navState));
    };
  });
  $(".mobile-toggle").onclick = () => $(".sidebar").classList.toggle("shown");
  $(".brand").onclick = resetDashboard;
  $(".nav-dashboard").onclick = resetDashboard;
  $("#logout").onclick = accounts.logout;
  document
    .querySelector(".account-controls")
    .insertAdjacentHTML?.(
      "afterbegin",
      '<button id="own-password-button">Mein Passwort ändern</button>',
    );
  if ($("#own-password-button"))
    $("#own-password-button").onclick = accounts.ownPassword;
  if ($("#manage-users")) $("#manage-users").onclick = accounts.manage;
  if ($("#manage-structure")) $("#manage-structure").onclick = structure.manage;
  if ($("#network-add"))
    $("#network-add").onclick = () => structure.form("networks");
  document.querySelectorAll("[data-new-site]").forEach(
    (b) =>
      (b.onclick = () =>
        structure.form("sites", null, {
          heatNetworkId: b.dataset.newSite,
          type: b.dataset.siteType,
        })),
  );
  document
    .querySelectorAll("[data-new-group]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          structure.form("groups", null, { networkId: b.dataset.newGroup })),
    );
  structure.bind();
  render();
}
function render() {
  if (!user.id) {
    accounts.login();
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
  const mentions = mentionSummary(
    data.entries.filter((e) => isVisible(e)),
    user,
    data.users,
    mentionState.seen,
  );
  const pageActions = `<div class="page-actions"><button class="secondary mentions-button mentions-${mentions.color}" id="my-mentions" title="Meine Erwähnungen: ${mentions.unread} neue" aria-label="Meine Erwähnungen: ${mentions.count} Erwähnungen"><span aria-hidden="true">✉</span><span>${mentions.count}</span></button><button class="primary new-entry">${icon("plus")} Neuer Logbucheintrag</button></div>`;
  $("#content").innerHTML =
    `${!current ? '<a href="#dashboard" class="dashboard-logo partner-logos" aria-label="Dashboard"><img class="marzili" src="/assets/marzili-logo.png" alt="Wärmeverbund Marzili Bern AG"><span class="partner-cross" aria-hidden="true">×</span><img class="ewb" src="/assets/ewb-logo.png" alt="ewb"></a>' : ""}<div class="page-heading"><div><div class="eyebrow">${s ? "WÄRMEVERBUND " + esc(network(s.heatNetworkId).name.toUpperCase()) : "GEMEINSAM. ÜBERSICHTLICH. IM BETRIEB."}</div><h1>${s ? esc(s.name) : "Wärmeverbund Betriebs Cockpit"}</h1><p>${s ? stationLabel(s) + " · Betriebsdokumentation und Unterlagen." : "Übersicht über aktuelle Einträge und offene Pendenzen aller Wärmeverbünde."}</p></div>${pageActions}</div>${
      s
        ? `<div class="site-banner"><span class="station-type">${icon(stationIcon(s))} ${esc(stationLabel(s))}</span><a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address + ", Schweiz")}" target="_blank" rel="noopener noreferrer" title="Adresse in Google Maps öffnen">${icon("pin")} ${esc(s.address)} </a><span>${open(entries).length} offene Pendenzen</span><span>${entries.length} Logbucheinträge</span>${isAdministrator(user) ? '<button class="secondary" id="manage-plants">Anlagen verwalten</button>' : ""}</div><div class="tabs">${tabs.map((t) => `<div class="tab-item"><button data-tab="${esc(t.key)}" class="${tab === t.key ? "selected" : ""}">${icon("file")} ${esc(t.name)}${t.builtin === "log" ? `<span>${entries.length}</span>` : t.builtin === "docs" ? `<span>${data.documents.filter((d) => d.siteId === current && (!d.folderId || data.folders.some((f) => f.id === d.folderId && !f.sectionId))).length}</span>` : ""}</button>${isAdministrator(user) ? `<button class="tab-edit" data-edit-section="${esc(t.id)}" aria-label="Register bearbeiten: ${esc(t.name)}" title="Register bearbeiten">✎</button>` : ""}</div>`).join("")}${isAdministrator(user) ? '<button id="new-section" title="Register hinzufügen">+ Register</button><button id="manage-tabs" title="Register und Reihenfolge verwalten">✎ Register verwalten</button>' : ""}</div>`
        : dashboard(entries)
    }<section class="panel">${s && !tab ? '<div class="empty"><h3>Keine Register eingeblendet</h3><p>Administratoren können über «Register verwalten» Register wieder einblenden oder hinzufügen.</p></div>' : s && tab !== "log" ? documentsView() : logView(entries)}</section><footer>Wärmeverbund Betriebs Cockpit <span>Daten werden zentral und geschützt am Server gespeichert</span></footer>`;
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
          b.dataset.kpi === "high"
            ? { high: true }
            : b.dataset.kpi === "late"
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
  if (s && tab && tab !== "log") bindDocs();
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
  return `<label class="filter"><span>${label}</span><select data-filter="${key}"><option value="">Alle</option>${options(values, filters[key])}</select></label>`;
}
function show(html) {
  modal.innerHTML = html;
  modal.showModal();
  modal.querySelector(".close").onclick = () => modal.close();
}
const getState = () => ({ current, tab, filters, onlyOpen });
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
const { documentsView, bindDocs, download } = createDocuments(context);
const { logView, bindFilters, entryForm, entryDetail } = createLogbook({
  ...context,
  download,
});
const dashboard = createDashboard(context);
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
    ? (name, password, code) => {
        const chosen = repository.authenticate(name, password, code);
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
  getMfaEnabled: () => authSettings?.mfaEnabled || false,
  setupMfa: repository.setupMfa,
  confirmMfa: (code) => repository.confirmMfa(code, data),
  getAudit: repository.audit,
  onBeforeLogin: () => {
    navState = {};
    sessionStorage.setItem("cockpit-nav-groups", "{}");
  },
  onLogin: () =>
    repository.migrateLocal?.(data, toast).then(() => {
      if (user.id) render();
    }),
  onLogout: () => repository.logout?.(),
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
function route() {
  syncStructure();
  const match = location.hash.match(/^#site\/([^/]+)/);
  current = match && site(match[1]) ? match[1] : null;
  tab = "log";
  filters = {};
  onlyOpen = false;
  shell();
}
window.addEventListener("hashchange", route);
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
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      modal.close();
  }
});
setInterval(() => {
  if (user.id) render();
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
      else shell();
    }
  } catch (error) {
    if (error.status === 401) accounts.logout();
  } finally {
    syncing = false;
  }
}, 2500);

function categoryTree(networkId, parentId = null) {
  return (data.structure?.groups || [])
    .filter(
      (g) => g.networkId === networkId && (g.parentId || null) === parentId,
    )
    .map(
      (g) =>
        `<details class="station-group" data-nav-group="${esc(g.id)}" ${navExpanded(g.id) ? "open" : ""}><summary>${esc(g.name)}${editStructure("groups", g)}<span class="caret">⌄</span></summary>${sites
          .filter((s) => s.groupId === g.id)
          .map(
            (s) =>
              `<div class="site-nav-row"><a class="site-link ${current === s.id ? "active" : ""}" href="#site/${esc(s.id)}">${icon(stationIcon(s))}${esc(s.name)}</a>${editStructure("sites", s)}</div>`,
          )
          .join("")}${categoryTree(networkId, g.id)}</details>`,
    )
    .join("");
}

function editStructure(kind, item) {
  return isAdministrator(user)
    ? `<button type="button" class="nav-edit" data-structure-kind="${kind}" data-structure-id="${esc(item.id)}" title="Bearbeiten: ${esc(item.name)}" aria-label="Bearbeiten: ${esc(item.name)}">✎</button>`
    : "";
}
