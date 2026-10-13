# Lokale Entwicklung und Bedienung

## Starten

Node.js mindestens **22.16** verwenden. In VS Code den Projektordner mit `package.json`
öffnen und im Terminal ausführen:

```powershell
npm.cmd start
```

Dann http://localhost:4173 öffnen. Für Geräte im gleichen vertrauenswürdigen Netzwerk:

```powershell
npm.cmd run start:lan
```

Der zusätzliche Server verwendet Port 4175 und zeigt die LAN-Adresse an. PC und Server
müssen laufen. Bei einer Firewall-Abfrage nur das private Netzwerk zulassen.
`localhost` auf einem Remote-Desktop bezeichnet dessen entfernten Computer; dort die
LAN-Adresse des Cockpit-PCs verwenden. Keine Portfreigabe ins Internet für die Testversion.

Dateien in `src` und `public` bearbeiten und speichern: der Entwicklungsserver lädt
automatisch neu. Gespeicherte Daten bleiben erhalten. Bei alten Darstellungen Strg+F5
verwenden. Bei belegtem Port zuerst den betreffenden Server mit Strg+C stoppen.
Nicht `public/index.html` direkt öffnen. Ohne npm funktioniert auch `node --watch server.cjs`.

## Konten und Passwörter

Nur bei einer **neu angelegten lokalen Demo** gelten diese Startzugänge:

| Benutzername   | Startpasswort | Rolle |
| -------------- | ------------- | ----- |
| WVM-admin      | 9876          | Admin |
| Patrick Jenk   | ChangeMe123   | WVM   |
| Marcel Maibach | ChangeMe123   | EPC   |

Vorhandene Benutzer und bereits geänderte Passwörter werden beim Update **nicht**
zurückgesetzt. Patrick und Marcel müssen das Startpasswort beim ersten Login ändern;
der Server sperrt Betriebsdaten bis dahin. **Mein Passwort ändern** verlangt das
aktuelle Passwort und meldet andere Sitzungen ab.

Unter **Benutzer verwalten** kann der Admin Konten hinzufügen, löschen und Passwörter
zurücksetzen. Ein zufälliges Startpasswort wird einmal angezeigt; sicher weitergeben.
Auch danach ist beim ersten Login ein eigenes Passwort erforderlich. E-Mail ist nicht nötig.
Hier richtet der Admin seine Zwei-Faktor-Anmeldung ein und sieht das Sicherheitsprotokoll.
Authenticator-Schlüssel und Wiederherstellungscodes sicher aufbewahren.

## Gemeinsame Daten

Alle Browser und Geräte verwenden dieselben Serverdaten. Die Datenbank liegt in
`storage/cockpit.sqlite`, Dateien in `storage/files`. `storage/state.json` wird einmalig
übernommen und ist danach nur noch ein alter Stand. Browser-Speicher löschen setzt
die Datenbank nicht zurück. `seed.js` überschreibt keine vorhandenen Betriebsdaten.

Die Übernahme alter Browserdaten ist lokal nach Anmeldung möglich; bisherige IndexedDB-Dateien
werden nur übertragen, wenn sie am Server noch fehlen. Im Produktionsmodus ist diese
Browserübernahme abgeschaltet. Backups und Hosting: [INFOMANIAK.md](INFOMANIAK.md).

## Logbuch

Wärmeverbund, Standort und freigegebene Anlage auswählen. Der Admin verwaltet Anlagen
je Standort mit **Anlagen verwalten**. Datum und Zeit stammen vom Öffnen des Formulars.
Prioritäten: Gering grün, Mittel gelb, Hoch rot. Beim Bearbeiten lassen sich Beschreibung
und Anhänge ergänzen sowie Status und Priorität ändern. Standort, Anlage, Titel und
bisheriger Text bleiben erhalten.

Eine beteiligte Person erscheint als Kürzel, mehrere als Anzahl. WVM ist blau, EPC orange,
gemischte Beteiligung hat einen Verlauf. Anklicken zeigt vollständige Namen.
Den Änderungsverlauf sieht nur der Admin. Admins können jeden Eintrag löschen.

Nicht erledigte Pendenzen sind nach mehr als 30 Tagen überfällig; ein früheres abgelaufenes
Fälligkeitsdatum gilt ebenfalls. Erledigte Einträge werden ab dem ersten Tag des Folgequartals
(Europe/Zurich) für normale Benutzer ausgeblendet. Auch deren Anhänge sind dann nur für
Admins verfügbar. Admins behalten Einträge und Historie. Dies spart keinen SSD-Platz.

## Personen im Logbuch erwähnen

In einer Beschreibung oder Ergänzung `@` tippen und einen Namen auswählen, beispielsweise
„Mit @Tobias Lück angeschaut“. Eindeutige Vornamen werden ebenfalls erkannt.
Erwähnungen dokumentieren Beteiligung und weisen keine Aufgaben zu.
Der Couvert-Button ist immer sichtbar und zählt alle sichtbaren Einträge mit deiner
Erwähnung in Beschreibung oder nächsten Schritten. Rot bedeutet neue, noch nicht
angesehene Erwähnungen; Orange bedeutet mindestens eine offene Pendenz; Blau bedeutet
nur erledigte Erwähnungen oder 0. Rot hat Vorrang vor Orange. Beim Klick gelten die
aktuellen Erwähnungen als gesehen und das Dashboard zeigt alle deine Erwähnungen.
Der Gesehen-Stand wird pro Benutzer am Server gespeichert, auch nach Abmelden und
auf anderen Geräten. **Filter zurücksetzen** zeigt wieder alle Einträge.
Erwähnte Personen erscheinen im Detail separat vom Ersteller und den Bearbeitern.
Es werden keine E-Mails oder SMS versendet.

## Dokumente

Im Reiter **Dokumente** einen Ordner öffnen. Dateien auf einen Ordner oder die Ablagefläche
ziehen oder **Dateien hochladen** verwenden. Name und ablegende Person werden angezeigt.
PDF und Bilder haben eine Vorschau, andere Dokumente einen Download. Ordner verwaltet
nur der Admin. Eigene Dateien können umbenannt, verschoben und gelöscht werden;
Admins dürfen alle verwalten. Dateiformate und Speicherlimits prüft der Server.

Die anpassbare Vorlage umfasst Leitsystem-Elektroschemas, Zentralen-Prinzipschemas,
Anlagen mit Schemas/Bedienungsanleitungen, Kundenschemas und Informationen/Sonstiges.
Bestehende Dokumente werden nicht umsortiert.

## Prüfen und sichern

```powershell
npm.cmd run check
npm.cmd run backup
```

Tests verwenden getrennte Daten. Tägliche Sicherungen entstehen automatisch im
Datenverzeichnis; zusätzlich extern sichern. Wiederherstellung und Produktionsmodus:
[INFOMANIAK.md](INFOMANIAK.md). Die lokale Demo bleibt zum Weiterentwickeln verfügbar.

Admin-Erweiterungen: Über die **+**-Schaltflächen in der Navigation lassen sich Verbünde,
Heizzentralen, Unterstationen und Unterkategorien anlegen. **Navigation verwalten** beim
Admin-Profil dient zum Umbenennen und Verschieben über die Auswahl von Verbund und Kategorie.
In einem Standort ergänzt **+ Register** weitere Dokumentbereiche, beispielsweise Arbeitsrapporte.
Das Stiftsymbol direkt am Verbund, Standort, an einer Unterkategorie oder einem Register öffnet
die Bearbeitung. Dort steht auch **Löschen** zur Verfügung. Die Sicherheitsabfrage nennt die
betroffenen Standorte, Ordner, Dokumente, Anlagen und Logbucheinträge vor dem endgültigen Löschen.
**Register verwalten** erlaubt mit den Pfeilen die Reihenfolge zu ändern; im Bearbeitungsformular
kann die Position auch direkt gewählt werden. Neue Register werden nach dem Speichern geöffnet.
Die Standardregister Logbuch und Dokumente können umbenannt, verschoben oder ausgeblendet werden.
Ihre Inhalte bleiben beim Ausblenden erhalten; über Register verwalten können sie wieder eingeblendet werden.
Zusätzliche Register und Ordner werden inklusive ihrer Inhalte erst nach Bestätigung gelöscht.
Ordner und Unterordner lassen sich
aufklappen und über die Ordnerbearbeitung verschieben. Die Startansicht zeigt nur die oberste
Ordnerebene; eine Suche durchsucht den jeweiligen Dokumentbereich.
Alle Änderungen werden am gemeinsamen Server gespeichert und bei angemeldeten Benutzern
innerhalb weniger Sekunden aktualisiert. Bei gleichzeitigen Änderungen verhindert der Server
ungewolltes Überschreiben; dann die Ansicht aktualisieren und erneut speichern.
