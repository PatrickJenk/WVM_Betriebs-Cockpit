// Standorte, Beispielkonto, Anlagenvorlagen und Startdaten.
export const user = {
  id: "pj",
  name: "Patrick Jenk",
  initials: "PJ",
  email: "patrick@example.ch",
  role: "Administrator",
};
export const networks = [
  { id: "marzili", name: "Marzili" },
  { id: "moesli", name: "Mösli" },
  { id: "buchsee", name: "Buchsee" },
];
export const sites = [
  {
    id: "eiger",
    heatNetworkId: "marzili",
    name: "Eigerstrasse 73",
    address: "Eigerstrasse 73, Bern",
  },
  {
    id: "monbijou",
    heatNetworkId: "marzili",
    name: "Monbijoustrasse 68",
    address: "Monbijoustrasse 68, Bern",
  },
  {
    id: "milch",
    heatNetworkId: "moesli",
    name: "Milchstrasse 2 bis 8",
    address: "Milchstrasse 2 bis 8, Ostermundigen",
  },
  {
    id: "linden2",
    heatNetworkId: "moesli",
    name: "Lindendorf 2000",
    address: "Unterdorfstrasse 33, Ostermundigen",
  },
  {
    id: "linden1",
    heatNetworkId: "moesli",
    name: "Lindendorf 1000",
    address: "Forelstrasse 46, Ostermundigen",
  },
  {
    id: "lilien",
    heatNetworkId: "buchsee",
    name: "Lilienweg 15",
    address: "Lilienweg 15, Köniz",
  },
  {
    id: "holzikofen",
    heatNetworkId: "marzili",
    name: "Holzikofenweg 36",
    address: "Holzikofenweg 36, Bern",
    type: "mbus",
  },
  {
    id: "saegestrasse",
    heatNetworkId: "buchsee",
    name: "Sägestrasse 76+78",
    address: "Sägestrasse 76 und 78, Köniz",
    type: "mbus",
  },
  {
    id: "emmi-abwaerme",
    heatNetworkId: "moesli",
    name: "EMMI Abwärmenutzung",
    address: "EMMI",
    type: "heat-substation",
  },
  {
    id: "emmi-dampf",
    heatNetworkId: "moesli",
    name: "EMMI Dampfauskopplung",
    address: "EMMI",
    type: "heat-substation",
  },
  {
    id: "bernstrasse",
    heatNetworkId: "moesli",
    name: "Bernstrasse 25",
    address: "Bernstrasse 25",
    type: "mbus",
  },
  {
    id: "schermenweg",
    heatNetworkId: "moesli",
    name: "Schermenweg 111",
    address: "Schermenweg 111",
    type: "mbus",
  },
  {
    id: "poststrasse",
    heatNetworkId: "moesli",
    name: "Poststrasse 1",
    address: "Poststrasse 1",
    type: "mbus",
  },
  {
    id: "wyss",
    heatNetworkId: "moesli",
    name: "Gartencenter Wyss",
    address: "Gartencenter Wyss",
    type: "mbus",
  },
];
export const plantNames = [
  "Holzkessel",
  "Gaskessel",
  "Elektro Wärmeerzeuger EWO",
  "Fernwärmeleitung",
  "Pumpen",
  "Speicher",
  "Wasseraufbereitung",
  "Steuerung",
  "Elektroanlage",
  "Wärmetauscher",
  "Sonstiges",
];
export function stationLabel(site) {
  return site.type === "mbus"
    ? "M-Bus-Station"
    : site.type === "heat-substation"
      ? "Wärmeerzeugende Unterstation"
      : "Heizzentrale";
}
export function stationIcon(site) {
  return site.type === "mbus"
    ? "meter"
    : site.type === "heat-substation"
      ? "heat-exchange"
      : "heat";
}
export function stationPlants(site) {
  const names =
    site.type === "mbus"
      ? ["M-Bus-Unterstation", "M-Bus-Zähler", "Sonstiges"]
      : site.type === "heat-substation"
        ? [
            site.id === "emmi-dampf" ? "Dampfauskopplung" : "Abwärmenutzung",
            "Wärmetauscher",
            "Pumpen",
            "Steuerung",
            "M-Bus-Zähler",
            "Sonstiges",
          ]
        : plantNames;
  return names.map((name, i) => ({
    id: site.id + "-" + i,
    siteId: site.id,
    name,
    active: true,
  }));
}
export function initializeStations(data) {
  for (const station of sites.filter((s) => s.type)) {
    if (!data.plants.some((p) => p.siteId === station.id))
      data.plants.push(...stationPlants(station));
  }
  data.stationVersion = 1;
}
export const categories = [
  "Schemas",
  "Hydraulikschema",
  "Elektroschema",
  "Betriebsanleitungen",
  "Datenblätter",
  "Prüfprotokolle",
  "Wartungsunterlagen",
  "Verträge",
  "Fotos",
  "Sonstiges",
];
export function initializeDocumentFolders(data) {
  data.folders ??= [];
  for (const station of sites.filter((s) => !s.type)) {
    const add = (key, name, parentId = null) => {
      const existing = data.folders.find(
        (f) =>
          f.siteId === station.id &&
          (f.parentId || null) === parentId &&
          f.name === name,
      );
      if (existing) return existing.id;
      const id = "template-" + station.id + "-" + key;
      data.folders.push({ id, siteId: station.id, name, parentId });
      return id;
    };
    add("leitsystem", "01 Leitsystem - Elektroschemas");
    add("prinzip", "02 Zentrale - Prinzipschemas");
    const components = add("anlagen", "03 Anlagen und Komponenten");
    for (const component of data.plants.filter(
      (p) =>
        p.siteId === station.id &&
        p.active &&
        !p.deleted &&
        p.name !== "Sonstiges",
    )) {
      const id = add("anlage-" + component.id, component.name, components);
      add("schemas-" + component.id, "Schemas", id);
      add("anleitungen-" + component.id, "Bedienungsanleitungen", id);
    }
    add("kunden", "04 Kundenschemas - Referenz");
    add("infos", "05 Informationen und Sonstiges");
  }
  data.documentTemplateVersion = 1;
}
export function demoLogbook(users = []) {
  const known = (id, name, initials, company) => {
    const user = users.find((u) => u.id === id);
    return {
      id,
      name: user?.name || name,
      initials: user?.initials || initials,
      company: user?.company || company,
    };
  };
  const patrick = known("pj", "Patrick Jenk", "PJ", "WVM"),
    marcel = known("mm", "Marcel Maibach", "MM", "EPC"),
    admin = known("admin", "WVM-admin", "ADM", "WVM");
  const epcDemo = {
    id: "demo-epc",
    name: "EPC Musterperson (fiktiv)",
    initials: "EM",
    company: "EPC",
  };
  const variants = [
    ["eiger", "Muster 1: eine Person WVM", [patrick], "Erledigt", "Gering"],
    ["lilien", "Muster 2: eine Person EPC", [marcel], "Pendenz", "Hoch"],
    [
      "monbijou",
      "Muster 3: zwei Personen WVM",
      [patrick, admin],
      "In Bearbeitung",
      "Mittel",
    ],
    [
      "milch",
      "Muster 4: zwei Personen EPC",
      [marcel, epcDemo],
      "Pendenz",
      "Gering",
    ],
    [
      "holzikofen",
      "Muster 5: WVM und EPC gemeinsam",
      [patrick, marcel],
      "Erledigt",
      "Mittel",
    ],
  ];
  variants.push([
    "lilien",
    "Muster 6: seit 31 Tagen offen",
    [patrick],
    "Pendenz",
    "Hoch",
  ]);
  return variants.map(([siteId, title, participants, status, priority], i) => {
    const at = new Date(
        Date.now() - (i === 5 ? 31 * 24 * 60 * 60 * 1000 : i * 60000),
      ).toISOString(),
      first = participants[0],
      last = participants.at(-1);
    return {
      id: "seed-" + i,
      siteId,
      plantId: siteId + "-0",
      title,
      status,
      priority,
      createdAt: at,
      occurredAt: at,
      updatedAt: at,
      createdBy: first.initials,
      createdById: first.id,
      createdByName: first.name,
      createdCompany: first.company,
      updatedBy: last.initials,
      updatedById: last.id,
      updatedByName: last.name,
      updatedCompany: last.company,
      description:
        "Muster zur Darstellung der beteiligten Personen. Kein realer Betriebsauftrag.",
      nextSteps: "",
      dueDate: "",
      completedAt: status === "Erledigt" ? at : null,
      attachments: [],
      participants,
      history: participants.slice(1).map((p) => ({
        at,
        by: p.initials,
        byId: p.id,
        name: p.name,
        company: p.company,
        status,
        title,
        description: "Muster-Ergänzung",
      })),
    };
  });
}
export function seed() {
  const base = new Date();
  const date = (days, h) => {
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    d.setHours(h, 15, 0, 0);
    return d.toISOString();
  };
  const data = {
    plants: sites.flatMap(stationPlants),
    stationVersion: 1,
    entries: demoLogbook(),
    documents: [],
  };
  initializeDocumentFolders(data);
  return data;
}
