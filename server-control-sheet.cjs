const fs = require("node:fs");
const crypto = require("node:crypto");
const PDFDocument = require("pdfkit");
const store = require("./server-security.cjs");
const scan = require("./server-scanner.cjs");
const round = require("./server-control-round.cjs");
const renderRoundPdf = require("./server-control-round-pdf.cjs");
const { readLogo } = require("./server-control-logo.cjs");
const { isAdministrator } = require("./src/auth/roles.js");
const {
  controlPoint,
  controlPointTypes,
} = require("./src/services/control-sheet.js");

function checkboxAppearance(doc, checked) {
  const ref = doc.ref({
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, 16, 16],
    Resources: {},
  });
  const box = "0.94 0.97 0.99 rg 0.33 0.48 0.59 RG 0.8 w 0.5 0.5 15 15 re B";
  const tick = "0.08 0.29 0.47 RG 1.8 w 3 8 m 6.5 4.5 l 13 12 l S";
  ref.end(checked ? box + "\n" + tick : box);
  return ref;
}

function addWidget(doc, x, y, width, height, fields) {
  doc.annotate(x, y, width, height, { Subtype: "Widget", F: 4, ...fields });
  doc._root.data.AcroForm.data.Fields.push(doc.page.annotations.at(-1));
}

function addTextField(
  doc,
  name,
  tooltip,
  x,
  y,
  width,
  height,
  maxLength,
  multiline,
) {
  const fields = doc._fieldDict(name, "text", {
    multiline,
    backgroundColor: "#eef5fa",
    borderColor: "#849fb3",
  });
  addWidget(doc, x, y, width, height, {
    ...fields,
    TU: new String(tooltip),
    MaxLen: maxLength,
  });
}

function addFormPoint(doc, item, index, appearances) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const label = `${index + 1}. ${item.point}`;
  doc.font("Helvetica-Bold").fontSize(10);
  const labelHeight = doc.heightOfString(label, { width });
  if (doc.y + labelHeight + 116 > doc.page.height - doc.page.margins.bottom)
    doc.addPage();
  doc.moveDown(0.55).text(label);
  doc.font("Helvetica");
  const y = doc.y + 5;
  const name = "point_" + index;
  if (item.type === "check") {
    doc
      .save()
      .lineWidth(0.8)
      .rect(left + 0.5, y + 0.5, 15, 15)
      .fillAndStroke("#eef5fa", "#849fb3")
      .restore();
    addWidget(doc, left, y, 16, 16, {
      FT: "Btn",
      T: new String(name),
      TU: new String(item.point),
      V: "Off",
      AS: "Off",
      AP: { N: appearances },
    });
    doc.text("Abgehakt", left + 23, y + 3, { lineBreak: false });
    doc.x = left;
    doc.y = y + 21;
  } else {
    const label = item.type === "number" ? "Messwert" : "Eintrag";
    doc.text(label + (item.unit ? " (" + item.unit + ")" : ""), left, y);
    const height = item.type === "number" ? 20 : 31;
    const top = doc.y + 3;
    const numeric = item.type === "number";
    addTextField(
      doc,
      name,
      item.point,
      left,
      top,
      numeric ? 130 : width,
      height,
      numeric ? 40 : 500,
      !numeric,
    );
    doc.y = top + height + 5;
  }
  doc.text("Kommentar");
  const top = doc.y + 3;
  addTextField(
    doc,
    "comment_" + index,
    "Kommentar: " + item.point,
    left,
    top,
    width,
    27,
    1000,
    true,
  );
  doc.y = top + 32;
}

function pdf(site, template, run) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: template.title || "Kontrollblatt",
        CreationDate: new Date(run?.at || 0),
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc
      .fontSize(23)
      .fillColor("#163953")
      .text(template.title || "Kontrollblatt");
    doc.moveDown(0.4).fontSize(14).text(site.name);
    doc.fillColor("#243746").fontSize(10);
    if (run)
      doc.text(
        new Intl.DateTimeFormat("de-CH", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Europe/Zurich",
        }).format(new Date(run.at)),
      );
    if (run) doc.text("Durchgeführt von: " + run.authorName);
    else doc.text("Vorlage für den Kontrollrundgang");
    if (template.instructions) doc.moveDown().text(template.instructions);
    const items =
      run?.items ||
      template.points.map((point) => {
        const { label, type, unit } = controlPoint(point);
        return { point: label, type, unit };
      });
    if (!run) {
      doc.initForm();
      doc._root.data.AcroForm.data.DA = new String(
        `/${doc._font.id} 11 Tf 0 g`,
      );
      const appearances = items.some((item) => item.type === "check")
        ? {
            Off: checkboxAppearance(doc, false),
            Yes: checkboxAppearance(doc, true),
          }
        : null;
      for (const [index, item] of items.entries())
        addFormPoint(doc, item, index, appearances);
      doc.end();
      return;
    }
    for (const [index, item] of items.entries()) {
      doc
        .moveDown()
        .font("Helvetica-Bold")
        .text(`${index + 1}. ${item.point}`);
      const type = item.type || "check";
      const prompt =
        type === "check"
          ? "Kontrolle"
          : type === "number"
            ? "Messwert"
            : "Eintrag";
      const value =
        type === "check"
          ? item.checked
            ? "Abgehakt"
            : "Nicht abgehakt"
          : (item.value ?? "–");
      doc
        .font("Helvetica")
        .text(`${prompt}: ${value}${item.unit ? " " + item.unit : ""}`);
      if (item.comment) doc.text("Kommentar: " + item.comment);
    }
    doc.end();
  });
}

module.exports = async function controlSheet(
  req,
  res,
  { body, json, visible, defaultStructure },
) {
  const route = req.url
    .split("?")[0]
    .match(
      /^\/api\/sites\/([a-zA-Z0-9-]{1,100})\/control-(template|runs|preview|complete|form|submit|report)(?:\/([a-zA-Z0-9-]{1,100}))?$/,
    );
  if (!route) return false;
  const [, siteId, mode, resourceId] = route;
  const template = mode === "template";
  const complete = mode === "complete";
  const digital = mode === "submit";
  const editingForm = mode === "form" && req.method === "PUT";
  const expected = {
    template: ["PUT"],
    preview: ["GET"],
    form: ["GET", "PUT"],
    report: ["GET"],
  };
  if (
    !(expected[mode] || ["POST"]).includes(req.method) ||
    (mode === "report") !== !!resourceId
  )
    throw store.error("Nicht gefunden.", 404);
  const authorize = (state) => {
    const u = store.session(req, state);
    store.requireUser(u);
    if (
      req.headers["x-cockpit-account"] &&
      req.headers["x-cockpit-account"] !== u.id
    )
      throw store.error("Anmeldung wurde geändert. Bitte neu laden.", 409);
    if ((template || editingForm) && !isAdministrator(u))
      throw store.error(
        "Nur Admins können Kontrollblätter konfigurieren.",
        403,
      );
    const site = (state.data.structure || defaultStructure()).sites.find(
      (s) => s.id === siteId,
    );
    if (!site || site.type)
      throw store.error("Heizzentrale nicht gefunden.", 404);
    return { u, site };
  };
  const initial = store.read();
  const actor = authorize(initial).u;
  const findTemplate = (state) =>
    state.data.controlTemplates?.find(
      (item) => item.siteId === siteId && !item.kind,
    );
  const archiveFolder = (state, id) =>
    state.data.folders.find(
      (f) => f.id === id && f.siteId === siteId && !f.sectionId,
    );
  const sourcePdf = (state, id) =>
    state.data.documents.find(
      (d) =>
        d.id === id && d.siteId === siteId && d.mimeType === "application/pdf",
    );
  if (mode === "form" && !editingForm) {
    json(res, 200, round.forms(initial, siteId, actor.id));
    return true;
  }
  if (mode === "report") {
    const run = initial.data.controlRuns?.find(
      (item) => item.siteId === siteId && item.id === resourceId && item.kind,
    );
    if (!run) throw store.error("Kontrollrundgang nicht gefunden.", 404);
    const inline =
      new URL(req.url, "http://localhost").searchParams.get("inline") === "1";
    let bytes;
    try {
      if (run.documentId)
        bytes = await fs.promises.readFile(store.filePath(run.documentId));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    bytes ??= await renderRoundPdf(run, readLogo(siteId, run.logoId)?.bytes);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        (inline ? "inline" : "attachment") +
        `; filename="${run.date.replaceAll("-", "")} Kontrollblatt.pdf"`,
      "Cache-Control": "no-store",
    });
    res.end(bytes);
    return true;
  }
  const templatePdf = async (state, site, source) => {
    if (!source)
      throw store.error("Kontrollblatt noch nicht eingerichtet.", 404);
    const uploaded = source.sourceId && sourcePdf(state, source.sourceId);
    if (source.sourceId && !uploaded)
      throw store.error(
        "Die ausgewählte PDF-Vorlage ist nicht mehr in den Dokumenten vorhanden.",
        404,
      );
    return uploaded
      ? await fs.promises.readFile(store.filePath(uploaded.id))
      : await pdf(site, source);
  };
  if (mode === "preview") {
    const source = findTemplate(initial);
    const bytes = await templatePdf(initial, authorize(initial).site, source);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="Kontrollblatt.pdf"',
      "X-Cockpit-Template-Version": source.version,
    });
    res.end(bytes);
    return true;
  }
  const input = complete
    ? {
        id: req.headers["x-cockpit-run-id"],
        version: req.headers["x-cockpit-template-version"],
      }
    : JSON.parse(
        (await body(req, (digital ? 1024 : 256) * 1024)).toString("utf8"),
      );
  const verify = (state) => {
    const current = authorize(state);
    if (actor.id !== current.u.id)
      throw store.error("Anmeldung wurde geändert.", 409);
    return current;
  };
  if (editingForm) {
    const result = store.locked(() => {
      const state = store.read();
      const { u, site } = verify(state);
      round.saveForm(state, site, input, archiveFolder);
      state.revision++;
      store.persist(state);
      store.audit(u, "control.template.updated", {
        siteId,
        scope: input.scope,
      });
      return visible(state, u);
    });
    json(res, 200, result);
    return true;
  }
  if (template) {
    const points = input?.points;
    if (
      !Array.isArray(points) ||
      points.length > 50 ||
      points.some((value) => {
        const point = controlPoint(value);
        return (
          typeof point?.label !== "string" ||
          !point.label.trim() ||
          point.label.length > 240 ||
          /[\r\n]/.test(point.label) ||
          !controlPointTypes.some(([type]) => type === point.type) ||
          typeof point.unit !== "string" ||
          point.unit.length > 35 ||
          /[\r\n]/.test(point.unit)
        );
      }) ||
      (input.title !== undefined &&
        (typeof input.title !== "string" || input.title.length > 100)) ||
      (input.instructions !== undefined &&
        (typeof input.instructions !== "string" ||
          input.instructions.length > 1200))
    )
      throw store.error(
        "Bis zu 50 Prüfpunkte mit höchstens 240 Zeichen pro Zeile eingeben.",
      );
    const result = store.locked(() => {
      const state = store.read(),
        { u } = verify(state);
      const templates = (state.data.controlTemplates ??= []);
      const previous = findTemplate(state);
      if ((previous?.version || "") !== input.version)
        throw store.error(
          "Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.",
          409,
        );
      const folderId = input.folderId ?? previous?.folderId ?? "";
      const sourceId = input.sourceId ?? previous?.sourceId ?? "";
      if (
        folderId !== "" &&
        (!store.validId(folderId) || !archiveFolder(state, folderId))
      )
        throw store.error("Ablageordner dieser Heizzentrale auswählen.");
      if (
        sourceId !== "" &&
        (!store.validId(sourceId) || !sourcePdf(state, sourceId))
      )
        throw store.error(
          "Eine PDF-Vorlage aus den Dokumenten dieser Heizzentrale auswählen.",
        );
      state.data.controlTemplates = templates.filter(
        (record) => record.siteId !== siteId || record.kind,
      );
      state.data.controlTemplates.push({
        siteId,
        version: crypto.randomUUID(),
        title: (input.title ?? previous?.title ?? "").trim() || "Kontrollblatt",
        instructions: (
          input.instructions ??
          previous?.instructions ??
          ""
        ).trim(),
        folderId,
        sourceId,
        points: points.map(controlPoint).map((point) => ({
          label: point.label.trim(),
          type: point.type,
          unit: point.type === "number" ? point.unit.trim() : "",
        })),
      });
      state.revision++;
      store.persist(state);
      store.audit(u, "control.template.updated", { siteId });
      return visible(state, u);
    });
    json(res, 200, result);
    return true;
  }
  if (!store.validId(input?.id)) throw store.error("Ungültige Rundgang-ID.");
  const retry = (state, u) => {
    const stored = state.data.controlRuns?.find((run) => run.id === input.id);
    if (stored && (stored.siteId !== siteId || stored.authorId !== u.id))
      throw store.error("Rundgang-ID bereits vergeben.", 409);
    return stored;
  };
  const { u, site } = verify(initial);
  if (retry(initial, u)) {
    json(res, 200, visible(initial, u));
    return true;
  }
  const selectTemplate = (state) =>
    digital ? round.findForm(state, siteId) : findTemplate(state);
  const source = selectTemplate(initial);
  if (
    !source ||
    source.version !== input.version ||
    !(
      (digital ? source.effectivePoints : source.points).length ||
      (complete && source.sourceId)
    )
  )
    throw store.error("Kontrollblatt wurde geändert. Bitte neu laden.", 409);
  const readAnswers = () => {
    if (
      !Array.isArray(input.answers) ||
      input.answers.length !== source.points.length
    )
      throw store.error("Alle Prüfpunkte müssen bearbeitet werden.");
    return input.answers.map((answer, index) => {
      const { label, type, unit } = controlPoint(source.points[index]);
      const value =
        typeof answer?.value === "string" ? answer.value.trim() : "";
      if (
        typeof answer?.checked !== "boolean" ||
        typeof answer.comment !== "string" ||
        answer.comment.length > 1000 ||
        (type === "check" && !answer.checked && !answer.comment.trim()) ||
        (type !== "check" && (!value || value.length > 500)) ||
        (type === "number" &&
          (!/^-?\d+(?:[.,]\d+)?$/.test(value) ||
            !Number.isFinite(Number(value.replace(",", ".")))))
      )
        throw store.error(
          "Jeden Prüfpunkt abhaken oder begründen und alle Eingabefelder ausfüllen.",
        );
      return {
        point: label,
        type,
        unit,
        checked: answer.checked,
        value,
        comment: answer.comment.trim(),
      };
    });
  };
  const run = digital
    ? round.readRun(site, u, source, input)
    : {
        id: input.id,
        siteId,
        authorId: u.id,
        authorName: u.name,
        at: new Date().toISOString(),
        ...(complete ? {} : { items: readAnswers() }),
      };
  let bytes;
  if (complete) {
    if (req.headers["content-type"] !== "application/pdf")
      throw store.error("Ausgefülltes PDF erwartet.", 415);
    bytes = await body(req);
    const blank = await templatePdf(initial, site, source);
    if (
      bytes.length <= blank.length ||
      !bytes.subarray(0, blank.length).equals(blank) ||
      !/%%EOF\s*$/.test(bytes.subarray(-64).toString("latin1"))
    )
      throw store.error(
        "Das PDF gehört nicht zur Vorlage oder hat keine gespeicherten Eingaben.",
        422,
      );
    const temporary = store.filePath(crypto.randomUUID());
    await fs.promises.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    try {
      await scan(temporary, store.production);
    } finally {
      await fs.promises.unlink(temporary);
    }
  } else
    bytes = digital ? await renderRoundPdf(run) : await pdf(site, source, run);
  let written;
  try {
    const result = store.locked(() => {
      const state = store.read(),
        { u } = verify(state);
      if (retry(state, u)) return visible(state, u);
      if (
        selectTemplate(state)?.version !== source.version ||
        (complete && source.sourceId && !sourcePdf(state, source.sourceId))
      )
        throw store.error(
          "Kontrollblatt wurde geändert. Bitte neu laden.",
          409,
        );
      let folder = source.folderId
        ? archiveFolder(state, source.folderId)
        : state.data.folders.find(
            (f) =>
              f.siteId === siteId &&
              !f.sectionId &&
              (f.controlArchive ||
                (!f.parentId && f.name === "Kontrollrundgänge")),
          );
      if (source.folderId && !folder)
        throw store.error(
          "Der gewählte Ablageordner fehlt. Admin soll die Vorlage aktualisieren.",
          409,
        );
      if (!folder) {
        folder = {
          id: crypto.randomUUID(),
          siteId,
          parentId: null,
          name: "Kontrollrundgänge",
          controlArchive: true,
        };
        state.data.folders.push(folder);
      }
      const documentId = crypto.randomUUID();
      const file = store.filePath(documentId);
      fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
      written = { file, documentId };
      store.registerUpload(documentId, u.id, bytes.length, "application/pdf");
      const date = (
        run.date ||
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Zurich",
          dateStyle: "short",
        }).format(new Date(run.at))
      ).replaceAll("-", "");
      const title = date + " Kontrollblatt";
      let name = title + ".pdf";
      for (
        let copy = 2;
        state.data.documents.some(
          (d) => d.folderId === folder.id && d.name === name,
        );
        copy++
      )
        name = `${title} (${copy}).pdf`;
      state.data.documents.push({
        id: documentId,
        siteId,
        folderId: folder.id,
        controlRun: true,
        name,
        fileType: "PDF",
        mimeType: "application/pdf",
        fileSize: bytes.length,
        uploadedAt: run.at,
        uploadedById: u.id,
        uploadedByName: u.name,
        uploadedBy: u.initials,
        uploadedByRole: u.role,
      });
      (state.data.controlRuns ??= []).push({ ...run, documentId });
      state.revision++;
      store.persist(state);
      store.audit(u, "control.run.completed", {
        siteId,
        id: run.id,
        documentId,
      });
      return visible(state, u);
    });
    json(res, 201, result);
  } catch (error) {
    if (written && !store.upload(written.documentId)) {
      try {
        fs.unlinkSync(written.file);
      } catch {}
    }
    throw error;
  }
  return true;
};
