# Hier kannst du selbst erweitern.

Der gesamte Programmcode liegt offen im Ordner `src`. Die Anwendung verwendet JavaScript, HTML und CSS. Sie braucht keinen Docker-Container und keinen Build-Schritt.

## Projektübersicht

```text
cockpit/
├── src/                         ← Hier programmierst du
│   ├── app.js                   ← Einstieg, Sidebar, Navigation und Ansichten
│   ├── features/
│   │   ├── dashboard.js         ← KPI-Karten und Berechnung
│   │   ├── logbook.js           ← Logbuch, Filter, Formular und Details
│   │   └── documents.js         ← Dokumentliste, Upload und Vorschau
│   ├── admin/administration.js  ← Anlagen und Ordner verwalten
│   ├── auth/accounts.js        ← Demo-Anmeldung, Rollen und Benutzer
│   ├── data/seed.js            ← Standorte und Beispieldaten
│   ├── services/repository.js  ← Daten und Dateien speichern/laden
│   └── styles/styles.css       ← Farben, Abstände, responsive Darstellung
├── public/
│   ├── index.html              ← HTML-Seite, lädt src/app.js
│   └── assets/                 ← Firmenlogos
├── tests/smoke.cjs             ← Prüfung der Kernfunktionen
├── server.cjs                  ← Server für localhost
├── package.json                ← Start- und Prüfkommandos
├── ANLEITUNG.md                ← Erstmaliger Start in VS Code
└── ERWEITERN.md                ← Diese Erweiterungsanleitung
```

## Erste Änderung ausprobieren

1. Den ganzen entpackten Ordner in VS Code öffnen, nicht nur eine HTML-Datei. Der richtige Ordner enthält `package.json` und `src`.
2. Links im Explorer `src → app.js` öffnen. Falls der Explorer fehlt: **Strg+Umschalt+E**.
3. Mit **Strg+F** nach `Gemeinsame Betriebsplattform` suchen und diesen Text ändern.
4. Mit **Strg+S** speichern.
5. Im Terminal `npm start` ausführen und http://localhost:4173 öffnen.
6. Browser neu laden. Die Änderung ist sofort sichtbar. Für Änderungen in `src` muss der Server nicht neu gestartet werden.

Mit **Strg+Umschalt+O** siehst du die Funktionen einer Datei. HTML innerhalb von JavaScript steht zwischen Backticks; `${...}` setzt Werte ein. Der Zeilenumbruch in VS Code ist bereits aktiviert, damit auch längere HTML-Vorlagen lesbar sind.

## Was ändere ich wo?

| Erweiterung                                | Datei / Funktion                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Überschrift, Sidebar oder zusätzlicher Tab | `src/app.js`: `shell()` und `render()`                                                  |
| Neue KPI-Karte                             | `src/features/dashboard.js`: Array `kpis` in `dashboard()`                              |
| Logbuchspalte                              | `src/features/logbook.js`: `table()` – Kopf und Zeile ergänzen                          |
| Neues Logbuchfeld                          | `entryForm()` – Formularfeld und Speicherobjekt `next` ergänzen; danach `entryDetail()` |
| Weitere Suchkriterien                      | `filtered()` im Logbuch                                                                 |
| Dokumentdarstellung                        | `src/features/documents.js`: `documentsView()`                                          |
| Neue Anlage oder neuer Ordner              | Direkt in der App als Admin, ohne Codeänderung                                          |
| Rollen / zusätzliche Benutzerfelder        | `src/auth/accounts.js`; Admin-Prüfung auch in `src/admin/administration.js`             |
| Standortname oder Adresse                  | `src/data/seed.js`: Array `sites`                                                       |
| Farbe oder Abstand                         | `src/styles/styles.css`                                                                 |
| Logo austauschen                           | Datei unter `public/assets` ersetzen                                                    |
| Später Datenbank anbinden                  | `src/services/repository.js`; Dateien aus IndexedDB in Object Storage übertragen        |

## Beispiel: neue KPI-Karte

In `src/features/dashboard.js` im Array `kpis` ergänzen:

```js
[
  "Erledigte Arbeiten",
  entries.filter((e) => e.status === "Erledigt").length,
  "done",
  "check",
  "Abgeschlossene Einträge",
];
```

Die fünf Werte sind Beschriftung, Zahl, Kennung, Icon und Untertitel. Für einen Klickfilter zusätzlich in `src/app.js` den Handler für `[data-kpi]` ergänzen. Für fünf Karten nebeneinander in `styles.css` die Spaltenzahl von `.kpis` anpassen.

## Beispiel: neue Zentrale

In `src/data/seed.js` im Array `sites` ergänzen:

```js
{ id: 'neuer-standort', heatNetworkId: 'marzili',
  name: 'Beispielstrasse 10', address: 'Beispielstrasse 10, Bern' }
```

Die `id` muss eindeutig und dauerhaft stabil sein. `heatNetworkId` verweist auf `networks`. Sidebar und Standortansicht entstehen automatisch. Die Anlagen anschliessend als Admin passend pflegen.

## Beispieldaten und gespeicherte Daten

`seed()` wird nur verwendet, wenn noch keine Serverdaten existieren und der lokale Entwicklungsmodus aktiv ist. Änderungen an Startdaten überschreiben vorhandene Einträge, Benutzer und Anlagen nicht. Die Standortliste selbst wird direkt aus `seed.js` gelesen. Weitere Anlagen für bestehende Daten legst du über die Administration an.

Für frische Beispieldaten einen separaten, leeren `COCKPIT_DATA_DIR` verwenden. Browser-Speicher löschen setzt die gemeinsame Serverdatenbank nicht zurück. Bestehende Daten vorher sichern.

## Wie die Teile verbunden sind

`public/index.html` lädt `src/app.js`. Dort werden Daten geladen und die Feature-Module mit einem gemeinsamen Kontext verbunden: Daten, Hilfsfunktionen und Speicheradapter. `createLogbook()` und `createDocuments()` liefern die Funktionen für Anzeige und Bedienung. `getState()` liefert beim Aufruf die aktuelle Zentrale und Filter. Nach Änderungen wird gespeichert und `render()` aktualisiert die Ansicht.

Die Module sind getrennt, ohne ein Framework einzuführen. Anmeldung und Rechte werden in `server-api.cjs` und `server-security.cjs` serverseitig geprüft. SQLite ersetzt die frühere JSON-Datei. Sicherheitsfunktionen und Produktionskonfiguration stehen in [INFOMANIAK.md](INFOMANIAK.md).

## Nach Änderungen prüfen

```powershell
npm run check
```

Danach den betroffenen Ablauf in der Demo ausprobieren. Die Browser-Konsole (**F12 → Konsole**) zeigt bei Fehlern Datei und Zeile. Änderungen an `server.cjs` erfordern einen Neustart: Strg+C, dann `npm start`.

Optional für automatische Codeformatierung:

```powershell
npm install
npm run format
```

Die Demo selbst benötigt weiterhin kein `npm install`. Prettier ist nur ein Entwicklungswerkzeug.
