// Small dependency-free ZIP writer. File names are fixed by the packaging tool.
const fs = require("node:fs");
const zlib = require("node:zlib");
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(file, entries) {
  if (entries.length > 65535) throw Error("Zu viele Dateien für ZIP32.");
  const now = new Date();
  const date =
    ((now.getUTCFullYear() - 1980) << 9) |
    ((now.getUTCMonth() + 1) << 5) |
    now.getUTCDate();
  const time =
    (now.getUTCHours() << 11) |
    (now.getUTCMinutes() << 5) |
    Math.floor(now.getUTCSeconds() / 2);
  const handle = fs.openSync(file, "wx", 0o600);
  const records = [];
  let offset = 0;
  const write = (bytes) => {
    let written = 0;
    while (written < bytes.length)
      written += fs.writeSync(handle, bytes, written);
    offset += bytes.length;
  };
  try {
    for (const entry of entries) {
      if (
        !/^[a-zA-Z0-9_./-]+$/.test(entry.name) ||
        entry.name.split("/").includes("..") ||
        entry.name.startsWith("/")
      )
        throw Error("Ungültiger Archivpfad");
      const name = Buffer.from(entry.name),
        data = entry.bytes || fs.readFileSync(entry.file),
        compressed = zlib.deflateRawSync(data);
      if (data.length > 0xffffffff || offset > 0xffffffff)
        throw Error("Archiv ist für ZIP32 zu gross.");
      const crc = crc32(data),
        local = Buffer.alloc(30),
        record = Buffer.alloc(46);
      local.writeUInt32LE(0x04034b50);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x800, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      record.writeUInt32LE(0x02014b50);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x800, 8);
      record.writeUInt16LE(8, 10);
      record.writeUInt16LE(time, 12);
      record.writeUInt16LE(date, 14);
      record.writeUInt32LE(crc, 16);
      record.writeUInt32LE(compressed.length, 20);
      record.writeUInt32LE(data.length, 24);
      record.writeUInt16LE(name.length, 28);
      record.writeUInt32LE(offset, 42);
      records.push(record, name);
      write(local);
      write(name);
      write(compressed);
    }
    const start = offset;
    for (const record of records) write(record);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - start, 12);
    end.writeUInt32LE(start, 16);
    write(end);
  } finally {
    fs.closeSync(handle);
  }
}
module.exports = { zip, crc32 };
