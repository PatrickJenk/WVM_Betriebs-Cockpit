export function createDashboard({ icon }) {
  return function dashboard() {
    const shortcuts = [
      ["Offene Pendenzen", "open", "clock", "Alle offenen Arbeiten"],
      ["Überfällige Pendenzen", "late", "clock", "Fälligkeit überschritten"],
      ["Einträge diese Woche", "week", "file", "Seit Montag erfasst"],
    ];
    return `<div class="kpis">${shortcuts
      .map(
        ([label, key, symbol, description]) =>
          `<button class="kpi ${key}" data-kpi="${key}"><div><span>${label}</span>${icon(symbol)}</div><small>${description}</small></button>`,
      )
      .join("")}</div>`;
  };
}
