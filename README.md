# Wärmeverbund Betriebs Cockpit

**Infomaniak-Erstinstallation:** `npm.cmd run hosting:package` erstellt ein privates
ZIP mit Code, Konten und allen Dokumenten. Anleitung: [INFOMANIAK-START.md](INFOMANIAK-START.md).
Im Infomaniak Manager: Node 24 LTS, Ordner `./`, Installation `npm ci --omit=dev`,
Start `npm start`, Port aus dem Manager. Im Paket startet dieser Befehl den Produktionsserver.
Lokal bleiben Start und Bedienung wie bisher. Nur WVM-admin bleibt als aktiver Zugang;
sein bisheriges Passwort bleibt lokal erhalten und muss vor der Online-Freigabe geändert werden.
Das Erstinstallationspaket schützt diesen Wechsel zusätzlich mit einem einmaligen Einrichtungscode.
Im Infomaniak-Paket sind Uploads ausdrücklich ohne Virenscanner erlaubt (`COCKPIT_SCAN_MODE=disabled`). Anmeldung, Rechte, Dateiformat- und Speicherlimits bleiben aktiv.

**Lokal starten:** `npm.cmd start`, dann http://localhost:4173.
**Im LAN testen:** `npm.cmd run start:lannpm.cmd run start:lan`, dann die angezeigte Adresse auf Port 4175.
Node.js mindestens 22.16; keine separate Datenbankinstallation, kein Docker und kein Build erforderlich.

- [ANLEITUNG.md](ANLEITUNG.md): Bedienung und lokale Tests.
- [ERWEITERN.md](ERWEITERN.md): Codeübersicht und Erweiterungen.
- [UEBERGABE.md](UEBERGABE.md): Selbstverwaltung, Zuständigkeiten und Übergabeprüfung.
- [INFOMANIAK.md](INFOMANIAK.md): Sicherheit, Sicherungen und spätere Hosting-Einrichtung.

Anmeldung und Rechte werden am Server geprüft. Daten liegen in `storage/cockpit.sqlite`,
Dateien in `storage/files`. Vorhandene JSON-Daten werden automatisch übernommen;
bestehende Benutzer, Passwörter, Einträge und Dokumente bleiben erhalten.
WVM und EPC haben gleiche Betriebsrechte, Dateien dürfen nur Besitzer oder Admins löschen.

`npm.cmd run check` prüft UI-Kernlogik, Synchronisierung, Rechte, Passwortspeicherung,
Sicherheitsangriffe, Datenübernahme sowie Sicherung und Wiederherstellung.
`npm.cmd run backup` erstellt eine manuelle Sicherung.

Die lokale Demo bleibt verfügbar. Der getrennte Produktionsmodus startet über
`npm run start:production` und verlangt HTTPS sowie sichere Admin-Konten. Zwei-Faktor-Anmeldung ist optional.
Es wurde nichts bei einem externen Anbieter veröffentlicht.
