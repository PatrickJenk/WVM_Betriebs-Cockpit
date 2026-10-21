// ClamAV INSTREAM: eigener Scanner auf localhost oder einem privaten, geschützten Netz.
const fs = require("node:fs"),
  net = require("node:net");
const https = require("node:https");
const crypto = require("node:crypto");
async function scanHttps(file, endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw Error("Ungültige HTTPS-Scanner-Konfiguration.");
  const digest = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  const sha256 = digest.digest("hex");
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/octet-stream",
      "Content-Length": fs.statSync(file).size,
      "X-Content-SHA256": sha256,
    };
    if (process.env.COCKPIT_SCAN_TOKEN)
      headers.Authorization = "Bearer " + process.env.COCKPIT_SCAN_TOKEN;
    const request = https.request(
      url,
      { method: "POST", headers },
      (response) => {
        let bytes = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 65536)
            request.destroy(Error("Ungültige Scanner-Antwort."));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            if (response.statusCode !== 200)
              throw Error("Scanner nicht verfügbar.");
            const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!result || result.sha256 !== sha256)
              throw Error("Scanner-Antwort gehört nicht zu dieser Datei.");
            if (result.clean === false)
              throw Object.assign(
                Error("Datei wegen schädlichem Inhalt abgewiesen."),
                { status: 415 },
              );
            if (result.clean !== true)
              throw Error("Dateiprüfung nicht abgeschlossen.");
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(Error("Scanner-Zeitlimit.")),
      60000,
    );
    timer.unref();
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    const input = fs.createReadStream(file);
    input.on("error", (error) => request.destroy(error));
    request.on("error", () => input.destroy());
    input.pipe(request);
  });
}
module.exports = async function scan(file, production) {
  const mode = process.env.COCKPIT_SCAN_MODE || "required";
  if (mode === "disabled") return;
  if (mode !== "required")
    throw Object.assign(Error("Ungültiger Virenscanner-Modus."), {
      status: 503,
    });
  if (process.env.COCKPIT_SCAN_URL) {
    try {
      return await scanHttps(file, process.env.COCKPIT_SCAN_URL);
    } catch (error) {
      if (error.status) throw error;
      throw Object.assign(
        Error("Dateiprüfung nicht verfügbar. Bitte später erneut versuchen."),
        { status: 503 },
      );
    }
  }
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
