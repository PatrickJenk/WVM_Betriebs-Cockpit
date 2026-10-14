import { uuid } from "../services/ids.js";
// Nur Administratoren: Anlagen und Dokumentordner verwalten.
export function createAdministration({
  data,
  user,
  esc,
  options,
  show,
  modal,
  save,
  render,
  toast,
  getState,
}) {
  const isAdmin = () => ["Admin", "Administrator"].includes(user.role),
    folders = (sid) =>
      data.folders.filter(
        (f) =>
          f.siteId === sid &&
          (f.sectionId || "docs") === (getState?.().tab || "docs"),
      );
  const expanded = new Set();
  function path(id) {
    const f = data.folders.find((f) => f.id === id);
    return f
      ? (f.parentId ? path(f.parentId) + " / " : "") + f.name
      : "Ohne Ordner";
  }
  function descendants(id) {
    return data.folders
      .filter((f) => f.parentId === id)
      .flatMap((f) => [f.id, ...descendants(f.id)]);
  }
  function commit(action, message) {
    if (!isAdmin()) return false;
    const before = structuredClone(data);
    action();
    if (!save()) {
      Object.assign(data, before);
      const error = document.querySelector("#admin-error, #plant-error");
      if (error)
        error.textContent =
          "Speichern fehlgeschlagen. Bitte Eingaben prüfen. Bei gleichzeitigen Änderungen Eingaben sichern und die Ansicht neu laden.";
      return false;
    }
    render();
    toast(message);
    return true;
  }
  function folderForm(sid, id, parentId = null) {
    if (!isAdmin()) return;
    const folder = data.folders.find((f) => f.id === id),
      exclude = id ? [id, ...descendants(id)] : [];
    show(
      `<form id="folder-form"><div class="modal-heading"><h2>${folder ? "Ordner bearbeiten" : "Neuer Ordner"}</h2><button type="button" class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p class="management-hint">Ein Ordner gliedert diesen Dokumentbereich. Zum Verschieben wählst du einen anderen übergeordneten Ordner. Enthaltene Dateien bleiben zugeordnet.</p><label>Ordnername<input name="folderName" required maxlength="100" value="${esc(folder?.name || "")}"></label><label>Übergeordneter Ordner<select name="parentId"><option value="">Dokumentenablage</option>${options(
        folders(sid)
          .filter((f) => !exclude.includes(f.id))
          .map((f) => [f.id, path(f.id)]),
        folder?.parentId || parentId,
      )}</select></label><p id="admin-error" role="alert"></p></div><div class="modal-footer"><button type="button" class="secondary" id="folder-cancel-edit">Abbrechen</button><button class="primary">Speichern</button></div></form>`,
    );
    document.querySelector("#folder-cancel-edit").onclick = () => modal.close();
    document.querySelector("#folder-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.currentTarget,
        name = f.elements.folderName.value.trim(),
        parent = f.elements.parentId.value || null;
      if (!name) return;
      if (
        folders(sid).some(
          (x) =>
            x.id !== id &&
            x.parentId === parent &&
            x.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        document.querySelector("#admin-error").textContent =
          "Dieser Ordnername ist hier bereits vorhanden.";
        return;
      }
      if (
        commit(() => {
          if (folder)
            Object.assign(
              data.folders.find((f) => f.id === id),
              { name, parentId: parent },
            );
          else
            data.folders.push({
              id: uuid(),
              siteId: sid,
              sectionId: getState?.().tab === "docs" ? null : getState?.().tab,
              name,
              parentId: parent,
            });
        }, "Ordner gespeichert.")
      )
        modal.close();
    };
  }
  function deleteFolder(id) {
    if (!isAdmin()) return;
    const f = data.folders.find((f) => f.id === id),
      children = descendants(id);
    if (!f) return;
    const documentCount = data.documents.filter((d) =>
      [id, ...children].includes(d.folderId),
    ).length;
    show(
      `<div class="modal-heading"><h2>Ordner löschen?</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>«${esc(f.name)}», ${children.length} Unterordner und ${documentCount} Dokumente werden dauerhaft gelöscht. Bitte benötigte Dokumente vorher verschieben.</p></div><div class="modal-footer"><button class="secondary" id="folder-cancel">Abbrechen</button><button class="danger-button" id="folder-delete">Endgültig löschen</button></div>`,
    );
    document.querySelector("#folder-cancel").onclick = () => modal.close();
    document.querySelector("#folder-delete").onclick = () => {
      if (
        commit(() => {
          const ids = [id, ...children];
          data.documents = data.documents.filter(
            (d) => !ids.includes(d.folderId),
          );
          data.folders = data.folders.filter((x) => !ids.includes(x.id));
        }, "Ordner und enthaltene Dokumente gelöscht.")
      )
        modal.close();
    };
  }
  function plantForm(sid) {
    if (!isAdmin()) return;
    show(
      `<div class="modal-heading"><div><h2>Anlagen verwalten</h2><p>${esc(data.structure?.sites?.find(s => s.id === sid)?.name || "Standort")}</p><p>Nur aktive Anlagen stehen für neue Einträge zur Auswahl.</p></div><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><form id="plant-add" class="plant-add"><label>Anlagenname<input name="plantName" placeholder="Zum Beispiel: Holzkessel 1" required maxlength="100"></label><button class="primary">Hinzufügen</button></form><div class="plant-list">${data.plants
        .filter((p) => p.siteId === sid && !p.deleted)
        .map(
          (p) =>
            `<form class="plant-row" data-plant="${p.id}"><input name="plantName" aria-label="Anlagenname" value="${esc(p.name)}" required maxlength="100"><label class="check-label"><input name="active" type="checkbox" ${p.active ? "checked" : ""}> Aktiv</label><button class="secondary">Speichern</button><button type="button" class="danger plant-delete" data-delete-plant="${p.id}">Löschen</button></form>`,
        )
        .join(
          "",
        )}</div><p class="muted">Deaktivierte Anlagen bleiben in bestehenden Logbucheinträgen erhalten.</p><p id="plant-error" role="alert"></p></div>`,
    );
    const update = (form, id) => {
      const name = form.elements.plantName.value.trim();
      if (!name) return;
      if (
        data.plants.some(
          (p) =>
            p.siteId === sid &&
            !p.deleted &&
            p.id !== id &&
            p.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        document.querySelector("#plant-error").textContent =
          "Eine Anlage mit diesem Namen ist bereits vorhanden.";
        return;
      }
      if (
        commit(() => {
          if (id) {
            const p = data.plants.find((p) => p.id === id);
            p.name = name;
            p.active = form.elements.active.checked;
          } else
            data.plants.push({
              id: uuid(),
              siteId: sid,
              name,
              active: true,
            });
        }, "Anlage gespeichert.")
      ) {
        modal.close();
        plantForm(sid);
      }
    };
    document
      .querySelectorAll("[data-delete-plant]")
      .forEach(
        (b) => (b.onclick = () => deletePlant(sid, b.dataset.deletePlant)),
      );
    document.querySelector("#plant-add").onsubmit = (e) => {
      e.preventDefault();
      update(e.currentTarget);
    };
    document.querySelectorAll(".plant-row").forEach(
      (f) =>
        (f.onsubmit = (e) => {
          e.preventDefault();
          update(f, f.dataset.plant);
        }),
    );
  }
  function deletePlant(sid, id) {
    if (!isAdmin()) return;
    const p = data.plants.find((p) => p.id === id);
    show(
      `<div class="modal-heading"><h2>Anlage löschen?</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>«${esc(p.name)}» wird aus der Anlagenverwaltung entfernt. Bestehende Logbucheinträge behalten ihre Zuordnung.</p></div><div class="modal-footer"><button class="secondary" id="plant-cancel">Abbrechen</button><button class="danger-button" id="plant-confirm">Anlage löschen</button></div>`,
    );
    document.querySelector("#plant-cancel").onclick = () => {
      modal.close();
      plantForm(sid);
    };
    document.querySelector("#plant-confirm").onclick = () => {
      if (
        commit(() => {
          Object.assign(
            data.plants.find((p) => p.id === id),
            { deleted: true, active: false },
          );
        }, "Anlage gelöscht.")
      ) {
        modal.close();
        plantForm(sid);
      }
    };
  }
  return {
    folderForm,
    deleteFolder,
    plants: plantForm,
    folderLabel: path,
    folderOptions(sid, selected) {
      return (
        '<option value="">Ordner auswählen</option>' +
        options(
          folders(sid)
            .sort((a, b) => path(a.id).localeCompare(path(b.id), "de"))
            .map((f) => [f.id, path(f.id)]),
          selected,
        )
      );
    },
    matchesFolder(d, id) {
      return (
        !id ||
        id === "all" ||
        (id === "unfiled"
          ? !d.folderId
          : d.folderId === id || descendants(id).includes(d.folderId))
      );
    },
    folderView(sid, selected) {
      if (
        selected &&
        !["all", "unfiled"].includes(selected) &&
        !folders(sid).some((f) => f.id === selected)
      )
        selected = "all";
      const tree = (parent = null, depth = 0) =>
        folders(sid)
          .filter((f) => f.parentId === parent)
          .sort((a, b) => a.name.localeCompare(b.name, "de"))
          .map(
            (f) =>
              `<details class="folder-branch" data-folder-branch="${esc(f.id)}" ${expanded.has(f.id) ? "open" : ""}><summary><div class="folder-item" style="--depth:${depth}"><button class="folder-link ${selected === f.id ? "selected" : ""}" data-folder="${f.id}"><span aria-hidden="true">▱</span>${esc(f.name)}</button>${isAdmin() ? `<button class="folder-edit" data-edit-folder="${f.id}" title="Ordner bearbeiten" aria-label="Ordner bearbeiten: ${esc(f.name)}">✎</button><button class="folder-edit" data-delete-folder="${f.id}" title="Ordner löschen" aria-label="Ordner löschen: ${esc(f.name)}">×</button>` : ""}</div></summary>${tree(f.id, depth + 1)}</details>`,
          )
          .join("");
      return `<div class="folder-section"><div class="folder-heading"><h3>Ordnerstruktur</h3>${isAdmin() ? '<button class="secondary" id="new-folder">+ Neuer Ordner</button>' : ""}</div><div class="folder-tree"><button class="folder-link ${!selected || selected === "all" ? "selected" : ""}" data-folder="all">Dokumentenablage</button>${tree()}</div>${!folders(sid).length ? '<p class="muted">Lege Ordner und Unterordner für diese Zentrale an.</p>' : ""}</div>`;
    },
    bindFolders(sid, choose) {
      document.querySelectorAll("[data-folder-branch]").forEach(
        (b) =>
          (b.ontoggle = () => {
            if (b.open) expanded.add(b.dataset.folderBranch);
            else expanded.delete(b.dataset.folderBranch);
          }),
      );
      document
        .querySelectorAll("[data-folder]")
        .forEach((b) => (b.onclick = () => choose(b.dataset.folder)));
      if (isAdmin()) {
        document.querySelector("#new-folder").onclick = () => {
          const selected = document.querySelector(".folder-link.selected")
            ?.dataset.folder;
          folderForm(
            sid,
            null,
            folders(sid).some((f) => f.id === selected) ? selected : null,
          );
        };
        document
          .querySelectorAll("[data-edit-folder]")
          .forEach(
            (b) => (b.onclick = () => folderForm(sid, b.dataset.editFolder)),
          );
        document
          .querySelectorAll("[data-delete-folder]")
          .forEach(
            (b) => (b.onclick = () => deleteFolder(b.dataset.deleteFolder)),
          );
      }
    },
  };
}
