# Wärmeverbund Betriebs Cockpit

**Lokal starten:** `npm.cmd start`, dann http://localhost:4173.
**Im LAN testen:** `npm.cmd run start:lan`, dann die angezeigte Adresse auf Port 4175.
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
`npm run start:production` und verlangt HTTPS sowie sichere Admin-Konten mit Zwei-Faktor-Anmeldung.
Es wurde nichts bei einem externen Anbieter veröffentlicht.
