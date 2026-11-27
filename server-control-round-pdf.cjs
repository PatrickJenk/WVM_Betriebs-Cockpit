const PDFDocument = require("pdfkit");
const {
  controlKindLabel,
  controlStatusLabel,
  controlDateLabel,
} = require("./src/services/control-sheet.js");

const colors = {
  ink: "#163953",
  line: "#cbdbe5",
  light: "#eef5fa",
  text: "#243746",
};
const legacyColumns = [
  { label: "Kontrollpunkt", width: 184 },
  { label: "Status", width: 100 },
  { label: "Bemerkung", width: 223.28 },
];
const choiceColumns = [
  { label: "Kontrollpunkt", width: 207.28 },
  { label: "Ja", width: 40, choice: "yes" },
  { label: "Nein", width: 45, choice: "no" },
  { label: "Bemerkung", width: 215 },
];
const margin = 44;
const textSize = 10;
const lineHeight = 14;
const padding = 8;

function wrap(doc, text, width) {
  return text.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const lines = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (doc.widthOfString(next) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const letter of word) {
        if (doc.widthOfString(line + letter) > width && line) {
          lines.push(line);
          line = "";
        }
        line += letter;
      }
    }
    return [...lines, line];
  });
}

function renderRoundPdf(run, logo) {
  return new Promise((resolve, reject) => {
    const extraColumns = run.startedAt ? run.columns || [] : [];
    const doc = new PDFDocument({
      size: "A4",
      layout: extraColumns.length ? "landscape" : "portrait",
      margin,
      bufferPages: true,
      info: { Title: run.title, CreationDate: new Date(run.at) },
    });
    const streams = [];
    doc.on("data", (bytes) => streams.push(bytes));
    doc.once("end", () => resolve(Buffer.concat(streams)));
    doc.once("error", reject);
    const tableWidth = doc.page.width - 2 * margin;
    const columns = extraColumns.length
      ? [
          { ...choiceColumns[0], width: 180 },
          ...extraColumns.map((label) => ({
            label,
            width: (tableWidth - 435) / extraColumns.length,
          })),
          ...choiceColumns.slice(1, 3),
          { ...choiceColumns[3], width: 170 },
        ]
      : run.startedAt
        ? choiceColumns
        : legacyColumns;
    const image = logo && doc.openImage(logo);
    let y = margin;
    const bottom = () => doc.page.height - 62;
    const text = (value, x, top, options) =>
      doc.text(value, x, top, { lineBreak: false, ...options });
    function newPage() {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.ink);
      doc.text(run.title + " / " + run.siteName, margin, margin, {
        width: tableWidth - (logo ? 96 : 0),
      });
      if (image)
        doc.image(image, margin + tableWidth - 84, margin, {
          fit: [84, 25],
          align: "right",
        });
      y = Math.max(doc.y + 12, margin + 35);
    }
    function tableHeader() {
      doc.font("Helvetica-Bold").fontSize(textSize);
      const labels = columns.map((col) =>
        wrap(doc, col.label, col.width - 2 * padding),
      );
      const height = Math.max(
        25,
        11 + Math.max(...labels.map((lines) => lines.length)) * lineHeight,
      );
      doc.rect(margin, y, tableWidth, height).fill(colors.ink);
      doc.fillColor("#ffffff");
      let x = margin;
      for (const [index, col] of columns.entries()) {
        labels[index].forEach((line, row) =>
          text(
            line,
            x +
              (col.choice
                ? (col.width - doc.widthOfString(line)) / 2
                : padding),
            y + 7 + row * lineHeight,
          ),
        );
        x += col.width;
      }
      y += height;
    }
    const headerWidth = tableWidth - (logo ? 150 : 0);
    if (image)
      doc.image(image, margin + tableWidth - 132, margin + 3, {
        fit: [132, 54],
        align: "right",
        valign: "center",
      });
    if (run.headerTitle) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#41718b");
      doc.text(run.headerTitle, margin, y, { width: headerWidth });
      y = doc.y + 8;
    }
    doc.font("Helvetica-Bold").fontSize(24).fillColor(colors.ink);
    doc.text(run.title, margin, y, { width: headerWidth });
    doc
      .moveDown(0.32)
      .font("Helvetica")
      .fontSize(13)
      .text(run.siteName, margin, doc.y, { width: headerWidth });
    if (run.headerSubtitle)
      doc
        .moveDown(0.3)
        .fontSize(10)
        .fillColor("#42647a")
        .text(run.headerSubtitle, margin, doc.y, { width: headerWidth });
    y = Math.max(doc.y + 15, logo ? margin + 68 : 0);
    doc
      .moveTo(margin, y)
      .lineTo(margin + tableWidth, y)
      .lineWidth(1.1)
      .stroke(colors.ink);
    y += 14;
    const details = [
      [
        "Datum und Uhrzeit",
        controlDateLabel(run.date) + " / " + run.time + " Uhr",
      ],
      ["Kontrollierende Person", run.authorName],
    ];
    const roundType = run.roundType || controlKindLabel(run.kind);
    if (roundType) details.push(["Art des Kontrollrundgangs", roundType]);
    for (const [label, value] of details) {
      doc.font("Helvetica").fontSize(textSize);
      const lines = wrap(doc, value, tableWidth - 164);
      const height = Math.max(23, 14 + lines.length * lineHeight);
      doc.rect(margin, y, tableWidth, height).fill(colors.light);
      doc.font("Helvetica-Bold").fontSize(textSize).fillColor(colors.ink);
      text(label, margin + padding, y + 7);
      doc.font("Helvetica").fillColor(colors.text);
      lines.forEach((line, index) =>
        text(line, margin + 156, y + 7 + index * lineHeight),
      );
      y += height + 1;
    }
    y += 19;
    tableHeader();
    for (const [index, item] of run.items.entries()) {
      if (item.section) {
        doc.font("Helvetica-Bold").fontSize(textSize);
        const lines = wrap(doc, item.section, tableWidth - 2 * padding);
        const height = lines.length * lineHeight + 2 * padding;
        if (
          y +
            height +
            (run.items[index + 1]?.point ? lineHeight + 2 * padding : 0) >
          bottom()
        ) {
          newPage();
          tableHeader();
        }
        doc.rect(margin, y, tableWidth, height).fill(colors.light);
        doc.font("Helvetica-Bold").fontSize(textSize).fillColor(colors.ink);
        lines.forEach((line, row) =>
          text(line, margin + padding, y + padding + row * lineHeight),
        );
        y += height;
        continue;
      }
      doc.font("Helvetica").fontSize(textSize);
      const values = run.startedAt
        ? [
            item.point,
            ...extraColumns.map((_, col) => item.cells?.[col] || ""),
            "",
            "",
            item.comment || "-",
          ]
        : [item.point, controlStatusLabel(item.status), item.comment || "-"];
      const lines = values.map((value, i) =>
        wrap(doc, value, columns[i].width - 2 * padding),
      );
      const length = Math.max(...lines.map((line) => line.length));
      let start = 0;
      while (start < length) {
        let capacity = Math.floor((bottom() - y - 2 * padding) / lineHeight);
        if (capacity < 1 || (start === 0 && capacity < length && length < 9)) {
          newPage();
          tableHeader();
          capacity = Math.floor((bottom() - y - 2 * padding) / lineHeight);
        }
        const end = Math.min(start + capacity, length);
        const height = (end - start) * lineHeight + 2 * padding;
        let x = margin;
        doc.font("Helvetica").fontSize(textSize);
        for (const [i, column] of columns.entries()) {
          doc
            .rect(x, y, column.width, height)
            .lineWidth(0.5)
            .fillAndStroke(index % 2 ? "#f5f8fa" : "#ffffff", colors.line);
          if (column.choice) {
            if (start === 0) {
              const left = x + (column.width - 12) / 2;
              const top = y + padding;
              doc.rect(left, top, 12, 12).lineWidth(0.8).stroke("#4c7084");
              if (column.choice === item.status)
                doc
                  .moveTo(left + 2.2, top + 5.8)
                  .lineTo(left + 5, top + 8.8)
                  .lineTo(left + 10, top + 3)
                  .lineWidth(1.45)
                  .stroke(colors.ink);
            }
          } else {
            doc.fillColor(
              !run.startedAt && i === 1 && item.status === "issue"
                ? "#8c342c"
                : colors.text,
            );
            lines[i]
              .slice(start, end)
              .forEach((line, row) =>
                text(line, x + padding, y + padding + row * lineHeight),
              );
          }
          x += column.width;
        }
        y += height;
        start = end;
      }
    }
    y += 22;
    if (y + 40 > bottom()) newPage();
    doc.font("Helvetica-Bold").fontSize(12).fillColor(colors.ink);
    text("Allgemeine Bemerkungen", margin, y);
    y += 22;
    doc.font("Helvetica").fontSize(textSize);
    for (const line of wrap(doc, run.remarks || "-", tableWidth)) {
      if (y + lineHeight > bottom()) newPage();
      doc.font("Helvetica").fontSize(textSize).fillColor(colors.text);
      text(line, margin, y);
      y += lineHeight;
    }
    const pages = doc.bufferedPageRange().count;
    for (let page = 0; page < pages; page++) {
      doc.switchToPage(page);
      doc.font("Helvetica").fontSize(8).fillColor("#4c6577");
      const top = doc.page.height - 41;
      text("Wärmeverbund Betriebs Cockpit", margin, top);
      const label = "Seite " + (page + 1) + " / " + pages;
      text(label, margin + tableWidth - doc.widthOfString(label), top);
    }
    doc.end();
  });
}

module.exports = renderRoundPdf;
