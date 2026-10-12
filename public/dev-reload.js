// Lokaler Entwicklungsserver: gespeicherte Quelldateien automatisch laden.
let version;
async function checkForChanges() {
  try {
    const response = await fetch("/__dev/revision", { cache: "no-store" });
    if (!response.ok) return;
    const next = (await response.json()).version;
    if (version && next !== version) {
      location.reload();
      return;
    }
    version = next;
  } catch {
    // Während eines Server-Neustarts beim nächsten Intervall erneut prüfen.
  }
}
checkForChanges();
setInterval(checkForChanges, 1500);
