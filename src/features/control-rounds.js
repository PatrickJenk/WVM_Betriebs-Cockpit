import {
  controlChoices,
  controlDateLabel,
  isRoundSection,
  roundPointLabel,
} from "../services/control-sheet.js";
import { isAdministrator } from "../auth/roles.js";

export function createControlRounds({
  data,
  user,
  site,
  show,
  modal,
  esc,
  options,
  render,
  toast,
  repository,
}) {
  const drafts = new Map();
  const configuration = (siteId) =>
    repository.call(
      "GET",
      "/api/sites/" + encodeURIComponent(siteId) + "/control-form",
    );
  const heading = (label) =>
    `<div class="modal-heading"><h2>${esc(label)}</h2><button type="button" class="close icon-button" aria-label="Schliessen">×</button></div>`;
  const field = (form, name) => form.elements.namedItem(name);
  const mark = '<span class="round-mark" aria-hidden="true"></span>';
  const choices = (cells) =>
    controlChoices
      .map(
        ([value, label]) =>
          `<td class="round-choice">${cells(value, label)}</td>`,
      )
      .join("");
  const table = (
    rows,
    editing = false,
    columns = [],
  ) => `<div class="round-table-scroll"><table class="round-table" ${columns.length ? `style="min-width:${450 + columns.length * 115}px"` : ""}>
    <colgroup><col>${columns.map(() => '<col class="round-extra-col">').join("")}<col class="round-choice-col"><col class="round-choice-col"><col class="round-comment-col"></colgroup>
    <thead><tr><th scope="col">Kontrollpunkt</th>${columns.map((label) => `<th scope="col" data-extra-heading>${esc(label || "Zusatzspalte")}</th>`).join("")}<th scope="col" class="round-choice">Ja</th><th scope="col" class="round-choice">Nein</th><th scope="col">${editing ? "Zeile bearbeiten" : "Bemerkung"}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  const paper = (title, siteName, body) =>
    `<div class="round-scroll"><article class="round-paper"><header><h3>${esc(title)}</h3><p>${esc(siteName)}</p></header>${body}</article></div>`;

  function openPaper(html) {
    show(html);
    modal.classList.add("control-round-dialog");
    modal.addEventListener(
      "close",
      () => {
        if (!modal.open) modal.classList.remove("control-round-dialog");
      },
      { once: true },
    );
  }

  function create(siteId) {
    let definition, start;
    try {
      ({ form: definition, start } = configuration(siteId));
      if (!definition || !start)
        throw Error(
          "Der Server muss für diese Kontrollblatt-Version neu gestartet werden.",
        );
    } catch (error) {
      toast(error.message);
      return;
    }
    const previous = drafts.get(siteId);
    const columns = definition.columns || [];
    const fixedColumns = definition.fixedColumns || [];
    let draft = previous?.userId === user.id ? previous : undefined;
    const changed = draft && draft.version !== definition.version;
    if (!draft || changed) {
      const oldRows = draft?.rows || [];
      draft = {
        userId: user.id,
        stamp: draft?.stamp || start,
        version: definition.version,
        roundType: definition.roundTypes.includes(draft?.roundType)
          ? draft.roundType
          : "",
        remarks: draft?.remarks || "",
        dirty: draft?.dirty || false,
        columns,
        rows: definition.effectivePoints
          .filter((point) => !isRoundSection(point))
          .map(roundPointLabel)
          .map((point, index) => {
            const old = oldRows[index];
            const samePoint = old?.point === point;
            return {
              point,
              status: samePoint ? old.status : "",
              comment: samePoint ? old.comment : "",
              cells: columns.map((label) =>
                samePoint ? old.cells[draft.columns.indexOf(label)] || "" : "",
              ),
            };
          }),
      };
      drafts.set(siteId, draft);
    }
    let answerIndex = 0;
    const rows = definition.effectivePoints
      .map((point) => {
        if (isRoundSection(point))
          return `<tr class="round-section"><th colspan="${4 + columns.length}">${esc(point.label)}</th></tr>`;
        const index = answerIndex++;
        const row = draft.rows[index];
        return `<tr><th scope="row">${esc(row.point)}</th>${columns
          .map((label, col) =>
            fixedColumns[col]
              ? `<td>${esc(point.cells?.[col] || "")}</td>`
              : `<td><input name="cell-${index}-${col}" aria-label="${esc(label + " – " + row.point)}" maxlength="150" value="${esc(row.cells[col])}"></td>`,
          )
          .join("")}${choices(
          (value, label) =>
            `<label class="round-choice-label"><input type="radio" name="status-${index}" value="${value}" aria-label="${esc(row.point + " – " + label)}" required ${row.status === value ? "checked" : ""}>${mark}</label>`,
        )}
      <td><textarea name="comment-${index}" aria-label="${esc("Bemerkung zu " + row.point)}" rows="2" maxlength="1500">${esc(row.comment)}</textarea></td></tr>`;
      })
      .join("");
    const type = definition.roundTypes.length
      ? `<label>Art des Kontrollrundgangs<select name="roundType" required>
      <option value="">Bitte auswählen</option>${options(definition.roundTypes, draft.roundType)}</select></label>`
      : "";
    openPaper(`<form id="control-round-form">${heading("Kontrollrundgang erfassen")}${paper(
      definition.title || "Kontrollblatt",
      site(siteId).name,
      `
      <div class="round-fields round-metadata">
        <dl class="round-facts"><dt>Datum und Uhrzeit</dt><dd>${esc(controlDateLabel(draft.stamp.date))} · ${esc(draft.stamp.time)} Uhr</dd></dl>
        <dl class="round-facts"><dt>Kontrollierende Person</dt><dd>${esc(user.name)}</dd></dl>
        ${type}
      </div>
      ${definition.example ? '<p class="muted">Kontrollpunkte aus der gemeinsamen Grundvorlage.</p>' : ""}
      ${table(rows, false, columns)}
      <label class="round-general">Allgemeine Bemerkungen<textarea name="remarks" rows="4" maxlength="3000">${esc(draft.remarks)}</textarea></label>`,
    )}
      <div class="modal-footer round-footer"><p data-round-status role="alert">${changed ? "Die Vorlage wurde aktualisiert. Bitte die Kontrollpunkte prüfen." : ""}</p><button class="primary" type="submit">Kontrollblatt speichern</button></div></form>`);
    const form = modal.querySelector("#control-round-form");
    const status = form.querySelector("[data-round-status]");
    function remember() {
      draft.roundType = field(form, "roundType")?.value || "";
      draft.remarks = field(form, "remarks").value;
      draft.rows.forEach((row, index) => {
        row.status = field(form, "status-" + index).value;
        row.comment = field(form, "comment-" + index).value;
        row.cells = columns.map(
          (_, col) => field(form, `cell-${index}-${col}`)?.value || "",
        );
      });
    }
    form.oninput = () => {
      remember();
      draft.dirty = true;
      status.textContent = "";
    };
    modal.querySelector(".close").onclick = () => {
      remember();
      modal.close();
      if (draft.dirty)
        toast("Entwurf bleibt bis zum Neuladen in diesem Tab erhalten.");
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      remember();
      try {
        repository.saveControlSheet(
          siteId,
          "submit",
          {
            id: draft.stamp.id,
            startToken: draft.stamp.startToken,
            version: draft.version,
            roundType: draft.roundType,
            answers: draft.rows,
            remarks: draft.remarks,
          },
          data,
        );
        drafts.delete(siteId);
        modal.close();
        render();
        toast("Kontrollblatt gespeichert und PDF unter «Dokumente» abgelegt.");
      } catch (error) {
        status.textContent = error.message;
      }
    };
  }

  function edit(siteId) {
    if (!isAdministrator(user)) return;
    let config;
    try {
      config = configuration(siteId);
      if (!config.form || !config.base)
        throw Error(
          "Der Server muss für diese Kontrollblatt-Version neu gestartet werden.",
        );
    } catch (error) {
      toast(error.message);
      return;
    }
    const folders = data.folders.filter(
      (folder) => folder.siteId === siteId && !folder.sectionId,
    );
    const folderName = (folder) => {
      const names = [folder.name];
      let parent = folders.find(
        (candidate) => candidate.id === folder.parentId,
      );
      while (parent) {
        names.unshift(parent.name);
        const id = parent.parentId;
        parent = folders.find((candidate) => candidate.id === id);
      }
      return names.join(" / ");
    };
    const folderOptions = [
      ["", "Kontrollrundgänge (Standard)"],
      ...folders.map((folder) => [folder.id, folderName(folder)]),
    ];
    const copies = new Map();
    let scope = "site";
    openPaper(`<form id="control-form-editor">${heading("Kontrollblatt-Vorlagen")}${paper(
      "Kontrollblatt",
      site(siteId).name,
      `
      <label>Vorlage<select name="scope"><option value="site">Diese Heizzentrale</option><option value="base">Gemeinsame Grundvorlage</option></select></label>
      <div data-template-fields></div>`,
    )}
      <div class="modal-footer round-footer"><p data-template-status role="status"></p><button class="primary" type="submit">Vorlage speichern</button></div></form>`);
    const form = modal.querySelector("#control-form-editor");
    const status = form.querySelector("[data-template-status]");
    const fields = form.querySelector("[data-template-fields]");
    const selectScope = field(form, "scope");
    const pointValues = () =>
      Array.from(form.querySelectorAll("[data-template-point]"), (input) => {
        if (input.dataset.templatePoint === "section")
          return { type: "section", label: input.value };
        const cells = Array.from(
          input.closest("tr").querySelectorAll("[data-template-cell]"),
          (cell) => cell.value,
        );
        return { type: "point", label: input.value, cells };
      });
    const columnValues = () =>
      Array.from(
        fields.querySelectorAll("[data-template-column]"),
        (input) => input.value,
      );
    const fixedValues = () =>
      Array.from(
        fields.querySelectorAll("[data-column-mode]"),
        (select) => select.value === "fixed",
      );
    const typeValues = () =>
      Array.from(
        form.querySelectorAll("[data-template-type]"),
        (input) => input.value,
      );
    const keepBase = () => field(form, "useBase")?.checked || false;
    const useTypes = () => field(form, "useTypes")?.checked || false;

    function renderPoints(points) {
      const columns = columnValues();
      const fixed = fixedValues();
      const span = 3 + columns.length;
      fields.querySelector("[data-fixed-base-note]").hidden =
        !keepBase() || !fixed.some(Boolean);
      const inherited = keepBase()
        ? config.base.points
            .map((point) =>
              isRoundSection(point)
                ? `<tr class="round-section"><th colspan="${span + 1}">${esc(point.label)}</th></tr>`
                : `<tr><th scope="row">${esc(roundPointLabel(point))}</th>${"<td></td>".repeat(columns.length)}${choices(() => mark)}<td class="muted">Grundvorlage</td></tr>`,
            )
            .join("")
        : "";
      const rows = points
        .map((point, index) => {
          const section = isRoundSection(point);
          const label = section ? "Abschnittstitel" : "Kontrollpunkt";
          const extraCells = section
            ? ""
            : columns
                .map(
                  (column, col) =>
                    `<td><input ${fixed[col] ? 'type="text"' : 'type="hidden"'} data-template-cell aria-label="${esc((column || "Zusatzspalte") + " – Kontrollpunkt " + (index + 1))}" maxlength="150" value="${esc(point.cells?.[col] || "")}"></td>`,
                )
                .join("");
          return `<tr class="${section ? "round-section" : ""}"><td ${section ? `colspan="${span}"` : ""}><textarea data-template-point="${section ? "section" : "check"}" aria-label="${label} ${index + 1}" placeholder="${label}" rows="${section ? 1 : 2}" maxlength="240" required>${esc(roundPointLabel(point))}</textarea></td>
        ${extraCells}${section ? "" : choices(() => mark)}<td><div class="round-point-actions">
        <button type="button" class="secondary" data-point-action="up" data-index="${index}" aria-label="Kontrollpunkt nach oben" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="secondary" data-point-action="down" data-index="${index}" aria-label="Kontrollpunkt nach unten" ${index === points.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="secondary round-remove-point" data-point-action="remove" data-index="${index}" ${!keepBase() && !section && points.filter((point) => !isRoundSection(point)).length === 1 ? "disabled" : ""}>Entfernen</button></div></td></tr>`;
        })
        .join("");
      fields.querySelector("[data-template-rows]").innerHTML = table(
        inherited + rows,
        true,
        columns,
      );
      for (const button of fields.querySelectorAll("[data-point-action^=add]"))
        button.disabled = points.length >= 50;
    }

    function renderColumns(columns, fixed) {
      fields.querySelector("[data-column-rows]").innerHTML = columns
        .map(
          (label, index) =>
            `<div class="round-type-row round-column-row"><input data-template-column aria-label="Zusatzspalte ${index + 1}" placeholder="Spaltenname" value="${esc(label)}" maxlength="40" required><select data-column-mode aria-label="Eingabeart der Zusatzspalte ${index + 1}"><option value="fixed" ${fixed[index] ? "selected" : ""}>Fixtext in Vorlage</option><option value="round" ${fixed[index] ? "" : "selected"}>Eingabe im Rundgang</option></select><button type="button" class="secondary" data-column-remove="${index}">Entfernen</button></div>`,
        )
        .join("");
      fields.querySelector("[data-column-add]").disabled = columns.length >= 4;
    }

    function renderTypes(types) {
      const wrapper = fields.querySelector("[data-types]");
      wrapper.hidden = !useTypes();
      wrapper.querySelector("[data-type-rows]").innerHTML = types
        .map(
          (type, index) =>
            `<div class="round-type-row"><input data-template-type aria-label="Rundgangsart ${index + 1}" value="${esc(type)}" maxlength="100" ${useTypes() ? "required" : "disabled"}><button type="button" class="secondary" data-type-remove="${index}" ${types.length === 1 ? "disabled" : ""}>Entfernen</button></div>`,
        )
        .join("");
      wrapper.querySelector("[data-type-add]").disabled = types.length >= 30;
    }

    function showFields() {
      const current =
        copies.get(scope) || (scope === "base" ? config.base : config.form);
      fields.innerHTML = `${
        scope === "site"
          ? `<div class="round-template-options">
        <label>Titel des Kontrollblatts<input name="title" maxlength="100" value="${esc(current.title || "")}"></label>
        <label>Ablageordner für PDFs<select name="folderId">${options(folderOptions, current.folderId)}</select></label>
        <label class="check-label"><input type="checkbox" name="useBase" ${current.useBase ? "checked" : ""}> Gemeinsame Grundvorlage verwenden</label>
        <label class="check-label"><input type="checkbox" name="useTypes" ${(current.useTypes ?? !!current.roundTypes?.length) ? "checked" : ""}> Rundgangsart abfragen</label>
        <div data-types><div data-type-rows></div><button type="button" class="secondary" data-type-add>+ Auswahlwert ergänzen</button></div>
        <div><div data-column-rows></div><button type="button" class="secondary" data-column-add>+ Zusatzspalte ergänzen</button></div></div>`
          : '<p class="muted">Diese Punkte gelten für alle Heizzentralen, die die Grundvorlage verwenden.</p>'
      }
        <p class="muted" data-fixed-base-note hidden>Für Fixtexte bei übernommenen Kontrollpunkten zuerst «Gemeinsame Grundvorlage verwenden» abwählen.</p>
        <div data-template-rows></div><div class="round-point-actions"><button type="button" class="secondary round-add-point" data-point-action="add">+ Kontrollpunkt ergänzen</button>
        <button type="button" class="secondary round-add-point" data-point-action="add-section">+ Abschnittstitel ergänzen</button></div>`;
      if (scope === "site") {
        renderColumns(current.columns || [], current.fixedColumns || []);
        renderTypes(current.roundTypes?.length ? current.roundTypes : [""]);
      }
      renderPoints(current.points);
    }
    showFields();

    fields.oninput = (event) => {
      if (!event.target.matches("[data-template-column]")) return;
      const inputs = Array.from(
        fields.querySelectorAll("[data-template-column]"),
      );
      const col = inputs.indexOf(event.target);
      const label = event.target.value || "Zusatzspalte";
      fields.querySelectorAll("[data-extra-heading]")[col].textContent = label;
      fields.querySelectorAll("tr:has([data-template-cell])").forEach((row) => {
        const point = row.querySelector("[data-template-point]");
        row
          .querySelectorAll("[data-template-cell]")
          [col].setAttribute(
            "aria-label",
            label + " – " + point.getAttribute("aria-label"),
          );
      });
    };
    fields.onchange = (event) => {
      if (event.target.matches("[data-column-mode]"))
        renderPoints(pointValues());
      if (event.target.name === "useTypes") renderTypes(typeValues());
      if (event.target.name === "useBase") {
        const points = pointValues();
        const next = keepBase()
          ? points.filter(
              (point) =>
                point.cells?.some(Boolean) ||
                !config.base.points.some(
                  (base) =>
                    isRoundSection(base) === isRoundSection(point) &&
                    roundPointLabel(base) === roundPointLabel(point),
                ),
            )
          : [...config.base.points, ...points];
        if (next.length > 50 && !keepBase()) {
          event.target.checked = true;
          status.textContent =
            "Die eigene Liste kann höchstens 50 Kontrollpunkte enthalten.";
        } else {
          renderPoints(next);
          status.textContent = "";
        }
      }
    };
    fields.onclick = (event) => {
      if (event.target.closest("[data-column-add], [data-column-remove]")) {
        const columns = columnValues();
        const fixed = fixedValues();
        const points = pointValues();
        const remove = event.target.closest("[data-column-remove]");
        if (remove) {
          const index = Number(remove.dataset.columnRemove);
          columns.splice(index, 1);
          fixed.splice(index, 1);
          for (const point of points) point.cells?.splice(index, 1);
        } else {
          columns.push("");
          fixed.push(true);
        }
        renderColumns(columns, fixed);
        renderPoints(points);
        if (!remove)
          fields
            .querySelectorAll("[data-template-column]")
            [columns.length - 1].focus();
        return;
      }
      if (event.target.closest("[data-type-add], [data-type-remove]")) {
        const types = typeValues();
        const remove = event.target.closest("[data-type-remove]");
        if (remove) types.splice(Number(remove.dataset.typeRemove), 1);
        else types.push("");
        renderTypes(types);
        if (!remove)
          fields
            .querySelectorAll("[data-template-type]")
            [types.length - 1].focus();
        return;
      }
      const action = event.target.closest("[data-point-action]");
      if (!action) return;
      const points = pointValues();
      const index = Number(action.dataset.index);
      const type = action.dataset.pointAction;
      if (type === "add") points.push("");
      else if (type === "add-section")
        points.push({ type: "section", label: "" });
      else if (type === "remove") points.splice(index, 1);
      else {
        const next = index + (type === "up" ? -1 : 1);
        [points[index], points[next]] = [points[next], points[index]];
      }
      renderPoints(points);
      if (type.startsWith("add"))
        fields
          .querySelectorAll("[data-template-point]")
          [points.length - 1].focus();
    };
    function editorValues() {
      const points = pointValues();
      if (scope === "base") return { points };
      return {
        points,
        title: field(form, "title").value,
        columns: columnValues(),
        fixedColumns: fixedValues(),
        folderId: field(form, "folderId").value,
        useBase: keepBase(),
        useTypes: useTypes(),
        roundTypes: typeValues(),
      };
    }
    selectScope.onchange = (event) => {
      copies.set(scope, editorValues());
      scope = event.target.value;
      status.textContent = "";
      showFields();
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const current = editorValues();
      try {
        repository.saveControlSheet(
          siteId,
          "form",
          {
            scope,
            version: (scope === "base" ? config.base : config.form).version,
            ...current,
            roundTypes: current.useTypes ? current.roundTypes : [],
            points: current.points.map((point) => {
              const label = roundPointLabel(point)
                .trim()
                .replace(/\s*[\r\n]+\s*/g, " ");
              return isRoundSection(point) || point.cells?.some(Boolean)
                ? { ...point, label }
                : label;
            }),
          },
          data,
        );
        config = configuration(siteId);
        copies.delete(scope);
        showFields();
        status.textContent = "Vorlage gespeichert.";
      } catch (error) {
        status.textContent = error.message;
      }
    };
  }

  return { create, edit, clear: () => drafts.clear() };
}
