const crypto = require("node:crypto");
const store = require("./server-security.cjs");
const examples = require("./src/data/control-round-examples.json");
const {
  controlChoices,
  controlTemplateChoices,
  isRoundSection,
  roundPointLabel,
  standardControlTemplate: standard,
} = require("./src/services/control-sheet.js");

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

function findForm(state, siteId, templateId = standard) {
  const base = baseForm(state);
  const saved =
    state.data.controlTemplates?.filter((entry) => entry.siteId === siteId) ||
    [];
  const own = saved.find(
    (entry) => entry.kind === standard && (entry.id ?? standard) === templateId,
  );
  if (!own && templateId !== standard)
    throw store.error("Kontrollblattvorlage nicht gefunden.", 404);
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
  const columns = own?.columns || [];
  const fixedColumns = own?.fixedColumns || [];
  const title = own?.title || "Kontrollblatt";
  return {
    siteId,
    id: templateId,
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
    columns,
    fixedColumns,
    title,
    interval: own?.interval || "",
    effectivePoints: useBase ? [...base.points, ...points] : points,
    example: useBase && !state.data.controlRoundBase,
  };
}

const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Zurich",
  dateStyle: "short",
  timeStyle: "short",
});

function forms(state, siteId, authorId, templateId = standard) {
  const form = findForm(state, siteId, templateId);
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startToken = store.encrypt(
    JSON.stringify([
      "control-round",
      siteId,
      authorId,
      templateId,
      id,
      startedAt,
    ]),
  );
  const [date, time] = clock.format(new Date(startedAt)).split(" ");
  return {
    base: baseForm(state),
    form,
    templates: controlTemplateChoices(state.data.controlTemplates, siteId),
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

function pointsFrom(input, minimum, fixedColumns = []) {
  if (!Array.isArray(input) || input.length < minimum || input.length > 50)
    throw store.error(
      minimum
        ? "Einen bis 50 Kontrollpunkte eingeben."
        : "Höchstens 50 zusätzliche Kontrollpunkte eingeben.",
    );
  return input.map((point) => {
    const section = isRoundSection(point);
    const values = point?.type === "point";
    const label = text(
      section || values ? point.label : point,
      240,
      "Kontrollpunkte benötigen eine Bezeichnung mit höchstens 240 Zeichen.",
      true,
    );
    if (/[\r\n]/.test(label))
      throw store.error("Pro Feld einen Kontrollpunkt eingeben.");
    if (section) return { type: "section", label };
    if (!values) return label;
    if (
      !Array.isArray(point.cells) ||
      point.cells.length !== fixedColumns.length
    )
      throw store.error(
        "Die Zusatzfelder stimmen nicht mit der Vorlage überein.",
      );
    const cells = fixedColumns.map((fixed, index) =>
      fixed ? extraText(point.cells[index]) : "",
    );
    return cells.some(Boolean) ? { type: "point", label, cells } : label;
  });
}

function requireControlPoint(points) {
  if (points.every(isRoundSection))
    throw store.error("Mindestens einen Kontrollpunkt eingeben.");
}

function extraText(value) {
  return text(
    value ?? "",
    150,
    "Zusatzfelder dürfen höchstens 150 Zeichen enthalten.",
  );
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
    requireControlPoint(points);
    state.data.controlRoundBase = { version: crypto.randomUUID(), points };
    return;
  }
  if (input?.scope !== "site" || typeof input.useBase !== "boolean")
    throw store.error("Vorlagenart auswählen.");
  const templateId = input.templateId ?? standard;
  if (
    templateId !== standard &&
    (typeof templateId !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(templateId))
  )
    throw store.error("Ungültige Vorlagen-ID.");
  const templates = (state.data.controlTemplates ??= []);
  const index = templates.findIndex(
    (entry) =>
      entry.siteId === site.id &&
      entry.kind === standard &&
      (entry.id ?? standard) === templateId,
  );
  if (input.version === "" && templateId !== standard) {
    if (index >= 0)
      throw store.error(
        "Die Vorlage existiert bereits. Bitte erneut öffnen.",
        409,
      );
  } else {
    checkVersion(findForm(state, site.id, templateId), input.version);
  }
  const title = text(
    input.title ?? "",
    100,
    templateId === standard
      ? "Der Titel darf höchstens 100 Zeichen enthalten."
      : "Einen Titel mit höchstens 100 Zeichen eingeben.",
    templateId !== standard,
  );
  const interval = text(
    input.interval ?? templates[index]?.interval ?? "",
    100,
    templateId === standard
      ? "Das Kontrollintervall darf höchstens 100 Zeichen enthalten."
      : "Ein Kontrollintervall mit höchstens 100 Zeichen eingeben.",
    templateId !== standard,
  );
  const columnInput = input.columns ?? [];
  if (!Array.isArray(columnInput) || columnInput.length > 4)
    throw store.error("Höchstens vier Zusatzspalten eingeben.");
  const columns = columnInput.map((label) =>
    text(
      label,
      40,
      "Spalten benötigen einen Namen mit höchstens 40 Zeichen.",
      true,
    ),
  );
  if (
    columns.some((label) => /[\r\n]/.test(label)) ||
    new Set(columns.map((label) => label.toLocaleLowerCase("de-CH"))).size !==
      columns.length
  )
    throw store.error(
      "Jeden Zusatzspaltennamen einmal und in einem eigenen Feld eingeben.",
    );
  const fixedColumns = input.fixedColumns ?? columns.map(() => false);
  if (
    !Array.isArray(fixedColumns) ||
    fixedColumns.length !== columns.length ||
    fixedColumns.some((fixed) => typeof fixed !== "boolean")
  )
    throw store.error("Für jede Zusatzspalte eine Eingabeart auswählen.");
  const points = pointsFrom(input.points, input.useBase ? 0 : 1, fixedColumns);
  if (!input.useBase) requireControlPoint(points);
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
  const next = {
    siteId: site.id,
    kind: standard,
    ...(templateId === standard ? {} : { id: templateId }),
    version: crypto.randomUUID(),
    folderId: input.folderId,
    useBase: input.useBase,
    points,
    roundTypes,
    title,
    interval,
    columns,
    fixedColumns,
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
      kind !== form.id ||
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
  const points = form.effectivePoints.filter((point) => !isRoundSection(point));
  if (!Array.isArray(input.answers) || input.answers.length !== points.length)
    throw store.error("Für jeden Kontrollpunkt Ja oder Nein auswählen.");
  let answerIndex = 0;
  const items = form.effectivePoints.map((point) => {
    if (isRoundSection(point)) return { section: point.label };
    const answer = input.answers[answerIndex++];
    if (!controlChoices.some(([status]) => status === answer?.status))
      throw store.error("Für jeden Kontrollpunkt Ja oder Nein auswählen.");
    return {
      point: roundPointLabel(point),
      status: answer.status,
      cells: form.columns.map((_, index) =>
        form.fixedColumns[index]
          ? (point.cells?.[index] ?? "")
          : extraText(answer.cells?.[index]),
      ),
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
    title: form.title,
    templateId: form.id,
    templateVersion: form.version,
    interval: form.interval,
    columns: form.columns,
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
