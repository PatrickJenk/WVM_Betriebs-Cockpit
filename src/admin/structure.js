import { canLead, isAdministrator } from "../auth/roles.js";
import { uuid } from "../services/ids.js";
import {
  siteTabs,
  structureImpact,
  removeStructureItem,
} from "../services/structure.js";

export function createStructure(c) {
  const {
    data,
    user,
    esc,
    options,
    show,
    modal,
    save,
    shell,
    toast,
    onStructureChange,
    getAdmin,
  } = c;
  const admin = () => isAdministrator(user);
  const titles = {
    networks: "Wärmeverbund",
    sites: "Standort",
    groups: "Unterkategorie",
    sections: "Register",
  };
  const help = {
    networks:
      "Ein Wärmeverbund bündelt seine Heizzentralen und Unterstationen in der Navigation.",
    sites:
      "Ein Standort erhält Logbuch und Dokumentenablage. Anlagen kannst du danach über «Anlagen verwalten» ergänzen.",
    groups:
      "Unterkategorien gliedern die Navigation, zum Beispiel nach Quartier. Wähle den Verbund und bei Bedarf eine übergeordnete Kategorie.",
    sections:
      "Ein zusätzliches Register ist ein Dokumentbereich, zum Beispiel für Arbeitsrapporte. Es ergänzt keine neuen Formular- oder Berechnungsfunktionen.",
  };
  const $ = (selector) => document.querySelector(selector);
  function commit(action, result) {
    if (!admin()) return false;
    const before = structuredClone(data);
    action();
    if (!save()) {
      Object.assign(data, before);
      const error = $("#structure-error");
      if (error)
        error.textContent =
          "Speichern fehlgeschlagen. Bitte Eingaben prüfen. Bei gleichzeitigen Änderungen die Seite neu laden.";
      return false;
    }
    modal.close();
    if (onStructureChange) onStructureChange(result);
    else shell();
    toast("Änderung gespeichert und für alle Benutzer verfügbar.");
    return true;
  }
  function sectionAt(id, siteId) {
    if (!id) return undefined;
    return (
      data.structure.sections.find((s) => s.id === id) ||
      siteTabs(data, siteId, true).find((s) => s.builtin === id)
    );
  }
  function storeSection(tab, changes) {
    const existing = data.structure.sections.find((s) => s.id === tab.id);
    if (existing) Object.assign(existing, changes);
    else {
      const { key, ...value } = tab;
      data.structure.sections.push({ ...value, id: uuid(), ...changes });
    }
  }
  function form(kind, id, preset = {}, back) {
    if (!admin() || !titles[kind]) return;
    const item =
      kind === "sections"
        ? sectionAt(id, preset.siteId)
        : data.structure[kind].find((x) => x.id === id);
    const value = item || preset;
    const network =
      value.heatNetworkId || value.networkId || data.structure.networks[0]?.id;
    const originalNetworkId = value.networkId;
    const sectionSite = value.siteId;
    const tabs = kind === "sections" ? siteTabs(data, sectionSite, true) : [];
    const descendants = new Set(id ? [id] : []);
    if (kind === "groups" && id) {
      let size;
      do {
        size = descendants.size;
        data.structure.groups
          .filter((g) => descendants.has(g.parentId))
          .forEach((g) => descendants.add(g.id));
      } while (size !== descendants.size);
    }
    show(
      `<form id="structure-form"><div class="modal-heading"><h2>${esc(titles[kind])} ${item ? "bearbeiten" : "hinzufügen"}</h2><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div><div class="form-body"><p class="management-hint">${esc(help[kind])}</p><label>Name<input name="itemName" required maxlength="100" value="${esc(value.name || "")}"></label>${
        ["sites", "groups"].includes(kind)
          ? `<label>Wärmeverbund<select name="network">${options(
              data.structure.networks.map((n) => [n.id, n.name]),
              network,
            )}</select></label><label>${kind === "sites" ? "Unterkategorie" : "Übergeordnete Kategorie"}<select name="group"><option value="">Standard / oberste Ebene</option>${options(
              data.structure.groups
                .filter(
                  (g) => !descendants.has(g.id) && g.networkId === network,
                )
                .map((g) => [g.id, g.name]),
              value.groupId || value.parentId,
            )}</select></label>`
          : ""
      }${
        kind === "sites"
          ? `<label>Standorttyp<select name="type">${options(
              [
                ["", "Heizzentrale"],
                ["mbus", "Unterstation M-Bus"],
                ["heat-substation", "Wärmeerzeugende Unterstation"],
              ],
              value.type || "",
            )}</select></label><label>Adresse<input name="address" maxlength="250" value="${esc(value.address || "")}"></label>`
          : ""
      }${
        kind === "sections"
          ? `<label>Position in der Registerleiste<select name="position">${options(
              Array.from({ length: tabs.length + (item ? 0 : 1) }, (_, i) => [
                String(i),
                String(i + 1),
              ]),
              String(
                item ? tabs.findIndex((t) => t.id === item.id) : tabs.length,
              ),
            )}</select></label>${value.hidden ? "<p>Dieses Register ist ausgeblendet. Speichern blendet es wieder ein.</p>" : ""}`
          : ""
      }<p id="structure-error" role="alert"></p></div><div class="modal-footer">${item ? '<button type="button" class="danger-button" id="structure-delete">Löschen</button>' : ""}<button class="secondary" type="button" id="structure-back">Abbrechen</button><button class="primary" type="submit">${item ? "Änderungen speichern" : titles[kind] + " hinzufügen"}</button></div></form>`,
    );
    $("#structure-back").onclick = back || (() => modal.close());
    if ($("#structure-delete"))
      $("#structure-delete").onclick = () =>
        remove(kind, item.id, sectionSite, () => form(kind, id, preset, back));
    const formNode = $("#structure-form"),
      elements = formNode.elements;
    if (elements?.network)
      elements.network.onchange = () => {
        elements.group.innerHTML =
          '<option value="">Standard / oberste Ebene</option>' +
          options(
            data.structure.groups
              .filter(
                (g) =>
                  g.networkId === elements.network.value &&
                  !descendants.has(g.id),
              )
              .map((g) => [g.id, g.name]),
          );
      };
    formNode.onsubmit = (event) => {
      event.preventDefault();
      if (!admin()) return;
      const f = event.currentTarget.elements,
        name = f.itemName.value.trim();
      if (!name) return;
      const st = data.structure;
      const existing = item && st[kind].find((x) => x.id === item.id);
      const next = { ...value, id: existing?.id || uuid(), name };
      delete next.key;
      if (kind === "sites")
        Object.assign(next, {
          heatNetworkId: f.network.value,
          groupId: f.group.value || null,
          type: f.type.value || undefined,
          address: f.address.value.trim(),
        });
      if (kind === "groups")
        Object.assign(next, {
          networkId: f.network.value,
          parentId: f.group.value || null,
        });
      if (kind === "sections") {
        if (!st.sites.some((s) => s.id === sectionSite)) {
          $("#structure-error").textContent =
            "Bitte zuerst einen Standort öffnen.";
          return;
        }
        next.hidden = false;
        next.order = tabs.length;
      }
      const sibling = (x) =>
        kind === "sections"
          ? x.siteId === sectionSite
          : kind === "sites"
            ? x.heatNetworkId === next.heatNetworkId &&
              (x.groupId || null) === next.groupId
            : kind === "groups"
              ? x.networkId === next.networkId &&
                (x.parentId || null) === next.parentId
              : true;
      const peers =
        kind === "sections" ? siteTabs(data, sectionSite, true) : st[kind];
      if (
        peers.some(
          (x) =>
            x.id !== item?.id &&
            sibling(x) &&
            x.name.trim().toLocaleLowerCase("de-CH") ===
              name.toLocaleLowerCase("de-CH"),
        )
      ) {
        $("#structure-error").textContent =
          "Dieser Name ist hier bereits vorhanden.";
        return;
      }
      commit(
        () => {
          if (existing) Object.assign(existing, next);
          else st[kind].push(next);
          if (
            kind === "groups" &&
            item &&
            originalNetworkId !== next.networkId
          ) {
            st.groups
              .filter((g) => descendants.has(g.id))
              .forEach((g) => (g.networkId = next.networkId));
            st.sites
              .filter((s) => descendants.has(s.groupId))
              .forEach((s) => (s.heatNetworkId = next.networkId));
          }
          if (kind === "sites" && !item)
            data.plants.push({
              id: uuid(),
              siteId: next.id,
              name: "Allgemein",
              active: true,
            });
          if (kind === "sections") {
            if (!item)
              data.folders.push({
                id: uuid(),
                siteId: next.siteId,
                sectionId: next.id,
                parentId: null,
                name,
              });
            const ordered = siteTabs(data, sectionSite, true).filter(
              (t) =>
                t.id !== next.id &&
                !(next.builtin && t.builtin === next.builtin),
            );
            ordered.splice(Number(f.position.value), 0, {
              ...next,
              key: next.builtin || next.id,
            });
            ordered.forEach((t, order) => storeSection(t, { order }));
          }
        },
        {
          kind,
          id: next.id,
          siteId: next.siteId,
          tab: next.builtin || next.id,
        },
      );
    };
  }
  function remove(kind, id, siteId, back) {
    if (!admin()) return;
    const item =
      kind === "sections"
        ? sectionAt(id, siteId)
        : data.structure[kind].find((x) => x.id === id);
    if (!item) return;
    const impact = structureImpact(data, kind, item.id),
      builtin = kind === "sections" && item.builtin;
    const details = builtin
      ? "<p>Das Standardregister wird ausgeblendet. Seine Logbucheinträge beziehungsweise Dokumente bleiben erhalten. Über «Register verwalten» kann es wieder eingeblendet werden.</p>"
      : `<p>Folgende Inhalte werden ebenfalls dauerhaft gelöscht:</p><ul><li>Standorte, Unterkategorien</li><li>gespeicherte Register, Ordner</li><li>Dokumente, Logbucheinträge</li><li>Anlagen, Logbuchanhänge</li></ul>${impact.sites.size ? "<p>Die Standardregister der betroffenen Standorte entfallen ebenfalls.</p>" : ""}`;
    show(
      `<div class="modal-heading"><h2>${esc(titles[kind])} löschen?</h2><button class="close icon-button" aria-label="Schliessen">×</button></div><div class="form-body"><p>«${esc(item.name)}» ${builtin ? "ausblenden" : "dauerhaft löschen"}?</p>${details}<p id="structure-error" role="alert"></p></div><div class="modal-footer"><button class="secondary" id="structure-cancel">Abbrechen</button><button class="danger-button" id="structure-confirm-delete">${builtin ? "Register ausblenden" : "Endgültig löschen"}</button></div>`,
    );
    $("#structure-cancel").onclick = back || (() => modal.close());
    $("#structure-confirm-delete").onclick = () =>
      commit(
        () => {
          if (builtin) storeSection(item, { hidden: true });
          else removeStructureItem(data, kind, item.id);
        },
        { kind, deleted: true, id: item.id, siteId: item.siteId },
      );
  }
  function moveTab(siteId, key, direction, back) {
    if (!admin()) return;
    const tabs = siteTabs(data, siteId),
      index = tabs.findIndex((t) => t.key === key),
      target = index + direction;
    if (index < 0 || target < 0 || target >= tabs.length) return;
    [tabs[index], tabs[target]] = [tabs[target], tabs[index]];
    if (
      commit(() => tabs.forEach((t, order) => storeSection(t, { order })), {
        kind: "order",
      })
    )
      manageTabs(siteId, back);
  }
  function manageTabs(siteId, back) {
    if (!admin()) return;
    const visible = siteTabs(data, siteId),
      all = siteTabs(data, siteId, true);
    show(
      `<div class="modal-heading"><h2>Register verwalten</h2><button class="close icon-button" aria-label="Schliessen">×</button></div><div class="form-body"><p class="management-hint">${esc(data.structure.sites.find((s) => s.id === siteId)?.name || "Standort")} · Register sind die Reiter innerhalb eines Standorts. Mit den Pfeilen änderst du ihre Reihenfolge.</p><button class="secondary" id="tab-add">+ Register hinzufügen</button>${all.map((t) => `<div class="structure-row"><span>${esc(t.name)}${t.hidden ? " · ausgeblendet" : ""}</span><button class="secondary" data-tab-edit="${esc(t.id)}" aria-label="Register bearbeiten: ${esc(t.name)}">${t.hidden ? "Wieder einblenden / Bearbeiten" : "Bearbeiten"}</button>${t.hidden ? "" : `<button class="secondary" data-tab-move="${esc(t.key)}" data-direction="-1" ${visible[0]?.key === t.key ? "disabled" : ""} aria-label="${esc(t.name)} nach links">←</button><button class="secondary" data-tab-move="${esc(t.key)}" data-direction="1" ${visible.at(-1)?.key === t.key ? "disabled" : ""} aria-label="${esc(t.name)} nach rechts">→</button><button class="danger" data-tab-delete="${esc(t.id)}" aria-label="Register ${t.builtin ? "ausblenden" : "löschen"}: ${esc(t.name)}">${t.builtin ? "Ausblenden" : "Löschen"}</button>`}</div>`).join("")}<p id="structure-error" role="alert"></p></div>`,
      back,
    );
    const returnToTabs = () => manageTabs(siteId, back);
    $("#tab-add").onclick = () =>
      form("sections", null, { siteId }, returnToTabs);
    document
      .querySelectorAll("[data-tab-edit]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            form("sections", b.dataset.tabEdit, { siteId }, returnToTabs)),
      );
    document
      .querySelectorAll("[data-tab-delete]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            remove("sections", b.dataset.tabDelete, siteId, returnToTabs)),
      );
    document
      .querySelectorAll("[data-tab-move]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            moveTab(
              siteId,
              b.dataset.tabMove,
              Number(b.dataset.direction),
              back,
            )),
      );
  }
  function locationLabel(kind, item) {
    const st = data.structure;
    if (kind === "networks") return "Wärmeverbund";
    const network = st.networks.find(
      (n) => n.id === (item.heatNetworkId || item.networkId),
    );
    const parts = [network?.name];
    let groupId = item.groupId || item.parentId;
    const seen = new Set();
    const groups = [];
    while (groupId && !seen.has(groupId)) {
      seen.add(groupId);
      const group = st.groups.find((g) => g.id === groupId);
      if (!group) break;
      groups.unshift(group.name);
      groupId = group.parentId;
    }
    return [...parts, ...groups].filter(Boolean).join(" / ");
  }
  function navigationDialog(title, content, back) {
    show(
      `<div class="modal-heading"><h2>${esc(title)}</h2><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div><div class="form-body">${content}</div>`,
      back,
    );
    document.querySelectorAll("[data-navigation-open]").forEach((link) => {
      link.onclick = () => modal.close();
    });
  }
  const card = (label, attributes) =>
    `<button type="button" class="management-card" ${attributes}><strong>${esc(label)}</strong></button>`;
  const pageLink = (label, href) =>
    `<a class="management-card" href="${href}" data-navigation-open><strong>${esc(label)}</strong></a>`;
  function manage(back) {
    if (!admin()) return;
    navigationDialog(
      "Navigation verwalten",
      `<div class="management-grid">
      ${card("Betrieb", 'id="nav-admin-operations"')}
      ${card("Wärmeverbünde", 'id="nav-admin-networks"')}
      ${card("Betriebsführung", 'id="nav-admin-leadership"')}
    </div>`,
      back,
    );
    const returnToAreas = () => manage(back);
    $("#nav-admin-operations").onclick = () =>
      navigationDialog(
        "Betrieb",
        `<div class="management-grid">${pageLink("Dashboard", "#dashboard")}${pageLink("Dokumentationen", "#documentation")}${pageLink("Betriebspersonal", "#personnel")}</div>`,
        returnToAreas,
      );
    $("#nav-admin-networks").onclick = () => manageNetworks(returnToAreas);
    $("#nav-admin-leadership").onclick = () =>
      navigationDialog(
        "Betriebsführung",
        canLead(user)
          ? `<div class="management-grid">${pageLink("Austausch EPC + WVM", "#leadership")}</div>`
          : "<p>Für den Austausch EPC + WVM ist die Rolle Leitung erforderlich.</p>",
        returnToAreas,
      );
  }
  function manageNetworks(back) {
    if (!admin()) return;
    navigationDialog(
      "Wärmeverbünde",
      `<div class="management-grid">
      ${data.structure.networks.map((n) => card(n.name, `data-manage-network="${esc(n.id)}"`)).join("")}
      <button type="button" class="secondary" id="add-network">+ Wärmeverbund hinzufügen</button>
    </div>`,
      back,
    );
    const returnToNetworks = () => manageNetworks(back);
    $("#add-network").onclick = () =>
      form("networks", null, {}, returnToNetworks);
    document.querySelectorAll("[data-manage-network]").forEach((button) => {
      button.onclick = () =>
        manageNetwork(button.dataset.manageNetwork, returnToNetworks);
    });
  }
  function manageNetwork(id, back) {
    if (!admin()) return;
    const network = data.structure.networks.find((n) => n.id === id);
    if (!network) return back();
    const { sites, groups } = data.structure;
    const section = (title, substation) =>
      `<section class="management-section"><div class="management-section-heading"><h3>${title}</h3><button type="button" class="secondary" data-add-station="${substation ? "mbus" : ""}">+ ${substation ? "Unterstation" : "Heizzentrale"} hinzufügen</button></div>
      <div class="management-grid">${
        sites
          .filter(
            (s) => s.heatNetworkId === id && Boolean(s.type) === substation,
          )
          .map((s) => card(s.name, `data-manage-site="${esc(s.id)}"`))
          .join("") || "<p>Keine Standorte vorhanden.</p>"
      }</div></section>`;
    navigationDialog(
      network.name,
      `<button type="button" class="secondary" id="edit-network">Wärmeverbund bearbeiten</button>
      ${section("Heizzentralen", false)}${section("Unterstationen", true)}
      <section class="management-section"><div class="management-section-heading"><h3>Unterkategorien</h3><button type="button" class="secondary" id="add-network-group">+ Unterkategorie hinzufügen</button></div><div class="management-grid">
      ${
        groups
          .filter((g) => g.networkId === id)
          .map((g) =>
            card(
              locationLabel("groups", g) + " / " + g.name,
              `data-manage-group="${esc(g.id)}"`,
            ),
          )
          .join("") || "<p>Keine Unterkategorien vorhanden.</p>"
      }</div></section>`,
      back,
    );
    const returnToNetwork = () => manageNetwork(id, back);
    $("#edit-network").onclick = () =>
      form("networks", id, {}, returnToNetwork);
    $("#add-network-group").onclick = () =>
      form("groups", null, { networkId: id }, returnToNetwork);
    document.querySelectorAll("[data-add-station]").forEach((button) => {
      button.onclick = () =>
        form(
          "sites",
          null,
          { heatNetworkId: id, type: button.dataset.addStation },
          returnToNetwork,
        );
    });
    document.querySelectorAll("[data-manage-group]").forEach((button) => {
      button.onclick = () =>
        form("groups", button.dataset.manageGroup, {}, returnToNetwork);
    });
    document.querySelectorAll("[data-manage-site]").forEach((button) => {
      button.onclick = () =>
        manageSite(button.dataset.manageSite, returnToNetwork);
    });
  }
  function manageSite(id, back) {
    if (!admin()) return;
    const site = data.structure.sites.find((s) => s.id === id);
    if (!site) return back();
    navigationDialog(
      site.name,
      `<div class="management-grid">
      ${pageLink("Standort öffnen", "#site/" + encodeURIComponent(id))}
      ${card("Standort bearbeiten", 'id="edit-station"')}
      ${card("Register verwalten", 'id="manage-station-registers"')}
      ${getAdmin ? card("Anlagen verwalten", 'id="manage-station-plants"') : ""}
    </div>`,
      back,
    );
    const returnToSite = () => manageSite(id, back);
    $("#edit-station").onclick = () => form("sites", id, {}, returnToSite);
    $("#manage-station-registers").onclick = () => manageTabs(id, returnToSite);
    if (getAdmin)
      $("#manage-station-plants").onclick = () =>
        getAdmin().plants(id, returnToSite);
  }
  return { form, manage, remove, manageTabs, moveTab };
}
