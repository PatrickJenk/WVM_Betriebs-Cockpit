const crypto = require("node:crypto");
const store = require("./server-security.cjs");
const examples = require("./src/data/control-round-examples.json");
const { controlChoices } = require("./src/services/control-sheet.js");

const standard = "standard";
const versionOf = (...values) =>
  crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");

function baseForm(state) {
  return (
    state.data.controlRoundBase || {
      version: versionOf(examples.points),
      points: examples.points,
    }
  );
}

function findForm(state, siteId) {
  const base = baseForm(state);
  const saved =
    state.data.controlTemplates?.filter((entry) => entry.siteId === siteId) ||
    [];
  const own = saved.find((entry) => entry.kind === standard);
  const previous =
    saved.find((entry) => entry.kind === "without-ash") ||
    saved.find((entry) => entry.kind === "with-ash");
  const folderId =
    own?.folderId ??
    state.data.folders.find(
      (folder) =>
        folder.id ===
          (previous || saved.find((entry) => !entry.kind))?.folderId &&
        folder.siteId === siteId &&
        !folder.sectionId,
    )?.id ??
    "";
  const useBase = own?.useBase ?? !previous?.points?.length;
  const points = own?.points || previous?.points || [];
  const roundTypes = own?.roundTypes || [];
  return {
    siteId,
    version: versionOf(
      own?.version,
      useBase ? base.version : null,
      points,
      folderId,
      roundTypes,
    ),
    folderId,
    useBase,
    points,
    roundTypes,
    effectivePoints: useBase ? [...base.points, ...points] : points,
    example: useBase && !state.data.controlRoundBase,
  };
}

const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Zurich",
  dateStyle: "short",
  timeStyle: "short",
});

function forms(state, siteId, authorId) {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startToken = store.encrypt(
    JSON.stringify([
      "control-round",
      siteId,
      authorId,
      standard,
      id,
      startedAt,
    ]),
  );
  const [date, time] = clock.format(new Date(startedAt)).split(" ");
  return {
    base: baseForm(state),
    form: findForm(state, siteId),
    start: { id, startToken, date, time },
  };
}

function text(value, limit, message, required = false) {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (required && !value.trim())
  )
    throw store.error(message);
  return value.trim();
}

function pointsFrom(input, minimum) {
  if (!Array.isArray(input) || input.length < minimum || input.length > 50)
    throw store.error(
      minimum
        ? "Einen bis 50 Kontrollpunkte eingeben."
        : "Höchstens 50 zusätzliche Kontrollpunkte eingeben.",
    );
  return input.map((point) => {
    const label = text(
      point,
      240,
      "Kontrollpunkte benötigen eine Bezeichnung mit höchstens 240 Zeichen.",
      true,
    );
    if (/[\r\n]/.test(label))
      throw store.error("Pro Feld einen Kontrollpunkt eingeben.");
    return label;
  });
}

function checkVersion(form, version) {
  if (form.version !== version)
    throw store.error(
      "Die Vorlage wurde zwischenzeitlich geändert. Bitte erneut öffnen.",
      409,
    );
}

function saveForm(state, site, input, archiveFolder) {
  if (input?.scope === "base") {
    checkVersion(baseForm(state), input.version);
    const points = pointsFrom(input.points, 1);
    state.data.controlRoundBase = { version: crypto.randomUUID(), points };
    return;
  }
  if (input?.scope !== "site" || typeof input.useBase !== "boolean")
    throw store.error("Vorlagenart auswählen.");
  checkVersion(findForm(state, site.id), input.version);
  const points = pointsFrom(input.points, input.useBase ? 0 : 1);
  if (
    input.folderId !== "" &&
    (!store.validId(input.folderId) || !archiveFolder(state, input.folderId))
  )
    throw store.error("Ablageordner dieser Heizzentrale auswählen.");
  if (!Array.isArray(input.roundTypes) || input.roundTypes.length > 30)
    throw store.error("Höchstens 30 Rundgangsarten eingeben.");
  const roundTypes = input.roundTypes.map((type) =>
    text(
      type,
      100,
      "Rundgangsarten benötigen eine Bezeichnung mit höchstens 100 Zeichen.",
      true,
    ),
  );
  if (
    roundTypes.some((label) => /[\r\n]/.test(label)) ||
    new Set(roundTypes.map((label) => label.toLocaleLowerCase("de-CH")))
      .size !== roundTypes.length
  )
    throw store.error(
      "Jede Rundgangsart einmal und in einem eigenen Feld eingeben.",
    );
  const templates = (state.data.controlTemplates ??= []);
  const index = templates.findIndex(
    (entry) => entry.siteId === site.id && entry.kind === standard,
  );
  const next = {
    siteId: site.id,
    kind: standard,
    version: crypto.randomUUID(),
    folderId: input.folderId,
    useBase: input.useBase,
    points,
    roundTypes,
  };
  if (index < 0) templates.push(next);
  else templates[index] = next;
}

function readRun(site, author, form, input) {
  let startedAt;
  try {
    if (typeof input.startToken !== "string" || input.startToken.length > 1024)
      throw Error();
    const [scope, siteId, userId, kind, runId, at] = JSON.parse(
      store.decrypt(input.startToken),
    );
    if (
      scope !== "control-round" ||
      siteId !== site.id ||
      userId !== author.id ||
      kind !== standard ||
      runId !== input.id ||
      typeof at !== "string" ||
      !Number.isFinite(Date.parse(at))
    )
      throw Error();
    startedAt = at;
  } catch {
    throw store.error(
      "Der Beginn des Rundgangs konnte nicht bestätigt werden. Bitte das Kontrollblatt neu öffnen.",
      409,
    );
  }
  const roundType = input.roundType ?? "";
  if (
    form.roundTypes.length
      ? !form.roundTypes.includes(roundType)
      : roundType !== ""
  )
    throw store.error("Eine gültige Rundgangsart auswählen.");
  const [date, time] = clock.format(new Date(startedAt)).split(" ");
  if (
    !Array.isArray(input.answers) ||
    input.answers.length !== form.effectivePoints.length
  )
    throw store.error("Für jeden Kontrollpunkt Ja oder Nein auswählen.");
  const items = form.effectivePoints.map((point, index) => {
    const answer = input.answers[index];
    if (!controlChoices.some(([status]) => status === answer?.status))
      throw store.error("Für jeden Kontrollpunkt Ja oder Nein auswählen.");
    return {
      point,
      status: answer.status,
      comment: text(
        answer.comment ?? "",
        1500,
        "Bemerkung mit höchstens 1500 Zeichen eingeben.",
      ),
    };
  });
  return {
    id: input.id,
    siteId: site.id,
    siteName: site.name,
    title: "Kontrollblatt",
    kind: standard,
    roundType,
    date,
    time,
    authorId: author.id,
    authorName: author.name,
    startedAt,
    at: new Date().toISOString(),
    items,
    remarks: text(
      input.remarks ?? "",
      3000,
      "Allgemeine Bemerkungen dürfen höchstens 3000 Zeichen enthalten.",
    ),
  };
}

module.exports = { findForm, forms, saveForm, readRun };
