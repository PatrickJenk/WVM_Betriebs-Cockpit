const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-structure-")),
  port = 4184,
  base = `http://127.0.0.1:${port}`;
let child;
async function start() {
  child = spawn(process.execPath, [path.join(__dirname, "../server.cjs")], {
    env: { ...process.env, PORT: String(port), COCKPIT_DATA_DIR: storage },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(Error("Server exit " + code)));
  });
}
async function stop() {
  if (!child) return;
  const ended = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await ended;
  child = null;
}
async function call(url, method = "GET", payload, token) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: response.status, value: await response.json() };
}
(async () => {
  const { removeStructureItem, siteTabs } =
    await import("../src/services/structure.js");
  await start();
  await call("/api/session");
  const login = await call("/api/login", "POST", {
    name: "WVM-admin",
    password: "9876",
  });
  assert.equal(login.status, 200);
  const admin = login.value.token;
  const read = async (token) =>
    (await call("/api/state", "GET", undefined, token || admin)).value;
  const save = async (state) => {
    const saved = await call("/api/state", "PUT", state, admin);
    assert.equal(saved.status, 200, JSON.stringify(saved.value));
    return saved.value;
  };
  let state = await read();
  const st = state.data.structure;
  st.networks.push(
    { id: "demo-net", name: "Demoverbund" },
    { id: "demo-other", name: "Zweiter Verbund" },
  );
  st.groups.push(
    { id: "demo-group", name: "Nord", networkId: "demo-net", parentId: null },
    {
      id: "demo-child",
      name: "Technik",
      networkId: "demo-net",
      parentId: "demo-group",
    },
  );
  st.sites.push(
    {
      id: "demo-site",
      name: "Demozentrale",
      heatNetworkId: "demo-net",
      groupId: "demo-child",
      address: "Bern",
    },
    {
      id: "demo-sub",
      name: "Unterstation",
      heatNetworkId: "demo-net",
      type: "mbus",
      address: "Bern",
    },
  );
  state.data.plants.push({
    id: "demo-plant",
    siteId: "demo-site",
    name: "Allgemein",
    active: true,
  });
  st.sections.push(
    { id: "demo-tab", siteId: "demo-site", name: "Arbeitsrapporte", order: 2 },
    {
      id: "demo-log-tab",
      siteId: "demo-site",
      name: "Betriebslogbuch",
      builtin: "log",
      order: 0,
    },
    {
      id: "demo-docs-tab",
      siteId: "demo-site",
      name: "Unterlagen",
      builtin: "docs",
      order: 1,
    },
  );
  state.data.folders.push(
    {
      id: "demo-folder",
      siteId: "demo-site",
      sectionId: "demo-tab",
      parentId: null,
      name: "Rapporte",
    },
    {
      id: "demo-nested",
      siteId: "demo-site",
      sectionId: "demo-tab",
      parentId: "demo-folder",
      name: "Oktober",
    },
    { id: "demo-docs", siteId: "demo-site", parentId: null, name: "Schemas" },
  );
  state = await save(state);
  async function upload(id) {
    const response = await fetch(base + "/api/files/" + id, {
      method: "PUT",
      headers: { Authorization: "Bearer " + admin },
      body: "Demo document",
    });
    assert.equal(response.status, 200);
  }
  for (const id of ["demo-report-file", "demo-doc-file", "demo-attachment"])
    await upload(id);
  state = await read();
  state.data.documents.push(
    {
      id: "demo-report-file",
      siteId: "demo-site",
      folderId: "demo-nested",
      name: "Rapport.pdf",
    },
    {
      id: "demo-doc-file",
      siteId: "demo-site",
      folderId: "demo-docs",
      name: "Schema.pdf",
    },
  );
  state.data.entries.push({
    id: "demo-entry",
    siteId: "demo-site",
    plantId: "demo-plant",
    title: "Demo Log",
    description: "Demo",
    nextSteps: "",
    status: "Pendenz",
    priority: "Mittel",
    occurredAt: new Date().toISOString(),
    attachments: [{ id: "demo-attachment", name: "Foto.txt" }],
  });
  state = await save(state);
  const memberLogin = await call("/api/login", "POST", {
    name: "Patrick Jenk",
    password: "ChangeMe123",
  });
  const changed = await call(
    "/api/password",
    "POST",
    { password: "StructureDemo123" },
    memberLogin.value.token,
  );
  assert.equal(changed.status, 200);
  const member = changed.value.token;
  let memberState = await read(member);
  assert.deepEqual(
    siteTabs(memberState.data, "demo-site").map((tab) => tab.name),
    ["Betriebslogbuch", "Unterlagen", "Kontrollblatt", "Arbeitsrapporte"],
  );
  const noteRoute = "/api/sites/demo-site/control-notes";
  assert.equal(
    (await call(noteRoute, "POST", { text: " " }, member)).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/sites/demo-sub/control-notes",
        "POST",
        { text: "Notiz" },
        member,
      )
    ).status,
    404,
  );
  const noted = await call(
    noteRoute,
    "POST",
    { text: "Sichtkontrolle durchgeführt." },
    member,
  );
  assert.equal(noted.status, 201);
  const [note] = noted.value.data.controlNotes;
  assert.equal(note.siteId, "demo-site");
  assert.equal(note.authorId, noted.value.accountId);
  assert.equal(note.text, "Sichtkontrolle durchgeführt.");
  const templateUrl = "/api/sites/demo-site/control-template";
  const points = [
    "Anlage kontrollieren",
    "Sichtprüfung",
    { label: "Messwert notieren", type: "number", unit: "bar" },
    { label: "Befund", type: "text", unit: "" },
  ];
  assert.equal(
    (await call(templateUrl, "PUT", { version: "", points }, member)).status,
    403,
  );
  const defined = await call(
    templateUrl,
    "PUT",
    { version: "", points, title: "Kontrollblatt Test", folderId: "demo-docs" },
    admin,
  );
  assert.equal(defined.status, 200);
  let template = defined.value.data.controlTemplates.find(
    (item) => item.siteId === "demo-site",
  );
  const preview = await fetch(base + "/api/sites/demo-site/control-preview", {
    headers: { Authorization: "Bearer " + member },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "application/pdf");
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  assert.match(previewBytes.subarray(0, 5).toString(), /%PDF/);
  const uploadedSource = await fetch(base + "/api/files/demo-control-source", {
    method: "PUT",
    headers: { Authorization: "Bearer " + admin },
    body: previewBytes,
  });
  assert.equal(uploadedSource.status, 200);
  const sourceState = await read();
  sourceState.data.documents.push({
    id: "demo-control-source",
    siteId: "demo-site",
    folderId: "demo-docs",
    name: "Papier-Vorlage.pdf",
  });
  await save(sourceState);
  const selectedSource = await call(
    templateUrl,
    "PUT",
    { version: template.version, points, sourceId: "demo-control-source" },
    admin,
  );
  assert.equal(selectedSource.status, 200);
  template = selectedSource.value.data.controlTemplates.find(
    (item) => item.siteId === "demo-site",
  );
  const originalPreview = await fetch(
    base + "/api/sites/demo-site/control-preview",
    { headers: { Authorization: "Bearer " + member } },
  );
  assert.equal(originalPreview.status, 200);
  assert.deepEqual(
    Buffer.from(await originalPreview.arrayBuffer()),
    previewBytes,
  );
  const runUrl = "/api/sites/demo-site/control-runs";
  const run = {
    id: "round-example",
    version: template.version,
    answers: [
      { checked: true, comment: "" },
      { checked: false, comment: "" },
      { checked: false, value: "1,7", comment: "" },
      { checked: false, value: "In Ordnung", comment: "" },
    ],
  };
  assert.equal((await call(runUrl, "POST", run, member)).status, 400);
  run.answers[1].comment = "Messgerät war vorübergehend nicht verfügbar.";
  const finished = await call(runUrl, "POST", run, member);
  assert.equal(finished.status, 201, JSON.stringify(finished.value));
  const archivedRound = finished.value.data.controlRuns.find(
    (item) => item.id === run.id,
  );
  assert.equal(archivedRound.items.length, 4);
  assert.equal(archivedRound.items[2].value, "1,7");
  const report = finished.value.data.documents.find(
    (d) => d.id === archivedRound.documentId,
  );
  assert.ok(report.controlRun);
  assert.equal(
    finished.value.data.folders.find((f) => f.id === report.folderId).name,
    "Schemas",
  );
  const response = await fetch(base + "/api/files/" + report.id, {
    headers: { Authorization: "Bearer " + member },
  });
  assert.equal(response.status, 200);
  assert.match(report.name, /^\d{8} Kontrollblatt\.pdf$/);
  assert.match(
    response.headers.get("content-disposition"),
    /Kontrollblatt\.pdf/,
  );
  assert.match(
    Buffer.from(await response.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    /%PDF/,
  );
  const repeated = await call(runUrl, "POST", run, member);
  assert.equal(repeated.status, 200);
  assert.equal(
    repeated.value.data.controlRuns.filter((item) => item.id === run.id).length,
    1,
  );
  const savedPdfUrl = "/api/sites/demo-site/control-complete";
  const header = (id, version = template.version, token = member) => ({
    Authorization: "Bearer " + token,
    "Content-Type": "application/pdf",
    "X-Cockpit-Run-Id": id,
    "X-Cockpit-Template-Version": version,
  });
  const complete = (id, bytes, version, token) =>
    fetch(base + savedPdfUrl, {
      method: "POST",
      headers: header(id, version, token),
      body: bytes,
    });
  assert.equal((await complete("unchanged-pdf", previewBytes)).status, 422);
  // PDF.js loads browser graphics globals even when only reading form data.
  globalThis.DOMMatrix ??= class {};
  globalThis.ImageData ??= class {};
  globalThis.Path2D ??= class {};
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const openPdf = (bytes) => getDocument({ data: Uint8Array.from(bytes) });
  const blankPdf = openPdf(previewBytes);
  const paper = await blankPdf.promise;
  const fields = await paper.getFieldObjects();
  assert.equal(fields.get("point_0")[0].type, "checkbox");
  assert.equal(fields.get("point_2")[0].type, "text");
  paper.annotationStorage.setValue(fields.get("point_0")[0].id, {
    value: true,
  });
  paper.annotationStorage.setValue(fields.get("comment_1")[0].id, {
    value: "Pumpe geprüft.",
  });
  paper.annotationStorage.setValue(fields.get("point_2")[0].id, {
    value: "1,7",
  });
  paper.annotationStorage.setValue(fields.get("point_3")[0].id, {
    value: "In Ordnung",
  });
  const filledBytes = Buffer.from(await paper.saveDocument());
  await blankPdf.destroy();
  assert.equal((await complete("stale-pdf", filledBytes, "old")).status, 409);
  assert.equal(
    (await complete("wrong-pdf", Buffer.from("%PDF-1.7\n%%EOF"))).status,
    422,
  );
  const stored = await complete("filled-control-pdf", filledBytes);
  assert.equal(stored.status, 201, await stored.clone().text());
  const storedState = await stored.json();
  const pdfRound = storedState.data.controlRuns.find(
    (item) => item.id === "filled-control-pdf",
  );
  assert.equal(pdfRound.authorId, storedState.accountId);
  const pdfDocument = storedState.data.documents.find(
    (item) => item.id === pdfRound.documentId,
  );
  assert.equal(pdfDocument.folderId, "demo-docs");
  assert.match(pdfDocument.name, /^\d{8} Kontrollblatt \(2\)\.pdf$/);
  const download = await fetch(base + "/api/files/" + pdfDocument.id, {
    headers: { Authorization: "Bearer " + member },
  });
  const downloadedBytes = Buffer.from(await download.arrayBuffer());
  assert.deepEqual(downloadedBytes, filledBytes);
  const savedPdf = openPdf(downloadedBytes);
  const reopened = await savedPdf.promise;
  const savedFields = await reopened.getFieldObjects();
  assert.equal(savedFields.get("point_0")[0].value, "Yes");
  assert.equal(savedFields.get("comment_1")[0].value, "Pumpe geprüft.");
  assert.equal(savedFields.get("point_2")[0].value, "1,7");
  await savedPdf.destroy();
  assert.equal((await complete("filled-control-pdf", filledBytes)).status, 200);
  assert.equal(
    (await complete("filled-control-pdf", filledBytes, template.version, admin))
      .status,
    409,
  );
  const switched = await call(
    templateUrl,
    "PUT",
    { version: template.version, points, sourceId: "" },
    admin,
  );
  assert.equal(switched.status, 200);
  const generatedTemplate = switched.value.data.controlTemplates.find(
    (item) => item.siteId === "demo-site",
  );
  assert.equal(
    (await complete("filled-generated", filledBytes, generatedTemplate.version))
      .status,
    201,
  );
  const formUrl = "/api/sites/demo-site/control-form";
  const getConfig = async (url = formUrl) =>
    (await call(url, "GET", undefined, member)).value;
  const originalForm = await getConfig();
  assert.equal(originalForm.form.useBase, true);
  assert.deepEqual(originalForm.form.effectivePoints, originalForm.base.points);
  assert.deepEqual(originalForm.form.roundTypes, []);
  const genericWrite = await read();
  genericWrite.data.controlRoundBase = {
    version: "invalid",
    points: ["Ungültiger Änderungsweg"],
  };
  assert.equal(
    (await call("/api/state", "PUT", genericWrite, admin)).status,
    200,
  );
  assert.deepEqual((await getConfig()).base, originalForm.base);

  const baseEdit = {
    scope: "base",
    version: originalForm.base.version,
    points: ["Sichtkontrolle durchführen", "Meldungen prüfen"],
  };
  assert.equal((await call(formUrl, "PUT", baseEdit, member)).status, 403);
  assert.equal((await call(formUrl, "PUT", baseEdit, admin)).status, 200);
  const afterBase = await getConfig();
  const other = await getConfig("/api/sites/eiger/control-form");
  assert.deepEqual(other.form.effectivePoints, baseEdit.points);
  assert.notEqual(afterBase.form.version, originalForm.form.version);
  const newForm = {
    scope: "site",
    version: afterBase.form.version,
    folderId: "demo-docs",
    useBase: true,
    title: "Pflichtenheft Anlagewart",
    points: [
      { type: "section", label: "Heizraum" },
      { type: "point", label: "Druck prüfen", cells: ["Immer", ""] },
    ],
    columns: ["Wann", "Messwert"],
    fixedColumns: [true, false],
    roundTypes: ["Normalrunde", "Nachkontrolle"],
  };
  assert.equal((await call(formUrl, "PUT", newForm, member)).status, 403);
  assert.equal(
    (
      await call(
        formUrl,
        "PUT",
        { ...newForm, roundTypes: ["Probe", "probe"] },
        admin,
      )
    ).status,
    400,
  );
  assert.equal((await call(formUrl, "PUT", newForm, admin)).status, 200);
  assert.equal((await call(formUrl, "PUT", newForm, admin)).status, 409);
  const { form: updated, start: roundStart } = await getConfig();
  assert.deepEqual(updated.effectivePoints, [
    ...baseEdit.points,
    ...newForm.points,
  ]);
  assert.deepEqual(updated.columns, newForm.columns);
  assert.deepEqual(updated.fixedColumns, newForm.fixedColumns);
  assert.equal(updated.title, newForm.title);
  assert.deepEqual(updated.roundTypes, newForm.roundTypes);

  const submitUrl = "/api/sites/demo-site/control-submit";
  const submission = {
    id: roundStart.id,
    startToken: roundStart.startToken,
    version: updated.version,
    date: "2000-01-01",
    time: "00:00",
    authorName: "Fremde Identität",
    roundType: "Nachkontrolle",
    answers: [
      { status: "yes" },
      { status: "no" },
      { status: "yes", comment: "Geprüft.", cells: ["Verändert", "1,7 bar"] },
    ],
  };
  assert.equal(
    (await call(submitUrl, "POST", { ...submission, roundType: "" }, member))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        submitUrl,
        "POST",
        { ...submission, roundType: "Unbekannt" },
        member,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        submitUrl,
        "POST",
        {
          ...submission,
          answers: [{ status: ["yes", "no"] }, ...submission.answers.slice(1)],
        },
        member,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        submitUrl,
        "POST",
        { ...submission, startToken: other.start.startToken },
        member,
      )
    ).status,
    409,
  );
  assert.equal((await call(submitUrl, "POST", submission, admin)).status, 409);
  const digital = await call(submitUrl, "POST", submission, member);
  assert.equal(digital.status, 201, JSON.stringify(digital.value));
  const runSaved = digital.value.data.controlRuns.find(
    (item) => item.id === submission.id,
  );
  assert.equal(runSaved.authorId, digital.value.accountId);
  assert.notEqual(runSaved.authorName, submission.authorName);
  assert.equal(runSaved.date, roundStart.date);
  assert.equal(runSaved.time, roundStart.time);
  assert.equal(runSaved.roundType, "Nachkontrolle");
  assert.equal(runSaved.items[1].status, "no");
  assert.equal(runSaved.items[1].comment, "");
  assert.deepEqual(runSaved.items[2], { section: "Heizraum" });
  assert.deepEqual(runSaved.items[3].cells, ["Immer", "1,7 bar"]);
  assert.equal(runSaved.title, newForm.title);
  const digitalFile = digital.value.data.documents.find(
    (item) => item.id === runSaved.documentId,
  );
  assert.equal(digitalFile.folderId, "demo-docs");
  assert.ok(
    digitalFile.name.startsWith(
      runSaved.date.replaceAll("-", "") + " Kontrollblatt",
    ),
  );
  const reportUrl = base + "/api/sites/demo-site/control-report/" + runSaved.id;
  assert.equal((await fetch(reportUrl)).status, 401);
  const auth = { headers: { Authorization: "Bearer " + member } };
  const responsePdf = await fetch(base + "/api/files/" + digitalFile.id, auth);
  assert.equal(responsePdf.status, 200);
  const bytesPdf = Buffer.from(await responsePdf.arrayBuffer());
  assert.equal(bytesPdf.subarray(0, 5).toString(), "%PDF-");
  const roundPdf = openPdf(bytesPdf);
  const page = await (await roundPdf.promise).getPage(1);
  const pageText = (await page.getTextContent()).items.map((item) => item.str);
  for (const label of [newForm.title, "Wann", "Heizraum", "Immer", "1,7 bar"])
    assert.ok(pageText.includes(label), label);
  assert.ok(page.view[2] > page.view[3]);
  await roundPdf.destroy();
  assert.equal((await call(submitUrl, "POST", submission, member)).status, 200);

  assert.equal(
    (
      await call(
        formUrl,
        "PUT",
        { ...newForm, version: updated.version, roundTypes: [] },
        admin,
      )
    ).status,
    200,
  );
  const withoutType = await getConfig();
  assert.deepEqual(withoutType.form.roundTypes, []);
  assert.equal(
    (
      await call(
        submitUrl,
        "POST",
        {
          ...submission,
          version: withoutType.form.version,
          startToken: withoutType.start.startToken,
          id: withoutType.start.id,
          roundType: undefined,
        },
        member,
      )
    ).status,
    201,
  );
  const unchangedReport = await fetch(reportUrl, auth);
  assert.deepEqual(Buffer.from(await unchangedReport.arrayBuffer()), bytesPdf);
  const unauthorizedRemove = await read(member);
  unauthorizedRemove.data.documents = unauthorizedRemove.data.documents.filter(
    (d) => d.id !== report.id,
  );
  assert.equal(
    (await call("/api/state", "PUT", unauthorizedRemove, member)).status,
    403,
  );
  const memberSave = await read(member);
  memberSave.data.entries.push({
    id: "member-own-entry",
    siteId: "demo-site",
    plantId: "demo-plant",
    title: "Eigener Eintrag",
    description: "Prüfung",
    status: "Pendenz",
  });
  assert.equal(
    (await call("/api/state", "PUT", memberSave, member)).status,
    200,
  );
  const memberDelete = await read(member);
  memberDelete.data.entries = memberDelete.data.entries.filter(
    (e) => e.id !== "member-own-entry",
  );
  assert.equal(
    (await call("/api/state", "PUT", memberDelete, member)).status,
    200,
  );
  const foreignDelete = await read(member);
  foreignDelete.data.entries = foreignDelete.data.entries.filter(
    (e) => e.id !== "demo-entry",
  );
  assert.equal(
    (await call("/api/state", "PUT", foreignDelete, member)).status,
    403,
  );
  memberState = await read(member);
  const dateCorrection = structuredClone(memberState);
  dateCorrection.data.entries.find(
    (entry) => entry.id === "demo-entry",
  ).occurredAt = "2026-01-06T11:30:00.000Z";
  assert.equal(
    (await call("/api/state", "PUT", dateCorrection, member)).status,
    403,
  );
  const adminCorrection = await read();
  const originalDate = adminCorrection.data.entries.find(
    (entry) => entry.id === "demo-entry",
  ).occurredAt;
  const corrected = adminCorrection.data.entries.find(
    (entry) => entry.id === "demo-entry",
  );
  corrected.occurredAt = "2026-01-06T11:30:00.000Z";
  corrected.activity = "Kontrollrundgang ohne Ascheleerung";
  const correctionResult = await save(adminCorrection);
  const savedCorrection = correctionResult.data.entries.find(
    (entry) => entry.id === "demo-entry",
  );
  assert.equal(savedCorrection.occurredAt, corrected.occurredAt);
  assert.equal(savedCorrection.history.at(-1).occurredAt, originalDate);
  assert.equal(savedCorrection.activity, corrected.activity);
  memberState = await read(member);
  for (const kind of ["networks", "sites", "groups", "sections"]) {
    const denied = structuredClone(memberState);
    denied.data.structure[kind].find((x) => x.id.startsWith("demo")).name =
      "Verboten";
    assert.equal((await call("/api/state", "PUT", denied, member)).status, 403);
  }
  const invalid = await read();
  invalid.data.structure.sections.find((s) => s.id === "demo-tab").order = -1;
  assert.equal((await call("/api/state", "PUT", invalid, admin)).status, 400);
  const duplicate = await read();
  duplicate.data.structure.sections.push({
    id: "duplicate-tab",
    siteId: "demo-site",
    name: "Duplicate",
    builtin: "log",
  });
  assert.equal((await call("/api/state", "PUT", duplicate, admin)).status, 400);
  const cross = await read();
  cross.data.folders.find((f) => f.id === "demo-nested").parentId = "demo-docs";
  assert.equal((await call("/api/state", "PUT", cross, admin)).status, 400);
  const dangling = await read();
  dangling.data.structure.sites = dangling.data.structure.sites.filter(
    (s) => s.id !== "demo-sub",
  );
  dangling.data.folders.push({
    id: "orphan",
    siteId: "demo-sub",
    parentId: null,
    name: "Orphan",
  });
  assert.equal((await call("/api/state", "PUT", dangling, admin)).status, 400);
  state = await read();
  state.data.structure.networks.find((n) => n.id === "demo-net").name =
    "Umbenannt";
  state.data.structure.sites.find((s) => s.id === "demo-site").name =
    "Neue Bezeichnung";
  state.data.structure.groups
    .filter((g) => g.id.startsWith("demo"))
    .forEach((g) => (g.networkId = "demo-other"));
  state.data.structure.sites.find((s) => s.id === "demo-site").heatNetworkId =
    "demo-other";
  state.data.structure.sections.find((s) => s.id === "demo-tab").name =
    "Rapporte";
  state.data.structure.sections.find((s) => s.id === "demo-tab").order = 0;
  state.data.structure.sections.find((s) => s.id === "demo-log-tab").order = 1;
  state.data.structure.sections.find((s) => s.id === "demo-docs-tab").order = 2;
  state.data.folders.find((f) => f.id === "demo-nested").name = "2026";
  state = await save(state);
  await stop();
  await start();
  state = await read();
  assert.equal(
    state.data.structure.networks.find((n) => n.id === "demo-net").name,
    "Umbenannt",
  );
  assert.equal(
    state.data.structure.sites.find((s) => s.id === "demo-site").heatNetworkId,
    "demo-other",
  );
  assert.deepEqual(
    siteTabs(state.data, "demo-site").map((t) => t.name),
    ["Rapporte", "Betriebslogbuch", "Unterlagen", "Kontrollblatt"],
  );
  assert.deepEqual(state.data.controlNotes, [note]);
  assert.equal(
    state.data.folders.find((f) => f.id === "demo-nested").name,
    "2026",
  );
  assert.equal(
    (
      await fetch(base + "/api/files/demo-report-file", {
        headers: { Authorization: "Bearer " + member },
      })
    ).status,
    200,
  );
  const incomplete = structuredClone(state);
  incomplete.data.structure.sections =
    incomplete.data.structure.sections.filter((s) => s.id !== "demo-tab");
  assert.equal(
    (await call("/api/state", "PUT", incomplete, admin)).status,
    400,
  );
  removeStructureItem(state.data, "sections", "demo-tab");
  state = await save(state);
  assert.equal(
    state.data.documents.find((d) => d.id === "demo-doc-file").name,
    "Schema.pdf",
  );
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-report-file")));
  memberState = await read(member);
  assert.ok(
    !siteTabs(memberState.data, "demo-site").some((t) => t.id === "demo-tab"),
  );
  removeStructureItem(state.data, "groups", "demo-group");
  state = await save(state);
  assert.ok(!state.data.structure.sites.some((s) => s.id === "demo-site"));
  assert.ok(state.data.structure.sites.some((s) => s.id === "demo-sub"));
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-doc-file")));
  assert.ok(!fs.existsSync(path.join(storage, "files", "demo-attachment")));
  removeStructureItem(state.data, "networks", "demo-net");
  state = await save(state);
  assert.ok(!state.data.structure.sites.some((s) => s.id === "demo-sub"));
  assert.ok(state.data.structure.networks.some((n) => n.id === "marzili"));
  await stop();
  await start();
  state = await read(member);
  assert.ok(!state.data.structure.networks.some((n) => n.id === "demo-net"));
  console.log(
    "Passed: structure CRUD and tab order on real SQLite/HTTP, restart persistence, member visibility/admin rights, reference validation and cascade file cleanup.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(stop);
setTimeout(() => {
  child?.kill();
  process.exitCode = 1;
  console.error("Structure HTTP test timeout");
}, 25000).unref();
