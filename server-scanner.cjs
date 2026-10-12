// ClamAV INSTREAM: eigener Scanner auf localhost oder einem privaten, geschützten Netz.
const fs = require("node:fs"),
  net = require("node:net");
module.exports = async function scan(file, production) {
  const host = process.env.COCKPIT_CLAMAV_HOST;
  if (!host) {
    if (production)
      throw Object.assign(
        Error(
          "Upload vorübergehend gesperrt: Malware-Scanner noch nicht eingerichtet.",
        ),
        { status: 503 },
      );
    return;
  }
  const socket = net.createConnection({
    host,
    port: Number(process.env.COCKPIT_CLAMAV_PORT || 3310),
  });
  const response = new Promise((resolve, reject) => {
    let reply = "";
    socket.setTimeout(60000, () => socket.destroy(Error("Scanner-Zeitlimit.")));
    socket.on("error", reject);
    socket.on("data", (bytes) => {
      reply += bytes.toString();
      if (reply.length > 4096)
        socket.destroy(Error("Ungültige Scanner-Antwort."));
      if (reply.includes("\0")) resolve(reply.split("\0")[0]);
    });
    socket.on("end", () => {
      if (!reply.includes("\0"))
        reject(Error("Scanner hat die Verbindung vorzeitig geschlossen."));
    });
  });
  // Fehler sofort behandeln, auch während die Datei noch gesendet wird.
  response.catch(() => {});
  const waitFor = (event) =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off(event, ready);
        socket.off("error", failed);
        socket.off("close", closed);
      };
      const ready = () => {
          cleanup();
          resolve();
        },
        failed = (error) => {
          cleanup();
          reject(error);
        },
        closed = () => failed(Error("Scanner-Verbindung geschlossen."));
      socket.once(event, ready);
      socket.once("error", failed);
      socket.once("close", closed);
    });
  try {
    await waitFor("connect");
    const write = async (bytes) => {
      if (socket.destroyed) throw Error("Scanner nicht erreichbar.");
      if (!socket.write(bytes)) await waitFor("drain");
    };
    await write(Buffer.from("zINSTREAM\0"));
    for await (const chunk of fs.createReadStream(file, {
      highWaterMark: 65536,
    })) {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      await write(size);
      await write(chunk);
    }
    await write(Buffer.alloc(4));
    const reply = await response;
    if (/ FOUND$/.test(reply))
      throw Object.assign(Error("Datei wegen schädlichem Inhalt abgewiesen."), {
        status: 415,
      });
    if (!/^stream: OK$/.test(reply))
      throw Error("Scannerprüfung fehlgeschlagen.");
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(
      Error("Dateiprüfung nicht verfügbar. Bitte später erneut versuchen."),
      { status: 503 },
    );
  } finally {
    socket.destroy();
  }
};
