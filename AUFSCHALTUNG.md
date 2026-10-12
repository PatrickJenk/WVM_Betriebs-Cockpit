# Aufschaltung des Wärmeverbund Betriebs Cockpits

Anleitung für Infomaniak · Stand 7. Oktober 2026

Diese Anleitung führt dich von der bestätigten Demo bis zur öffentlichen Anmeldung. Sie enthält die technischen Angaben für den Hosting-Support. Es wurde noch kein Hosting eingerichtet oder bestellt. Domainnamen und Serverpfade in den Beispielen musst du ersetzen.

## Die Reihenfolge

1. Anforderungen auf Seite 2 vom Infomaniak-Support bestätigen lassen und passenden Tarif wählen.
2. Domain oder Subdomain, verantwortliche Personen und externen Backup-Speicher organisieren.
3. Dokumente und Demo prüfen, Konten vorbereiten und sichere Passwörter festlegen.
4. Anwendungscode hochladen und Produktionskonfiguration eintragen.
5. Den endgültigen Datenstand sichern und separat auf den Server übernehmen.
6. HTTPS, Anmeldung, Dateien und Rechte mit Testkonten prüfen. Erst danach Benutzer informieren und freigeben.

## Was du noch organisieren musst

| Benötigt | Was du festlegen oder beschaffen musst |
| --- | --- |
| Hosting und Zugriff | Infomaniak-Konto mit Berechtigung zum Verwalten der Node.js-Webseite; geeigneter Tarif erst nach Supportbestätigung |
| Webadresse | Eigene Domain oder Subdomain, zum Beispiel cockpit.deine-firma.ch; Zugriff auf die DNS-Verwaltung |
| HTTPS und Proxy | SSL-Zertifikat, HTTP-Umleitung, geschützter Node-Port und bestätigte Proxy-Konfiguration |
| Virenscanner | Privater erreichbarer ClamAV-Dienst, Pflege der Signaturen und zuständige Person |
| Daten und Speicher | Dauerhafter Datenordner mit Schreibrechten; Platz für Uploads, Datenbank, Sicherungen und Wachstum |
| Externe Sicherung | Getrennter geschützter Backup-Speicher und Verantwortlicher für Sicherung und Wiederherstellung |
| Benutzer | Liste mit vollständigen Namen, eindeutigen Kürzeln und Unternehmen WVM oder EPC; benannte Admins |
| Betrieb | Verantwortliche für Updates, Support, Erreichbarkeit, Datenschutz und Kosten |

Ein Mailserver ist für den aktuellen Login nicht erforderlich. E-Mail-, SMS- und Authenticator-Anmeldung sind deaktiviert. Der Infomaniak-Manager kann unabhängig davon eine eigene Kontosicherung verlangen.

## Bereits vorhanden

Das Paket output/release/Waermeverbund-Cockpit-Infomaniak.zip enthält Code, Handbuch und Konfigurationsvorlage. Die SHA256-Datei daneben enthält die Prüfsumme. Betriebsdaten und echte Uploads sind nicht enthalten und müssen getrennt gesichert werden.

Aktuelle Bestandsaufnahme: 26 gespeicherte Dateien, zusammen ungefähr 65 MB, ohne Datenbank und Sicherungen. Das ist ein Momentstand, keine Speicherempfehlung. Plane zusätzlich alle noch einzuspielenden Dokumente, laufende PDF-Anhänge und Backup-Aufbewahrung ein. Die Anwendungslimits von 100 GB insgesamt und 10 GB je Benutzer sind Obergrenzen, kein gebuchter Speicher.

<!-- PAGE -->
## Technische Angaben für Infomaniak

Diesen Abschnitt kannst du dem Support vor der Bestellung senden. Die Datenbank ist SQLite; ein MySQL-Angebot allein erfüllt diese Anforderung nicht.

### Anfragetext zum Kopieren

Wir möchten ein internes Wärmeverbund Betriebs Cockpit für ungefähr 30 Benutzer hosten. Es handelt sich um eine Node.js-Anwendung mit serverseitiger Anmeldung, Logbuch und PDF-/Bild-Upload. Bitte bestätigen Sie einen geeigneten Tarif und folgende Anforderungen:

1. Node.js in einer unterstützten LTS-Version, mindestens 22.16, mit dem eingebauten Modul node:sqlite. Kein eigener Build oder Framework-Server erforderlich.
2. Ein dauerhaft beschreibbarer lokaler Datenordner ausserhalb öffentlicher Webverzeichnisse. SQLite benötigt WAL-Dateien und lokale Schreibsperren. Dateien müssen Neustarts und Code-Updates überleben. Wir planen einen Node-Prozess, keine verteilten Instanzen.
3. HTTPS mit Zertifikat und HTTP-Umleitung. Der Node-Port darf nur vom Hosting-Proxy erreichbar sein. Der Proxy muss X-Forwarded-Proto und die Client-IP zuverlässig und gegen Manipulation geschützt weiterreichen.
4. Ein ClamAV-Dienst im selben System oder einem geschützten privaten Netz. Die Anwendung nutzt das TCP-Protokoll INSTREAM, standardmässig Port 3310. Es gibt aktuell keine HTTP-Scanner-Anbindung. Können wir diesen Dienst installieren oder privat anbinden, und welche Ports sind erlaubt?
5. Uploads bis 60 MB mit ausreichender Proxy-Limitierung und Zeitlimits. ClamAV StreamMaxLength und Scan-Limits müssen mindestens dazu passen.
6. Möglichkeit, Code per ZIP oder SFTP zu übertragen und Node-Kommandos für Datenwiederherstellung und Sicherungen auszuführen. Bitte den tatsächlichen SSH-/Terminalzugang für diesen Tarif bestätigen.
7. Externe Sicherungen von Datenbank, Uploads und geheimem Schlüssel, geschützter Download der Sicherungen und Überwachung von Speicherplatz und Dienstzustand. Bitte erläutern, welche Leistungen enthalten sind und welche wir selbst betreiben müssen.

Bitte nennen Sie den passenden Tarif, Speicherplatz, laufende Kosten, Zugriffsmöglichkeiten und Verantwortlichkeiten. Falls der verwaltete Node.js-Tarif den Scanner oder persistenten SQLite-Speicher nicht unterstützt, benötigen wir eine geeignete alternative Infrastruktur bei Infomaniak und Unterstützung bei deren Betrieb.

### Anwendungskonfiguration

| Einstellung | Wert für diese Anwendung |
| --- | --- |
| Ausführungsordner | Ordner, in dem package.json und server.cjs liegen |
| Installation | npm ci |
| Startbefehl | npm run start:production |
| Einstiegspunkt | server.cjs |
| Build | Keine Kompilierung nötig; npm ci als Vorbereitung möglich |
| Port | PORT aus dem Infomaniak Manager, keinen festen lokalen Port erzwingen |
| Datenbank | SQLite über node:sqlite, keine externe SQL-Datenbank |

Die offizielle Anleitung erlaubt eine eigene Node.js-Anwendung und ZIP-/SFTP-Import. Das bestätigt nicht automatisch alle oben genannten Zusatzanforderungen. Quellen: Infomaniak FAQ 2537 und 2535 auf Seite 6.

<!-- PAGE -->
## Die lokale Version für die Übernahme vorbereiten

Die Demo bleibt nutzbar. Diese Schritte führst du erst durch, wenn ihr den Funktionsstand bestätigt habt und die endgültige Datenübernahme bevorsteht. Die Anleitung ändert selbst keine Passwörter und löscht keine Muster.

### Daten und Benutzer bereinigen

Prüfe Standorte, Anlagen, Ordner und Dokumente. Lade die endgültigen Dokumente hoch. Entscheide, welche Muster im Logbuch bleiben sollen; der Admin kann nicht benötigte Muster löschen. Erstelle eine Benutzerliste mit Namen, Kürzel und WVM/EPC. Neue Benutzer können vor der Übernahme oder später im Hosting hinzugefügt werden.

Für jedes aktive Admin-Konto vor dem Export ein einzigartiges Passwort festlegen: mindestens 12 Zeichen, empfohlen mindestens 20. Normale aktive Benutzer müssen ein Passwort mit mindestens 12 Zeichen festlegen oder vom Admin ein neues zufälliges Startpasswort erhalten. Für ältere Passwörter muss die Mindestlänge durch einen neuen Passwortwechsel bestätigt werden.

Die bekannten Demo-Passwörter 9876 und ChangeMe123 sind für alle aktiven Produktionskonten gesperrt, auch wenn ein Passwortwechsel noch aussteht. Zum Zurücksetzen «Benutzer verwalten» verwenden; neue zufällige Startpasswörter sicher und persönlich weitergeben. Die Zwei-Faktor-Funktion bleibt deaktiviert.

### Funktionen vor dem Export prüfen

Im Projektordner in PowerShell ausführen:

npm.cmd run check

Die Tests verwenden getrennte Daten. Prüfe zusätzlich die eigenen Dokumente, PDF-Vorschau und mehrere echte Benutzerkonten. Nutze getrennte Browserprofile für Admin und normale Benutzer.

### Den endgültigen Stand sichern

Vereinbare einen Zeitpunkt, ab dem niemand mehr Änderungen in der lokalen Version erfasst. Stoppe beide lokalen Server und den LAN-Server in ihren jeweiligen Terminals mit Strg+C; falls sie im Hintergrund laufen, nur die zu diesem Projekt gehörenden Prozesse beenden lassen. Erstelle dann im Projektordner:

npm.cmd run backup

Das Kommando gibt den Pfad eines neuen Ordners storage/backups/manual-… aus. Übertrage später den gesamten Ordner, nicht nur die Datei state.json. Enthalten sein müssen manifest.json, state.json, uploads.json, audit.json, secret.key und files mit den gesicherten Dokumenten.

Diese state.json ist der aktuelle Export innerhalb der Sicherung. Die Datei storage/state.json direkt im Datenordner ist dagegen ein alter Migrationsstand und darf nicht für die Übernahme verwendet werden. Eine laufende SQLite-Datei allein zu kopieren ist ebenfalls nicht der vorgesehene Weg.

Bewahre eine zusätzliche geschützte Kopie auf. Sicherungen enthalten Betriebsdaten, Passwort-Hashes und Schlüssel; übertrage sie nur über einen sicheren Zugang, nicht per öffentlichem Link oder unverschlüsselter E-Mail. Noch nicht starten, solange die endgültige Sicherung nicht vollständig übertragen ist.

<!-- PAGE -->
## Anwendung und Konfiguration im Hosting einrichten

### Projekt importieren

Nach der Supportbestätigung im Infomaniak Manager beim Hosting eine Webseite hinzufügen, ein Projekt mit erweiterten Technologien und Node.js wählen. Ordne die gewünschte Domain oder Subdomain zu und verwende die individuelle Einrichtung mit dem vorbereiteten ZIP-Paket. Die Oberfläche kann sich ändern; die offiziellen Schritte stehen in FAQ 2537.

Stelle sicher, dass package.json direkt im eingestellten Ausführungsordner liegt. Ein zusätzlich entpackter Unterordner muss entsprechend als Ausführungsordner angegeben werden. Verwende npm ci für die Installation und npm run start:production als Startbefehl. In Produktion weder npm start noch den Watch-Modus verwenden.

### Produktionswerte festlegen

Kopiere .env.example nach .env.production und ersetze die Beispiele. Alternativ setzt du dieselben Variablen im Manager. Verwende eine klare Konfigurationsquelle; die Datei mit echten Werten gehört nicht ins öffentliche Verzeichnis oder in ein weitergegebenes Codepaket.

| Variable | Was du eintragen musst |
| --- | --- |
| NODE_ENV | production |
| COCKPIT_MFA_ENABLED | 0 |
| HOST | 0.0.0.0, hinter dem geschützten Hosting-Proxy |
| PORT | Vom Manager geliefert; nicht auf 4173 oder 4175 festlegen |
| COCKPIT_ORIGIN | Exakte HTTPS-Adresse ohne Pfad und ohne abschliessenden Schrägstrich |
| COCKPIT_DATA_DIR | Absoluter, dauerhafter und beschreibbarer privater Datenpfad |
| COCKPIT_TRUST_PROXY | 1 nur nach Bestätigung des vertrauenswürdigen Proxys |
| COCKPIT_MAX_FILE_MB | 60 oder eine abgestimmte niedrigere Grenze |
| COCKPIT_USER_QUOTA_MB | 10240 oder an gebuchten Speicher angepasste Grenze |
| COCKPIT_TOTAL_QUOTA_MB | 102400 oder an gebuchten Speicher angepasste Grenze |
| COCKPIT_CLAMAV_HOST | Bestätigte lokale oder private Scanner-Adresse |
| COCKPIT_CLAMAV_PORT | Bestätigter privater Scanner-Port, normalerweise 3310 |

Beispiel für die öffentliche Adresse: COCKPIT_ORIGIN=https://cockpit.deine-firma.ch. Dieser Name muss mit der tatsächlich benutzten Browseradresse übereinstimmen. Für eine andere Adresse oder Subdomain reicht nicht bloss eine Weiterleitung ohne passende Konfiguration.

### HTTPS und Virenscanner

Domain-DNS nach den konkreten Vorgaben des Managers einrichten, SSL-Zertifikat aktivieren und HTTP auf HTTPS umleiten. Keine vermutete IP-Adresse verwenden. Ein Dienstleister muss sicherstellen, dass der Node-Port und private Datenverzeichnisse nicht öffentlich direkt erreichbar sind.

Der Scanner muss erreichbar sein und aktuelle Signaturen erhalten. Ein beliebiger öffentlicher Scanner auf Port 3310 ist keine sichere Lösung. Ohne funktionierenden Scanner sind neue Uploads in Produktion gesperrt. Kläre diese Einrichtung vor der Freigabe; vorhandene Dokumente bleiben gespeichert.

<!-- PAGE -->
## Daten übernehmen und Freigabe prüfen

### Wiederherstellung auf dem Hosting

Die Anwendung im Manager zunächst stoppen. Die vollständige Sicherung in einen privaten Importordner übertragen. Der Zielordner für COCKPIT_DATA_DIR muss leer sein; das Wiederherstellungsskript überschreibt absichtlich keine bestehenden Daten. Ein automatischer Fehlstart kann bereits eine SQLite-Datei angelegt haben: in diesem Fall einen neuen leeren Datenpfad wählen, keine vorhandenen Daten unbesehen löschen.

Im Projektordner über den bestätigten Terminalzugang ausführen. Beispielpfade durch die vom Hosting mitgeteilten absoluten Pfade ersetzen:

node --env-file=.env.production tools/restore.cjs /privater/import/manual-123456789

Dieser Befehl setzt voraus, dass .env.production korrekt ausgefüllt ist und der Datenpfad darin auf das leere Ziel zeigt. Bei ausschliesslicher Manager-Konfiguration müssen dieselben Umgebungsvariablen auch im Terminal verfügbar sein. Das Skript prüft die Sicherungsdateien anhand ihrer Prüfsummen und erstellt die SQLite-Datenbank. Die Benutzer müssen sich danach neu anmelden. Der Gesehen-Stand des Umschlags kann nach einer Wiederherstellung zurückgesetzt sein.

Anschliessend im Manager mit npm run start:production starten. Prüfe die Konsole. Ein fehlendes Datenverzeichnis, eine falsche HTTPS-Adresse oder ein unsicheres aktives Benutzerpasswort verhindert den Start. Probleme beheben, nicht durch Wechsel in den Entwicklungsmodus umgehen.

### Abnahme vor dem Verteilen der Adresse

1. Die endgültige HTTPS-Adresse öffnen. HTTP muss umleiten; das Zertifikat muss gültig sein. Ohne Anmeldung dürfen Betriebsdaten und Handbuch nicht abrufbar sein.
2. Admin anmelden. Standorte, Dokumentanzahl und wichtige PDFs mit dem lokalen Ausgangsstand vergleichen. Passwortänderung und das Anlegen eines normalen Testkontos prüfen.
3. Normales Konto in getrenntem Browser anmelden. Den erzwungenen ersten Passwortwechsel durchführen. Eintrag erstellen, ergänzen, Status und Priorität ändern sowie @Erwähnung testen.
4. Umschlag prüfen: Rot bei ungesehener Erwähnung, nach Klick Orange bei offener Pendenz oder Blau bei erledigten Einträgen. Dashboard und Logos müssen alle Filter zurücksetzen.
5. Eigene PDF hochladen, Vorschau und Download testen. Eigene Datei umbenennen, verschieben und löschen. Admin- und Fremd-Uploads dürfen normale Benutzer nicht ändern oder löschen.
6. Admin kann Einträge löschen und Verlauf ansehen. Benutzerhandbuch muss aus der Navigation mit Download erreichbar sein.
7. Eine neue Sicherung erstellen und deren Wiederherstellung in einem getrennten leeren Testverzeichnis prüfen. Die aktive Produktionsdatenbank dabei nicht ersetzen.
8. Neustart im Manager durchführen. Einträge und Dateien müssen erhalten bleiben. Danach erst Benutzer anlegen, Startpasswörter verteilen und die Adresse freigeben.

Die lokale Version kann danach mit npm.cmd start oder npm.cmd run start:lan wieder zum Testen laufen. Ab der Übernahme sind lokale und gehostete Daten getrennt. Neue Betriebsarbeiten nur noch im freigegebenen Hosting erfassen; lokale Änderungen werden nicht automatisch übertragen.

<!-- PAGE -->
## Betrieb und spätere Änderungen

### Sicherungen und Zuständigkeiten

Die Anwendung erstellt bei laufendem Server täglich eine Sicherung und behält sieben automatische Stände. Manuelle Sicherungen werden nicht automatisch entfernt. Sichere die Daten zusätzlich regelmässig verschlüsselt ausserhalb des gleichen Hosting-Datenträgers. Prüfe gelegentlich eine echte Wiederherstellung und die verfügbare Kapazität.

Für manuelle Sicherungen auf dem Hosting mit ausgefüllter Konfigurationsdatei verwenden:

node --env-file=.env.production tools/backup.cjs

Die Ausgabepfade sind privat zu behandeln. Ein Provider-Backup ersetzt den Wiederherstellungstest nicht. Ein Backup benötigt Platz für Dateien und Datenbank; bei Hardlink-Unterstützung können unveränderte Dateien Platz sparen. Die Quartalsregel blendet erledigte Einträge nur aus und gibt keinen Speicher frei.

### Code aktualisieren

Vor einem Update eine Sicherung erstellen. Nur Anwendungscode und gegebenenfalls das Handbuch ersetzen; den privaten Datenordner, die Produktionskonfiguration und den geheimen Schlüssel erhalten. Installation und Neustart kontrolliert durchführen und wichtige Funktionen prüfen. Keine neue lokale Demo-Datenbank über die Produktionsdaten kopieren.

Bei Fehlern zuerst Dienst und Protokolle prüfen. Bei Upload-Fehlern Scanner, Quotas und Proxy-Limits kontrollieren. Bei Login-Problemen exakte Domain, HTTPS-Origin, Proxy und Benutzerpasswörter prüfen. Eine Wiederherstellung nur in ein leeres Ziel durchführen und erst nach Prüfung auf diesen Stand umschalten.

### Angaben vor der Übergabe ausfüllen

| Angabe | Dein Wert |
| --- | --- |
| Öffentliche HTTPS-Adresse | Noch festlegen |
| Hosting-Produkt und Vertragsinhaber | Noch bestätigen |
| Verantwortlicher Admin und Stellvertretung | Noch festlegen |
| Ausführungsordner der Anwendung | Vom Hosting bestätigen lassen |
| Absoluter Datenpfad | Vom Hosting bestätigen lassen |
| Scanner-Adresse und Port | Vom Hosting bestätigen lassen |
| Backup-Ziel und zuständige Person | Noch festlegen |
| Update- und Supportverantwortlicher | Noch festlegen |
| Zeitpunkt der endgültigen Datenübernahme | Noch vereinbaren |

### Offizielle Quellen und Umfang der Anleitung

Die Anforderungen an SQLite, Scanner, Passwörter und Datenübernahme stammen aus dieser Anwendung. Die Eignung eines konkreten Tarifs ist damit noch nicht bestätigt. Der Manager bietet keine automatische vollständige Administration deiner Anwendung; kläre Installation, Pflege und Wiederherstellung mit dem Support oder einem Dienstleister.

Infomaniak FAQ 2537 beschreibt Erstellung und individuellen Codeimport:
https://www.infomaniak.com/en/support/faq/2537/create-a-nodejs-website-with-infomaniak

Infomaniak FAQ 2535 beschreibt Ausführungsordner, Startbefehl und den Manager-Port:
https://www.infomaniak.com/de/support/faq/2535/konfiguration-einer-nodejs-website-bei-infomaniak-andern

Infomaniak FAQ 2054 nennt Einschränkungen für SSH-Schlüssel bei Node.js-Webseiten. Deshalb den konkreten Terminalzugang vorab bestätigen lassen:
https://www.infomaniak.com/de/support/faq/2054/mit-ssh-schlussel-anmelden

Geprüft am 7. Oktober 2026. Die Befehle sind projektspezifisch; Beispiele für Domain und Pfade sind keine bereits eingerichteten Werte.
