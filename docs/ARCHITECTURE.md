# Architektur und Wartung

## Zuständigkeiten

| Bereich | Dateien / Zuständigkeit |
| --- | --- |
| HTTP und statische Auslieferung | `server.cjs`, `public/index.html`, `public/dev-reload.js` |
| Frontend | `src/app.js`, `src/styles/`, `src/features/`, `src/admin/`, `src/auth/` |
| API und Betriebsdaten | `server-api.cjs` |
| Sitzungen, Rechte, SQLite und Uploads | `server-security.cjs` |
| Kontakte, SMTP, Warteschlange und Fristzyklen | `server-collaboration.cjs` |
| Führung und PDFs | `server-leadership.cjs`, `server-leadership-pdf.cjs` |
| Kontrollblätter | `src/features/control-rounds.js`, `server-control-sheet.cjs`, `server-control-round.cjs`, `server-control-round-pdf.cjs` |
| Scanner / Sicherung | `server-scanner.cjs`, `server-backup.cjs` |
| Browser-Transport | `src/services/repository.js` |
| Beispieldaten | `src/data/seed.js`, `src/data/control-round-examples.json` |
| Produktionsstarter | `server-hosting.cjs`, `tools/hosting-env.cjs`, einmalig `server-hosting-setup.cjs` |
| Manuelle Veröffentlichung | `deploy.sh`, `tools/deployment-check.cjs`, `tools/migrate.cjs` |
| Betriebswerkzeuge | `tools/backup.cjs`, `tools/restore.cjs`, `tools/mail-worker.cjs` |
| Tests | `tests/`; Node-Assertions und DOM-Tests mit LinkeDOM |

## Datenfluss

Der Browser verwendet HTTP-APIs. Es gibt keine produktive Browser-Datenbank als
führende Quelle. Die lokale Übernahme früherer localStorage-/IndexedDB-Daten
bleibt als Kompatibilitätsfunktion erhalten, weil sie Bestandsdaten schützt.
Anmeldung, Passwort-Hashes, Sitzungen, CSRF/Origin und Rechte werden serverseitig
geprüft. WVM und EPC sind die Unternehmenszugehörigkeit. Leitung, Admin und
zusätzliche Systemrechte werden je Konto verwaltet.

Metadaten und Benutzer liegen im vorhandenen SQLite-State. Kontakte, Bilder,
SMTP, Mailereignisse und Führung haben separate Tabellen in derselben Datenbank.
Logbuch und neue Mailereignisse werden atomar gespeichert; SMTP erfolgt danach
im Hintergrund. Siehe [Datenbank](DATABASE.md).

## Änderungen warten

Die Routen für Kontrollblatt-Vorlagen und Rundgänge stehen in
`server-control-sheet.cjs`. `server-control-round.cjs` validiert Versionen,
Rundgangsdaten und Eingaben. Abgeschlossene Rundgänge speichern ihre
Punktbezeichnungen und Antworten, damit spätere Vorlagenänderungen den
früheren Bestand nicht beeinflussen. PDFKit erstellt den A4-Ausdruck.
PDF.js öffnet zuvor eingerichtete PDF-Formulare.

Neue Felder brauchen Formular, API-Validierung, Persistenz und Darstellung.
[Lokale Entwicklung](LOCAL_DEVELOPMENT.md) beschreibt Tests und VS-Code-Aufgaben.
