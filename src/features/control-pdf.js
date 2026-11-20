import {
  AnnotationEditorType,
  AnnotationMode,
  GlobalWorkerOptions,
  getDocument,
} from "/vendor/pdfjs/build/pdf.mjs";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "/vendor/pdfjs/web/pdf_viewer.mjs";
import { controlPoint } from "../services/control-sheet.js";

const assets = "/vendor/pdfjs/";
GlobalWorkerOptions.workerSrc = assets + "build/pdf.worker.mjs";
let stylesheet;

function loadStyles() {
  return (stylesheet ??= new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = assets + "web/pdf_viewer.css";
    link.onload = resolve;
    link.onerror = () => {
      link.remove();
      stylesheet = undefined;
      reject(Error("Der PDF-Viewer konnte nicht geladen werden."));
    };
    document.head.append(link);
  }));
}

export async function openControlPdf(
  container,
  url,
  headers,
  template,
  signal,
) {
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    const result = await response.json();
    throw Error(
      result.error || "Das Kontrollblatt konnte nicht geöffnet werden.",
    );
  }
  if (response.headers.get("X-Cockpit-Template-Version") !== template.version)
    throw Error("Die Vorlage wurde geändert. Bitte die Seite neu laden.");
  const bytes = await response.arrayBuffer();
  await loadStyles();
  signal.throwIfAborted();
  const loading = getDocument({
    data: bytes,
    cMapUrl: assets + "cmaps/",
    standardFontDataUrl: assets + "standard_fonts/",
    wasmUrl: assets + "wasm/",
    useWasm: false,
    enableXfa: false,
  });
  let viewer, documentPdf;
  const close = () => {
    viewer?.setDocument(null);
    loading.destroy().catch(() => {});
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    documentPdf = await loading.promise;
    const fields = (await documentPdf.getFieldObjects()) || new Map();
    const editableTypes = [
      "checkbox",
      "radiobutton",
      "text",
      "combobox",
      "listbox",
    ];
    const editable = [...fields.values()]
      .flat()
      .filter(
        (field) =>
          field.editable && !field.hidden && editableTypes.includes(field.type),
      );
    if (!editable.length)
      throw Error(
        "Dieses PDF hat keine ausfüllbaren Felder. Ein Admin kann ein ausfüllbares PDF auswählen oder eines im Cockpit erstellen.",
      );
    signal.throwIfAborted();
    const eventBus = new EventBus();
    const links = new PDFLinkService({ eventBus });
    links.externalLinkEnabled = false;
    viewer = new PDFViewer({
      container,
      eventBus,
      linkService: links,
      abortSignal: signal,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: AnnotationEditorType.DISABLE,
      enableAutoLinking: false,
      imageResourcesPath: assets + "web/images/",
    });
    const fit = () => {
      if (viewer.pagesCount) viewer.currentScaleValue = "page-width";
    };
    eventBus.on("pagesinit", fit, { signal });
    const resize = new ResizeObserver(() => {
      if (viewer?.currentScaleValue === "page-width") fit();
    });
    resize.observe(container);
    signal.addEventListener("abort", () => resize.disconnect(), { once: true });
    links.setDocument(documentPdf);
    links.setViewer(viewer);
    viewer.setDocument(documentPdf);
    const fieldValue = (field) =>
      field &&
      documentPdf.annotationStorage.getValue(field.id, { value: field.value })
        .value;
    const required = new Map();
    async function checkRequiredFields() {
      const visitedPages = new Set();
      for (const field of editable) {
        if (field.page < 0 || visitedPages.has(field.page)) continue;
        visitedPages.add(field.page);
        const page = await documentPdf.getPage(field.page + 1);
        for (const widget of await page.getAnnotations({ intent: "display" })) {
          if (
            widget.required &&
            !widget.hidden &&
            !widget.readOnly &&
            widget.fieldName
          ) {
            required.set(
              widget.fieldName,
              widget.alternativeText || widget.fieldName,
            );
          }
        }
      }
      for (const [name, label] of required) {
        if (
          !fields.get(name)?.some((field) => {
            const value = fieldValue(field);
            if (field.type === "checkbox" || field.type === "radiobutton")
              return value === true || value === field.exportValues;
            return Array.isArray(value)
              ? value.length
              : String(value ?? "").trim();
          })
        )
          throw Error(`Bitte das Pflichtfeld «${label}» ausfüllen.`);
      }
    }
    async function save() {
      if (template.sourceId) await checkRequiredFields();
      if (!template.sourceId) {
        for (const [index, definition] of template.points.entries()) {
          const point = controlPoint(definition);
          const value = fieldValue(fields.get("point_" + index)?.[0]);
          const comment = fieldValue(fields.get("comment_" + index)?.[0]);
          if (
            point.type === "check" &&
            value !== true &&
            value !== "Yes" &&
            !comment?.trim()
          )
            throw Error(
              `«${point.label}» abhaken oder einen Kommentar eintragen.`,
            );
          if (point.type === "text" && !value?.trim())
            throw Error(`«${point.label}» ausfüllen.`);
          if (
            point.type === "number" &&
            !/^-?\d+(?:[.,]\d+)?$/.test(value?.trim() || "")
          )
            throw Error(
              `Für «${point.label}» einen gültigen Messwert eingeben.`,
            );
        }
      }
      if (!documentPdf.annotationStorage.size)
        throw Error("Bitte das Kontrollblatt ausfüllen.");
      return documentPdf.saveDocument();
    }
    return {
      save,
      zoom(direction) {
        if (direction === "fit") fit();
        else viewer.updateScale({ steps: direction === "in" ? 1 : -1 });
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", close);
    close();
    throw error;
  }
}
