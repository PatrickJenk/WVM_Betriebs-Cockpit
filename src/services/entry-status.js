// Nicht erledigte Arbeiten: abgelaufenes Fälligkeitsdatum oder mehr als 30 Tage alt.
export function isOverdue(entry, now = new Date()) {
  if (entry.status === "Erledigt") return false;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
  }).format(now);
  const started = Date.parse(entry.createdAt || entry.occurredAt);
  return Boolean(
    (entry.dueDate && entry.dueDate < today) ||
    (Number.isFinite(started) &&
      now.getTime() - started > 30 * 24 * 60 * 60 * 1000),
  );
}
