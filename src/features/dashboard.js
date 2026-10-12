// Kennzahlen werden aus den vorhandenen Logbucheinträgen berechnet.
export function createDashboard({ open, overdue, icon }) {
  function dashboard(entries) {
    const count = open(entries),
      monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const kpis = [
      [
        "Offene Pendenzen",
        count.length,
        "open",
        "clock",
        "Alle offenen Arbeiten",
      ],
      [
        "Hohe Priorität",
        count.filter((e) => ["Hoch", "Kritisch"].includes(e.priority)).length,
        "high",
        "alert",
        "Hoch und kritisch",
      ],
      [
        "Überfällige Pendenzen",
        count.filter(overdue).length,
        "late",
        "clock",
        "Fälligkeit überschritten",
      ],
      [
        "Einträge diese Woche",
        entries.filter((e) => new Date(e.occurredAt) >= monday).length,
        "week",
        "file",
        "Seit Montag erfasst",
      ],
    ];
    return `<div class="kpis">${kpis.map(([label, n, key, i, desc]) => `<button class="kpi ${key}" data-kpi="${key}"><div><span>${label}</span>${icon(i)}</div><strong>${String(n).padStart(2, "0")}</strong><small>${desc}</small></button>`).join("")}</div>`;
  }
  return dashboard;
}
