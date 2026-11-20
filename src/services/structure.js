// Gemeinsame Strukturregeln: stabile IDs behalten Inhalte beim Umbenennen/Verschieben.
export const generalDocumentationId = "general-documentation";
export const controlSheetTab = "control-sheet";
// Older installations may still store this optional field.
export const plantGroups = [
  "Primärenergie",
  "Austragung",
  "Erzeuger",
  "Fernleitungsgruppe",
  "Speicher",
  "Gebäude",
];

export function retireHeatingPlants(plants, sites) {
  const heatingSites = new Set(
    sites.filter((site) => !site.type).map((site) => site.id),
  );
  let changed = false;
  for (const plant of plants) {
    if (plant.deleted || !heatingSites.has(plant.siteId)) continue;
    plant.deleted = true;
    plant.active = false;
    changed = true;
  }
  return changed;
}

export const standardTabs = [
  { builtin: "log", name: "Logbuch", order: 0 },
  { builtin: "docs", name: "Dokumente", order: 1 },
  { builtin: controlSheetTab, name: "Kontrollblatt", order: 2 },
];

export function siteTabs(data, siteId, includeHidden = false) {
  const saved = (data.structure?.sections || []).filter(
    (s) => s.siteId === siteId,
  );
  const location = data.structure?.sites?.find((site) => site.id === siteId);
  const tabs = standardTabs
    .filter(
      ({ builtin }) =>
        builtin !== controlSheetTab || (location && !location.type),
    )
    .map((defaults) => ({
      ...defaults,
      id: defaults.builtin,
      siteId,
      ...saved.find((s) => s.builtin === defaults.builtin),
      key: defaults.builtin,
    }));
  const customOrder = tabs.length;
  saved
    .filter((s) => !s.builtin)
    .forEach((s, index) =>
      tabs.push({ order: index + customOrder, ...s, key: s.id }),
    );
  return tabs
    .filter((s) => includeHidden || !s.hidden)
    .sort((a, b) => a.order - b.order);
}

export function structureImpact(data, kind, id) {
  const st = data.structure;
  const groups = new Set(kind === "groups" ? [id] : []);
  if (kind === "networks")
    st.groups
      .filter((g) => g.networkId === id)
      .forEach((g) => groups.add(g.id));
  let changed = true;
  while (changed) {
    changed = false;
    st.groups.forEach((g) => {
      if (groups.has(g.parentId) && !groups.has(g.id)) {
        groups.add(g.id);
        changed = true;
      }
    });
  }
  const sites = new Set(
    st.sites
      .filter(
        (s) =>
          (kind === "sites" && s.id === id) ||
          (kind === "networks" && s.heatNetworkId === id) ||
          groups.has(s.groupId),
      )
      .map((s) => s.id),
  );
  const sections = new Set(
    st.sections
      .filter(
        (s) => sites.has(s.siteId) || (kind === "sections" && s.id === id),
      )
      .map((s) => s.id),
  );
  const folders = new Set(
    (data.folders || [])
      .filter((f) => sites.has(f.siteId) || sections.has(f.sectionId))
      .map((f) => f.id),
  );
  const documents = (data.documents || []).filter(
    (d) => sites.has(d.siteId) || folders.has(d.folderId),
  );
  const entries = (data.entries || []).filter((e) => sites.has(e.siteId));
  const plants = (data.plants || []).filter((p) => sites.has(p.siteId));
  return {
    groups,
    sites,
    sections,
    folders,
    documents,
    entries,
    plants,
    attachments: entries.flatMap((e) => e.attachments || []),
  };
}

export function removeStructureItem(data, kind, id) {
  const impact = structureImpact(data, kind, id),
    st = data.structure;
  if (kind === "networks") st.networks = st.networks.filter((n) => n.id !== id);
  st.groups = st.groups.filter((g) => !impact.groups.has(g.id));
  st.sites = st.sites.filter((s) => !impact.sites.has(s.id));
  st.sections = st.sections.filter((s) => !impact.sections.has(s.id));
  data.folders = (data.folders || []).filter((f) => !impact.folders.has(f.id));
  const documents = new Set(impact.documents.map((d) => d.id));
  data.documents = (data.documents || []).filter((d) => !documents.has(d.id));
  data.entries = (data.entries || []).filter(
    (e) => !impact.sites.has(e.siteId),
  );
  data.plants = (data.plants || []).filter((p) => !impact.sites.has(p.siteId));
}
