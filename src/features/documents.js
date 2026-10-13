import { isAdministrator } from "../auth/accounts.js";
import { uuid } from "../services/ids.js";
// Explorer: Ordner, direkte Uploads, Vorschau und Dateiverwaltung.
export function createDocuments(context) {
  const {
    data,
    user,
    $,
    esc,
    icon,
    fmt,
    site,
    show,
    modal,
    save,
    render,
    toast,
    putFile,
    getFile,
    deleteFile,
    getState,
    getAdmin,
  } = context;
  const canDelete = (d) =>
    isAdministrator(user) ||
    (!["Admin", "Administrator"].includes(d.uploadedByRole) &&
      d.uploadedById !== "admin" &&
      d.uploadedByName !== "WVM-admin" &&
      d.uploadedBy !== "ADM" &&
      (d.uploadedById
        ? d.uploadedById === user.id
        : d.uploadedBy === user.initials));
  let uploading = false;
  const folderAt = (sid, id) =>
    data.folders.find((f) => f.siteId === sid && f.id === id);
  const size = (n) =>
    n < 1024 * 1024
      ? (n / 1024).toFixed(1) + " KB"
      : (n / 1024 / 1024).toFixed(1) + " MB";
  function documentsView() {
    const { current, filters, tab = "docs" } = getState(),
      admin = getAdmin(),
      folder = folderAt(current, filters.folder);
    const searching = !!filters.search,
      query = (filters.search || "").toLowerCase();
    const docs = data.documents
      .filter(
        (d) =>
          d.siteId === current &&
          (searching
            ? data.folders.some(
                (f) => f.id === d.folderId && (f.sectionId || "docs") === tab,
              )
            : folder
              ? d.folderId === folder.id
              : !d.folderId && tab === "docs") &&
          (!query || d.name.toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const children = data.folders
      .filter(
        (f) =>
          f.siteId === current &&
          (f.sectionId || "docs") === tab &&
          (searching
            ? f.name.toLowerCase().includes(query)
            : (f.parentId || null) === (folder?.id || null)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const chain = [];
    let ancestor = folder;
    while (ancestor && !chain.some((f) => f.id === ancestor.id)) {
      chain.unshift(ancestor);
      ancestor = folderAt(current, ancestor.parentId);
    }
    return `<div class="panel-heading"><div><h2>Dokumentenablage</h2><p>Ordner öffnen, Dateien ablegen und per Doppelklick ansehen.</p></div><button class="primary" id="upload" ${folder ? "" : "disabled"}>${icon("upload")} Dateien hochladen</button></div><div class="search-row document-search"><label class="search">${icon("search")}<input id="doc-search" placeholder="Dateien und Ordner durchsuchen" aria-label="Dokumente durchsuchen" value="${esc(filters.search || "")}"></label></div><div class="file-explorer">${admin.folderView(current, filters.folder)}<div class="explorer-main"><nav class="explorer-breadcrumb" aria-label="Ordnerpfad"><button data-open-folder="all">${esc(site(current).name)}</button>${chain.map((f) => `<span>/</span><button data-open-folder="${esc(f.id)}">${esc(f.name)}</button>`).join("")}</nav><div class="explorer-folder-grid">${children.map((f) => `<button class="explorer-folder" data-open-folder="${esc(f.id)}" data-drop-folder="${esc(f.id)}"><span aria-hidden="true">📁</span><b>${esc(f.name)}</b><small>${data.documents.filter((d) => d.folderId === f.id).length} Dateien</small></button>`).join("")}</div>${folder ? `<div class="dropzone" id="dropzone" data-drop-folder="${esc(folder.id)}">${icon("upload")}<div><b>Dateien hier ablegen</b><p>${esc(admin.folderLabel(folder.id))} · Dateien werden direkt gespeichert</p></div></div>` : '<p class="folder-upload-hint">Dateien direkt auf einen Ordner ziehen oder einen Ordner zum Hochladen öffnen.</p>'}<div id="doc-rows">${docs.length ? `<div class="table-scroll"><table class="explorer-files"><thead><tr><th>NAME</th><th>ORDNER</th><th>TYP / GRÖSSE</th><th>ABGELEGT VON / DATUM</th><th>AKTIONEN</th></tr></thead><tbody>${docs.map((d) => `<tr draggable="${canDelete(d)}" ${canDelete(d) ? `data-drag-document="${esc(d.id)}"` : ""} data-open-document="${esc(d.id)}"><td><button class="doc-name" data-preview="${esc(d.id)}">${icon("file")}${esc(d.name)}</button></td><td>${esc(admin.folderLabel(d.folderId))}</td><td>${esc(d.fileType || "Datei")}<small>${size(d.fileSize)}</small></td><td><b>${esc(d.uploadedByName || data.users.find((u) => u.initials === d.uploadedBy)?.name || d.uploadedBy)}</b><small>${fmt(d.uploadedAt)}</small></td><td><div class="doc-actions"><button data-download="${esc(d.id)}">Download</button>${canDelete(d) ? `<button data-rename="${esc(d.id)}">Umbenennen / Verschieben</button><button data-delete="${esc(d.id)}" class="danger">Löschen</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><h3>Keine Dateien in dieser Ansicht</h3><p>Dateien auf einen Ordner oder die Ablagefläche ziehen.</p></div>'}</div></div></div>`;
  }
  function bindDocs() {
    const { current, filters } = getState();
    const choose = (id) => {
      filters.folder = id;
      filters.search = "";
      render();
    };
    getAdmin().bindFolders(current, choose);
    $("#upload").onclick = () => uploadForm();
    document
      .querySelectorAll("[data-open-folder]")
      .forEach((b) => (b.onclick = () => choose(b.dataset.openFolder)));
    document.querySelectorAll("[data-drag-document]").forEach((row) => {
      row.ondragstart = (event) => {
        const entry = data.documents.find(
          (d) => d.id === row.dataset.dragDocument,
        );
        if (!entry || !canDelete(entry)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData(
          "application/x-cockpit-document",
          row.dataset.dragDocument,
        );
        event.dataTransfer.effectAllowed = "move";
      };
      row.ondblclick = () => preview(row.dataset.openDocument);
    });
    const targets = [
      ...document.querySelectorAll("[data-drop-folder]"),
      ...document.querySelectorAll("[data-folder]"),
    ].filter((b) =>
      folderAt(current, b.dataset.dropFolder || b.dataset.folder),
    );
    targets.forEach((target) => {
      const id = target.dataset.dropFolder || target.dataset.folder;
      target.ondragover = (event) => {
        event.preventDefault();
        event.stopPropagation();
        target.classList.add("drag");
      };
      target.ondragleave = () => target.classList.remove("drag");
      target.ondrop = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        target.classList.remove("drag");
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length) return storeFiles(files, id, current);
        const documentId = event.dataTransfer.getData(
          "application/x-cockpit-document",
        );
        const entry = data.documents.find(
          (d) => d.id === documentId && d.siteId === current,
        );
        if (!entry || !user.id || !canDelete(entry)) return;
        const previous = entry.folderId;
        entry.folderId = id;
        if (!save()) {
          entry.folderId = previous;
          return;
        }
        render();
        toast("Datei verschoben.");
      };
    });
    $("#doc-search").oninput = (event) => {
      filters.search = event.target.value;
      const position = event.target.selectionStart;
      render();
      $("#doc-search").focus();
      $("#doc-search").setSelectionRange(position, position);
    };
    document
      .querySelectorAll("[data-download]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            download(
              b.dataset.download,
              data.documents.find((d) => d.id === b.dataset.download).name,
            )),
      );
    document
      .querySelectorAll("[data-preview]")
      .forEach((b) => (b.onclick = () => preview(b.dataset.preview)));
    document
      .querySelectorAll("[data-rename]")
      .forEach((b) => (b.onclick = () => editDocument(b.dataset.rename)));
    document
      .querySelectorAll("[data-delete]")
      .forEach((b) => (b.onclick = () => removeDocument(b.dataset.delete)));
  }
  function uploadForm() {
    const { current, filters } = getState();
    if (!user.id || !folderAt(current, filters.folder)) {
      toast("Bitte zuerst einen Ordner auswählen.");
      return;
    }
    const targetFolder = filters.folder,
      uploadSite = current;
    show(
      `<form id="upload-form"><div class="modal-heading"><h2>Dateien hochladen</h2><button type="button" class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><label>Dateien<input name="files" type="file" multiple required></label><p><b>Ordner:</b> ${esc(getAdmin().folderLabel(targetFolder))}</p><p>${esc(site(current).name)} · Abgelegt von ${esc(user.name)}</p></div><div class="modal-footer"><button type="submit" class="primary">Hochladen</button></div></form>`,
    );
    $("#upload-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector("[type=submit]");
      button.disabled = true;
      const success = await storeFiles(
        Array.from(form.elements.files.files),
        targetFolder,
        uploadSite,
      );
      if (success) modal.close();
      else button.disabled = false;
    };
  }
  async function storeFiles(files, targetFolder, uploadSite) {
    if (!user.id || !folderAt(uploadSite, targetFolder) || !files.length)
      return false;
    if (uploading) {
      toast("Bitte den laufenden Upload abwarten.");
      return false;
    }
    uploading = true;
    const uploader = { initials: user.initials, name: user.name, id: user.id },
      added = [],
      stored = [];
    try {
      toast("Dateien werden gespeichert …");
      for (const file of files) {
        const id = uuid();
        await putFile(id, file);
        stored.push(id);
        added.push({
          id,
          siteId: uploadSite,
          name: file.name,
          folderId: targetFolder,
          category: "Sonstiges",
          fileType: file.name.includes(".")
            ? file.name.split(".").pop().toUpperCase()
            : "Datei",
          mimeType: file.type,
          fileSize: file.size,
          uploadedBy: uploader.initials,
          uploadedByName: uploader.name,
          uploadedById: uploader.id,
          uploadedByRole: user.role,
          uploadedAt: new Date().toISOString(),
          fileUrl: "indexeddb:" + id,
        });
      }
      data.documents.push(...added);
      if (!save()) throw Error("Metadata could not be saved");
      render();
      toast(files.length + " Dateien gespeichert.");
      return true;
    } catch (error) {
      data.documents = data.documents.filter(
        (d) => !added.some((a) => a.id === d.id),
      );
      await Promise.allSettled(stored.map((id) => deleteFile(id)));
      toast(
        error.message ||
          "Upload fehlgeschlagen. Bitte Server und Dateizugriff prüfen.",
      );
      return false;
    } finally {
      uploading = false;
    }
  }
  async function download(id, name) {
    try {
      const file = await getFile(id);
      if (!file) throw Error();
      const url = URL.createObjectURL(file),
        link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast("Datei in diesem Browser nicht verfügbar.");
    }
  }
  async function preview(id) {
    const entry = data.documents.find((d) => d.id === id);
    if (!entry) return;
    try {
      const file = await getFile(id);
      if (!file) throw Error();
      const url = URL.createObjectURL(file);
      show(
        `<div class="modal-heading"><h2>${esc(entry.name)}</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body">${file.type.startsWith("image/") ? `<img class="preview-image" src="${url}" alt="${esc(entry.name)}">` : file.type === "application/pdf" ? `<iframe class="pdf-preview" src="${url}" title="${esc(entry.name)}"></iframe>` : "<p>Diese Datei kann heruntergeladen und mit dem passenden Programm geöffnet werden.</p>"}</div><div class="modal-footer"><button id="preview-download" class="primary">Herunterladen</button></div>`,
      );
      $("#preview-download").onclick = () => download(id, entry.name);
      modal.addEventListener("close", () => URL.revokeObjectURL(url), {
        once: true,
      });
    } catch {
      toast("Datei in diesem Browser nicht verfügbar.");
    }
  }
  function editDocument(id) {
    const { current } = getState(),
      entry = data.documents.find((d) => d.id === id && d.siteId === current);
    if (!entry || !user.id || !canDelete(entry)) return;
    show(
      `<form id="doc-edit"><div class="modal-heading"><h2>Umbenennen / Verschieben</h2><button type="button" class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><label>Dateiname<input name="name" value="${esc(entry.name)}" required></label><label>Ordner<select name="folderId" required>${getAdmin().folderOptions(current, entry.folderId)}</select></label></div><div class="modal-footer"><button class="primary">Speichern</button></div></form>`,
    );
    $("#doc-edit").onsubmit = (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        name = form.elements.name.value.trim(),
        folderId = form.elements.folderId.value;
      if (!name || !folderAt(current, folderId)) return;
      const old = { ...entry };
      Object.assign(entry, { name, folderId });
      if (!save()) {
        Object.assign(entry, old);
        return;
      }
      modal.close();
      render();
      toast("Datei aktualisiert.");
    };
  }
  function removeDocument(id) {
    const { current } = getState(),
      entry = data.documents.find((d) => d.id === id && d.siteId === current);
    if (!entry || !user.id || !canDelete(entry)) return;
    show(
      `<div class="modal-heading"><h2>Datei löschen?</h2><button class="close icon-button" aria-label="Schliessen">✕</button></div><div class="form-body"><p>«${esc(entry.name)}» wird aus der Ablage entfernt.</p></div><div class="modal-footer"><button id="cancel-delete" class="secondary">Abbrechen</button><button id="confirm-delete" class="danger-button">Datei löschen</button></div>`,
    );
    $("#cancel-delete").onclick = () => modal.close();
    $("#confirm-delete").onclick = async () => {
      if (!canDelete(entry)) return;
      const old = data.documents;
      data.documents = data.documents.filter((d) => d.id !== id);
      if (!save()) {
        data.documents = old;
        return;
      }
      try {
        await deleteFile(id);
      } catch {}
      modal.close();
      render();
      toast("Datei gelöscht.");
    };
  }
  return { documentsView, bindDocs, download };
}
