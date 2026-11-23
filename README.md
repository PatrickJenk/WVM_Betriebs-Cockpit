# Wärmeverbund Betriebs Cockpit

Das Cockpit bündelt den Betrieb der Wärmeverbünde Marzili, Mösli und Buchsee. Es enthält Logbuch und Pendenzen, Dokumente, Betriebspersonal, Kontrollrundgänge und den Leitungsaustausch EPC + WVM.

## Lokal starten

Voraussetzungen sind Git, npm und Node.js ab **22.16**. Node.js 24 LTS wird für die Übergabe empfohlen. Im Projektordner unter Windows:

```powershell
npm.cmd ci
npm.cmd run start:test
```

Die isolierte Demo öffnet sich unter <http://localhost:4183>. Die Demo verwendet eine neue temporäre SQLite-Datenbank und sperrt den Mailversand. Für die Testadministration stehen `WVM-admin` und das Demo-Passwort `9876` zur Verfügung. Mit Strg+C beenden. In VS Code entspricht dies der Aufgabe **Cockpit: isolierte Demo starten**.

`npm.cmd start` startet den regulären Entwicklungsserver auf Port 4173 mit dem lokalen Bestand. Einzelheiten zu Datenpfaden, Testkonten und Ports stehen unter [Lokale Entwicklung](docs/LOCAL_DEVELOPMENT.md).

## Projektaufbau

| Pfad | Aufgabe |
| --- | --- |
| `src/` und `public/` | Browser-Anwendung, Ansichten, Dialoge, Stil und Bilder |
| `server*.cjs` | HTTP, Zugriffsschutz, Betriebsfunktionen, PDF-Export und Speicherung |
| `tests/` | Funktions-, Berechtigungs- und Integrationstests |
| `tools/` | Demo, Sicherung, Migration und Veröffentlichung |
| `docs/` | Bedienung, Rollen, Architektur, Datenbank und Hosting |

Das Projekt verwendet JavaScript, Node.js, SQLite, PDFKit und Nodemailer. Der Browser lädt die Module direkt. Der tatsächliche Datenordner liegt unter `COCKPIT_DATA_DIR`. Er enthält Datenbank, Dateien und Schlüssel und ist bei Updates separat zu sichern.

## Prüfen

```powershell
npm.cmd run check
npm.cmd run check:syntax
npm.cmd run check:format
npm.cmd run check:repository
```

Die Tests verwenden eigene Datenverzeichnisse und lokale Testserver. Hosting-, SMTP- und Scanner-Tests sind unter [Lokale Entwicklung](docs/LOCAL_DEVELOPMENT.md) aufgeführt.

## Unterlagen für die Übergabe

- [Bedienung](docs/BEDIENUNG.md) und [Rollen und Rechte](docs/ROLLEN_UND_RECHTE.md)
- [Architektur](docs/ARCHITECTURE.md) und [Datenbank, Sicherung und Wiederherstellung](docs/DATABASE.md)
- [Konfiguration](docs/CONFIGURATION.md) und [E-Mail-Benachrichtigungen](docs/EMAIL_NOTIFICATIONS.md)
- [Übergabe-Checkliste](docs/UEBERGABE.md), [Go-live-Prüfung](docs/GO_LIVE.md) und [manuelle Veröffentlichung auf Infomaniak](docs/INFOMANIAK_DEPLOYMENT.md)
