const { inflateRawSync } = require("node:zlib");
const { error } = require("./server-security.cjs");
module.exports = function wordQuestions(bytes) {
  try {
    // Read only the main document part from the ZIP central directory.
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw Error();
    let offset = bytes.readUInt32LE(end + 16);
    for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
      if (bytes.readUInt32LE(offset) !== 0x02014b50) throw Error();
      const nameLength = bytes.readUInt16LE(offset + 28);
      const name = bytes.toString(
        "utf8",
        offset + 46,
        offset + 46 + nameLength,
      );
      if (name === "word/document.xml") {
        const local = bytes.readUInt32LE(offset + 42);
        if (
          bytes.readUInt32LE(local) !== 0x04034b50 ||
          bytes.readUInt32LE(offset + 24) > 2000000
        )
          throw Error();
        const start =
          local +
          30 +
          bytes.readUInt16LE(local + 26) +
          bytes.readUInt16LE(local + 28);
        const compressed = bytes.subarray(
          start,
          start + bytes.readUInt32LE(offset + 20),
        );
        const method = bytes.readUInt16LE(offset + 10);
        if (![0, 8].includes(method)) throw Error();
        const xml = (
          method === 8
            ? inflateRawSync(compressed, { maxOutputLength: 2000000 })
            : compressed
        ).toString("utf8");
        const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
        return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
          .map((p) =>
            [...p[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
              .map((t) =>
                t[1].replace(
                  /&(amp|lt|gt|quot|apos);/g,
                  (_, key) => entities[key],
                ),
              )
              .join(""),
          )
          .filter(Boolean)
          .join("\n")
          .slice(0, 50000);
      }
      offset +=
        46 +
        nameLength +
        bytes.readUInt16LE(offset + 30) +
        bytes.readUInt16LE(offset + 32);
    }
  } catch {
    throw error("Bitte eine gültige Word-Vorlage (.docx) hochladen.");
  }
  throw error("Die Word-Vorlage enthält kein Word-Dokument.");
};
