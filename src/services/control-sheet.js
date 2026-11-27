export const controlPointTypes = [
  ["check", "Abhaken"],
  ["text", "Text eingeben"],
  ["number", "Messwert eingeben"],
];

export const controlPoint = (point) =>
  typeof point === "string" ? { label: point, type: "check", unit: "" } : point;

export const controlKinds = [
  ["with-ash", "Mit Ascheleerung"],
  ["without-ash", "Ohne Ascheleerung"],
];

export const controlStatuses = [
  ["ok", "In Ordnung"],
  ["issue", "Nicht in Ordnung"],
  ["irrelevant", "Nicht relevant"],
];

export const controlChoices = [
  ["yes", "Ja"],
  ["no", "Nein"],
];

export const controlKindLabel = (kind) =>
  controlKinds.find(([value]) => value === kind)?.[1] || "";

export const controlStatusLabel = (status) =>
  controlStatuses.find(([value]) => value === status)?.[1] || "";

export const controlDateLabel = (date) => date.split("-").reverse().join(".");

export const isRoundSection = (point) => point?.type === "section";
export const roundPointLabel = (point) =>
  typeof point === "string" ? point : point.label;

export const newestControlSheetFirst = (a, b) =>
  (Date.parse(b.uploadedAt) || 0) - (Date.parse(a.uploadedAt) || 0);
