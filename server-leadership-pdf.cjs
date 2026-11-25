const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const date = (value) =>
  value ? value.slice(0, 10).split("-").reverse().join(".") : "-";
const blue = "#0078bf";
function protocolFonts() {
  const directories = [
    process.env.COCKPIT_VERDANA_DIR,
    process.env.WINDIR && path.join(process.env.WINDIR, "Fonts"),
    "/usr/share/fonts/truetype/msttcorefonts",
  ].filter(Boolean);
  for (const directory of directories) {
    const regular = path.join(directory, "verdana.ttf");
    const bold = path.join(directory, "verdanab.ttf");
    if (fs.existsSync(regular) && fs.existsSync(bold)) return { regular, bold };
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}
// Legacy and Jourfix protocols share the same PDF layout.
async function generate(meeting) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 58, bottom: 58, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: meeting.title,
      Author: "Wärmeverbund Betriebs Cockpit",
      Subject: "Vertrauliches Sitzungsprotokoll",
      CreationDate: new Date(meeting.closedAt),
      ModDate: new Date(meeting.closedAt),
    },
  });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - 96;
  const { regular, bold } = protocolFonts();
  function room(height = 60) {
    if (doc.y + height > doc.page.height - 65) doc.addPage();
  }
  function heading(value, color = blue) {
    room(65);
    doc
      .moveDown(0.8)
      .font(bold)
      .fontSize(12)
      .fillColor(color)
      .text(value, { width });
    doc.moveDown(0.4);
  }
  function paragraph(value) {
    doc
      .font(regular)
      .fontSize(10)
      .fillColor("#000000")
      .text(value || "-", { width, lineGap: 3 });
    doc.moveDown(0.4);
  }
  doc.font(bold).fontSize(16).fillColor(blue).text(meeting.title, { width });
  doc.moveDown(0.5);
  if (meeting.jourfix) {
    paragraph(
      `Sitzung vom ${date(meeting.date)}, ${meeting.time}${meeting.chair ? "\nSitzungsleitung: " + meeting.chair : ""}`,
    );
    heading("Teilnehmende");
    paragraph(
      meeting.people
        .map(
          (p) => p.name + (meeting.jourfix === "epc" ? " – " + p.status : ""),
        )
        .join("\n"),
    );
    if (meeting.jourfix === "epc") {
      heading("Traktanden");
      if (meeting.agendaItems?.length)
        meeting.agendaItems.forEach((item, index) => {
          heading(index + 1 + ". " + item.title, "#000000");
          paragraph(item.notes);
        });
      else paragraph(meeting.agenda);
    }
    heading("Pendenzen");
    meeting.items.forEach((p, i) => {
      room(70);
      paragraph(
        `${i + 1}. ${p.title}\n${p.networkNames.length ? p.networkNames.join(", ") + " | " : ""}${p.status} | Verantwortlich: ${p.responsible || "-"} | Termin: ${date(p.due)}`,
      );
    });
    if (meeting.jourfix === "epc") {
      heading("Beschlüsse und Entscheidungen");
      paragraph(meeting.decisions);
    }
    if (meeting.topics) {
      heading("Neue Themen und Rückmeldungen");
      paragraph(meeting.topics);
    }
    heading("Zusammenfassung");
    paragraph(meeting.summary);
    if (meeting.nextDate)
      paragraph("Nächster Jourfix: " + date(meeting.nextDate));
  } else {
    paragraph(
      `Sitzung vom ${date(meeting.date)}\nTeilnehmende: ${meeting.participants}\nAbgeschlossen von ${meeting.closedBy} am ${date(meeting.closedAt)}`,
    );
    if (meeting.previousDate)
      paragraph(
        `Rückblick seit der Sitzung vom ${date(meeting.previousDate)}.`,
      );
    heading("Traktanden und Besprechung");
    paragraph(meeting.agenda);
    heading(`Pendenzen und Veränderungen (${meeting.items.length})`);
    if (!meeting.items.length)
      paragraph(
        "Keine offenen oder seit der letzten Sitzung geänderten Pendenzen.",
      );
    meeting.items.forEach((item, index) => {
      room(100);
      doc
        .moveDown(0.4)
        .font(bold)
        .fontSize(12)
        .fillColor("#000000")
        .text(`${index + 1}. ${item.title}`, { width });
      paragraph(
        `${item.kind === "task" ? "Führungsaufgabe" : "Logbuch"} | ${item.change} | ${item.status}${item.kind === "task" && item.priority ? " | Priorität: " + item.priority : ""}\n${item.kind === "task" ? `Verantwortlich: ${item.responsibleName}` : `Standort: ${item.site}${item.plant ? " / " + item.plant : ""}`}\nFrist: ${date(item.dueDate)}`,
      );
      paragraph(item.description);
      if (item.nextSteps) paragraph("Nächste Schritte: " + item.nextSteps);
      if (item.note) {
        room();
        paragraph("Besprechung: " + item.note);
      }
      if (item.decision) {
        room();
        paragraph("Beschluss: " + item.decision);
      }
      paragraph("Besprochen: " + (item.reviewed ? "Ja" : "Nein"));
    });
    heading("Zusammenfassung und Beschlüsse");
    paragraph(meeting.summary);
    if (meeting.nextDate) {
      heading("Nächste Sitzung");
      paragraph(date(meeting.nextDate));
    }
  }
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page);
    doc
      .save()
      .strokeColor("#d5e0e0")
      .moveTo(48, 803)
      .lineTo(547, 803)
      .stroke()
      .restore();
    doc
      .font(regular)
      .fontSize(8)
      .fillColor("#647779")
      .text(
        `${date(meeting.date)} | Seite ${page + 1} / ${range.count}`,
        48,
        811,
        { lineBreak: false },
      );
  }
  doc.end();
  return complete;
}
module.exports = { generate };
