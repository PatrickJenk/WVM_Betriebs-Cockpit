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
import { isAdministrator } from "../auth/roles.js";

export const roundActivities = [
  "Kontrollrundgang mit Ascheleerung",
  "Kontrollrundgang ohne Ascheleerung",
  "Störung",
];

export const canCorrectEntryTime = (user, entry) =>
  isAdministrator(user) || (!!user?.id && entry.createdById === user.id);
export const canDeleteEntry = canCorrectEntryTime;

export function archived(entry, now = new Date()) {
  if (entry.status !== "Erledigt") return false;
  const date = new Date(
    entry.completedAt || entry.updatedAt || entry.createdAt,
  );
  const swiss = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
  if (!Number.isFinite(date.getTime())) return false;
  const quarter = (d) => {
    const p = swiss(d);
    return (
      Number(p.find((x) => x.type === "year").value) * 4 +
      Math.floor((Number(p.find((x) => x.type === "month").value) - 1) / 3)
    );
  };
  return quarter(date) < quarter(now);
}
