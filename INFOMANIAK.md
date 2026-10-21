# Anmeldung ohne Zwei-Faktor-Pflicht

Die neue Anleitung für ZIP-Erstinstallation, Passwortwechsel und Datenübernahme steht
in **[INFOMANIAK-START.md](INFOMANIAK-START.md)**. Das neue vollständige Paket wird mit
`npm run hosting:package` erzeugt. Die ältere ZIP-Datei unter `output/release` enthält
diese Ersteinrichtung noch nicht und soll dafür nicht mehr verwendet werden.

Auf Wunsch ist die Zwei-Faktor-Anmeldung deaktiviert (`COCKPIT_MFA_ENABLED=0`).
Es werden weder Authenticator-App noch Mail- oder SMS-Dienst gebraucht.
Der Admin sollte ein einzigartiges Passwort mit mindestens 20 Zeichen verwenden.
Anmeldebegrenzung, sichere Sitzungen, HTTPS-Pflicht und serverseitige Rechte bleiben aktiv.
Die folgenden Hinweise zur Authenticator-Einrichtung gelten nur bei einer optionalen
späteren Aktivierung (`COCKPIT_MFA_ENABLED=1`).

# Weiterentwickeln und später bei Infomaniak betreiben

## Lokal bleibt alles testbar

`npm start` startet weiterhin die lokale Testversion mit automatischem Neuladen.
`npm run start:lan` startet zusätzlich für Geräte im gleichen vertrauenswürdigen Netzwerk.
Die vorhandenen Konten und Passwörter bleiben beim Update erhalten. Das bisherige
Admin-Passwort ist nur zum lokalen Testen gedacht; es verhindert den Produktionsstart.
Unter **Mein Passwort ändern** kann jeder sein Passwort ändern. Unter **Benutzer
verwalten** sieht der Admin das Sicherheitsprotokoll. Zwei-Faktor-Anmeldung bleibt
deaktiviert, solange `COCKPIT_MFA_ENABLED=0` gesetzt ist. Neue Benutzer und zurückgesetzte Konten erhalten jetzt ein
zufälliges Startpasswort, das einmal angezeigt wird. Beim ersten Login muss es geändert werden.

## Daten und Sicherungen

Beim ersten Start wird `storage/state.json` automatisch und unverändert in
`storage/cockpit.sqlite` übernommen. Vorher entsteht eine JSON-Sicherung.
Ab dann ist SQLite die aktive Datenquelle: `state.json` ist nur noch ein alter
Migrationsstand und darf nicht zur Bearbeitung der aktuellen Daten verwendet werden.
Die Binärdateien bleiben in `storage/files`; bestehende Passwort-Hashes bleiben erhalten.
SQLite verwendet Transaktionen, WAL und Schreibsperren. Ein dauerhafter lokaler
Datenträger ist erforderlich; kein Netzlaufwerk, keine getrennten Datenkopien je Instanz.

Der Server erstellt täglich eine gemeinsame Sicherung von Daten, Dateien und
Verschlüsselungsschlüssel. Sieben automatische Sicherungen bleiben erhalten,
manuelle Sicherungen werden nicht automatisch gelöscht. Unveränderte Dateien werden
nach Möglichkeit als Hardlinks gesichert und benötigen nicht täglich nochmals ihren
gesamten Speicherplatz. Dateien im Datenverzeichnis niemals manuell überschreiben.
Nicht mehr referenzierte Uploads werden nach 48 Stunden bereinigt. Archivierte
Logbucheinträge bleiben für Admins erhalten und werden **nicht** quartalsweise physisch gelöscht.

Manuelle Sicherung: `npm run backup`. Wiederherstellung ausschliesslich in ein leeres
Verzeichnis (PowerShell, Beispiel):

```powershell
$env:COCKPIT_DATA_DIR = 'C:\Cockpit-Wiederherstellung'
node tools/restore.cjs 'C:\Pfad\zur\Sicherung'
```

Sicherungen enthalten sensible Daten und müssen geschützt werden. Zusätzlich
regelmässig verschlüsselt auf einen getrennten Datenträger bzw. externen Backup-Speicher
kopieren: Sicherungen auf derselben SSD schützen nicht vor SSD-Ausfall.
Wiederherstellungen melden alle Benutzer ab; Zwei-Faktor-Schlüssel bleiben erhalten.

## Erst beim tatsächlichen Hosting einrichten

1. Im Infomaniak Manager ein Node.js-Hosting mit einer unterstützten LTS-Version
   auswählen (Node 24 LTS empfohlen, mindestens Node 22.16 für `node:sqlite`).
2. Die bestehenden Daten sichern. Einen eigenen dauerhaften Datenordner ausserhalb
   von `public` und `src` einrichten. Die **gesamte** Sicherung einschliesslich
   `secret.key` mit `tools/restore.cjs` in diesen leeren Ordner übernehmen.
   Vor der Übernahme den lokalen Server für den endgültigen Datenstand stoppen.
3. Domain und SSL-Zertifikat aktivieren. HTTP am vorgeschalteten Webserver zu HTTPS
   umleiten. Der Node-Port darf ausschliesslich vom Hosting-Proxy erreichbar sein.
4. `.env.example` nach `.env.production` kopieren bzw. dieselben Variablen im Manager
   setzen. `COCKPIT_ORIGIN` muss exakt der öffentlichen HTTPS-Adresse ohne abschliessenden
   Schrägstrich entsprechen. `COCKPIT_DATA_DIR` muss absolut und dauerhaft sein.
   `COCKPIT_TRUST_PROXY=1` nur hinter dem beschriebenen vertrauenswürdigen Proxy verwenden.
5. Vor der endgültigen Datenübernahme für jeden aktiven Admin ein eigenes starkes
   Passwort mit mindestens 12 Zeichen festlegen; empfohlen sind mindestens 20 Zeichen.
   Für normale Konten bestehende Passwörter mit mindestens 12 Zeichen neu bestätigen
   oder ein zufälliges Startpasswort über die Benutzerverwaltung setzen. Bekannte
   Demo-Passwörter sind bei allen aktiven Produktionskonten gesperrt. Die Zwei-Faktor-
   Anmeldung bleibt mit `COCKPIT_MFA_ENABLED=0` deaktiviert; nur bei späterer freiwilliger
   Aktivierung müssen Authenticator und Wiederherstellungscodes eingerichtet werden.
6. Ausführungsordner: Projektordner mit `package.json`. Installation: `npm ci`.
   Startbefehl: **`npm run start:production`**. Kein Watch-Modus und keine Dev-Reload-Endpunkte
   im Produktionsbetrieb. Den vom Manager vorgegebenen `PORT` verwenden.
7. Speicherlimits passend zum Tarif einstellen, externe Sicherung einrichten und
   Node.js/Sicherheitsupdates regelmässig installieren. Vor der Freigabe Anmeldung,
   Passwortwechsel, Upload, Download, Rechte und Wiederherstellung testen.

Der Produktionsstart wird bei fehlenden Daten, fehlender HTTPS-Origin, unsicheren
Admin-Zugangsdaten (und bei optional aktivierter MFA fehlender Admin-Zwei-Faktor-Anmeldung) abgebrochen.
Der lokale Entwicklungsmodus wird dadurch nicht abgeschaltet.

Offizielle Konfiguration (Port, Startbefehl, Node-Version und SSL):
[Infomaniak: Node.js-Konfiguration ändern](https://www.infomaniak.com/de/support/faq/2535/eine-nodejs-konfiguration-andern).

## Grenzen, die zum Hosting gehören

Das Infomaniak-Paket erlaubt ausdrücklich Uploads ohne Virenscanner
(`COCKPIT_SCAN_MODE=disabled`). Anmeldung, Rechte, Dateiformat- und Speicherlimits
bleiben aktiv. Eine automatische Malware-Prüfung entfällt. Die folgenden
Scanner-Anforderungen gelten nur bei `COCKPIT_SCAN_MODE=required`:

Die Anwendung prüft Dateiformate und unterstützt ClamAV über `COCKPIT_CLAMAV_HOST`
und `COCKPIT_CLAMAV_PORT`. Im Produktionsmodus sind neue Uploads gesperrt, solange
kein erreichbarer Scanner eingerichtet ist. Bei Scannerfehlern wird die Datei ebenfalls
nicht übernommen. ClamAV muss beim Hosting auf localhost oder in einem geschützten
privaten Netz betrieben werden; Port 3310 niemals öffentlich freigeben. Ob dies im
gewählten Infomaniak-Tarif direkt möglich ist oder ein separater Dienst nötig ist,
ist vor der Freigabe mit dem Provider zu klären. Lokal bleibt der Scanner optional.
Derzeit sind nur angemeldete, vom Admin angelegte Konten zugelassen.
HTTPS, Proxy-Abschirmung, Betriebssystemrechte und externe Backups werden beim
Provider eingerichtet und können hier lokal nicht aktiviert werden.
Die Anwendung setzt keine absolute Sicherheitsgarantie voraus.

## Bereitstellungspaket und Benutzerhandbuch

Das Paket `output/release/Waermeverbund-Cockpit-Infomaniak.zip` enthält den geprüften
Anwendungscode, die Konfigurationsvorlage und das Benutzerhandbuch. Es enthält keine
Betriebsdaten, Uploads, gespeicherten Passwort-Hashes, geheimen Schlüssel oder lokalen Abhängigkeiten.
Daten werden getrennt über eine vollständige Sicherung übernommen.

Das Handbuch unter `resources/Benutzerhandbuch_Waermeverbund_Cockpit.pdf` wird über
`/api/handbook` nur angemeldeten Benutzern angeboten. `?download=1` erzwingt den Download.
Ein neues Handbuch kann später unter demselben Dateinamen ersetzt werden.

Lokal weiterhin `npm.cmd start`, für das LAN `npm.cmd run start:lan` verwenden.
Diese Befehle laden `.env.production` nicht. Die gehostete Seite und localhost haben
nach der Übernahme getrennte Datenbanken; spätere lokale Änderungen werden nicht
automatisch auf das Hosting übertragen. Bei weiteren Veröffentlichungen nur Code
aktualisieren und die bestehenden Hosting-Daten beibehalten.

Bei Infomaniak: Projektordner mit `package.json`, Installation `npm ci`, Start
`npm run start:production`, Node mindestens 22.16 und `PORT` aus dem Manager.
Kein zusätzlicher Build-Schritt ist für diese Anwendung erforderlich. Der Node-Prozess
und sein Datenverzeichnis dürfen nicht öffentlich als statische Dateien erreichbar sein.
Die öffentliche Freigabe erst nach Datenübernahme, Passwortwechseln, HTTPS-Konfiguration,
erfolgreichem Test über die endgültige Domain vornehmen.
