# Infomaniak: Erstinstallation ohne manuelle Datenbankübernahme

## Das richtige Paket hochladen

`npm run hosting:package` erzeugt unter `output/infomaniak/release-*`:

- `Cockpit-ERSTINSTALLATION-VERTRAULICH.zip`: vollständiger Code, bestehende SQLite-
  Datenbank, Dokumente und Schlüssel. Dieses ZIP nur für die **erste Installation**
  deiner eigenen Node.js-Website verwenden. Es enthält vertrauliche Betriebsdaten
  und Passwort-Hashes, gehört niemals in GitHub und darf nicht öffentlich abgelegt werden.
- `Einrichtung-NUR-FUER-DICH.txt`: persönliche Einrichtungsanleitung und ein zufälliger
  einmaliger Einrichtungscode. Diese Textdatei lokal behalten, **nicht hochladen**.
- `Cockpit-NUR-CODE-Update.zip`: für spätere Updates; enthält keine Betriebsdaten.

## Im Infomaniak Manager

1. Ein Hosting mit einer Website vom Typ **Node.js** wählen.
2. Die Subdomain `betrieb.waermeverbund.ch` zuordnen und deren DNS auf das Hosting
   zeigen lassen. HTTPS/SSL aktivieren.
3. Benutzerdefiniertes Projekt und ZIP-Import wählen. Das vertrauliche Erstinstallations-
   ZIP hochladen. `package.json` liegt direkt an der Wurzel des ZIPs, nicht in einem Unterordner.
4. **Node 24 LTS**, Ausführungsordner **`./`**, Installations-/Build-Befehl
   **`npm ci --omit=dev`**, Startbefehl **`npm start`** einstellen.
5. Den vom Manager vorgegebenen Lauschport verwenden. Der Code liest automatisch `PORT`.
   Port 4173 oder 4175 nicht als festen öffentlichen Port erzwingen.
6. Installation ausführen und die Anwendung starten.

Im Paket startet `npm start` den Produktions-Einstieg `server-hosting.cjs`.
Im lokalen Repository bleibt `npm start` der bisherige Entwicklungsserver.
Es ist kein eigener VPS, kein PHP-Umbau und keine MariaDB erforderlich.

Der Produktionsstarter verwendet standardmässig `https://betrieb.waermeverbund.ch`,
`HOST=0.0.0.0`, die HTTPS-Proxy-Auswertung und den absoluten Ordner `hosting-data`
neben `package.json`. Die Umgebung des Managers bzw. eine separat angelegte
`.env.production` kann diese Werte überschreiben. Der Starter setzt den Produktionsmodus
selbst, damit nicht versehentlich die lokale Demo öffentlich startet.

`hosting-data` darf beim späteren Code-Update **nicht gelöscht, geleert oder mit einem
alten Erstinstallationspaket überschrieben werden**. Auch im Manager keinen Neuimport
wählen, der die gesamte Anwendungsumgebung löscht. Für Code-Updates das NUR-CODE-ZIP
per SSH/SFTP über die Anwendung legen und im Manager neu starten. Bei einem Wechsel
des Hostingprodukts die Daten vorher vollständig sichern.

## Einmalige geschützte Ersteinrichtung

Die bisherigen weiteren Benutzer wurden aus der Liste der Login-Konten entfernt.
Historische Namen, Urheber, Erwähnungen und Dokumentverknüpfungen bleiben erhalten;
es wurden keine Logbucheinträge oder Dokumente gelöscht. Die früheren Konten werden
ohne Passwort-Hashes in `retiredUsers` als historische Profile aufbewahrt. Du kannst
die Benutzernamen später neu anlegen.

Das aktuelle Passwort von **WVM-admin** bleibt lokal unverändert. Lokal erinnert ein
Hinweis daran, es vor der Online-Freigabe zu ändern. Im vollständigen Erstinstallations-
paket wird das Cockpit zunächst durch eine separate Ersteinrichtung geschützt:

1. `https://betrieb.waermeverbund.ch` öffnen.
2. Den Einrichtungscode aus deiner persönlichen Textdatei eingeben.
3. Das bisherige Passwort von WVM-admin eingeben.
4. Ein **neues, anderes** Admin-Passwort mit mindestens 12, besser 20 Zeichen festlegen.
5. Danach normal als WVM-admin mit dem neuen Passwort anmelden.

Erst danach sind Cockpit und Betriebsdaten zugänglich. Das bisherige Passwort allein
öffnet die Online-Anwendung nicht. Der Einrichtungscode wird nur als SHA256-Hash
im Paket gespeichert, ist einmalig und läuft 30 Tage nach Paketerstellung ab.
Nach Ablauf ein neues Paket erstellen. Ist das Admin-Passwort bereits lokal über
«Mein Passwort ändern» sicher geändert worden, ist die besondere Ersteinrichtung
nicht mehr erforderlich.

Nach der Freigabe unter «Cockpit verwalten → Benutzer & Zugänge» die richtigen
Benutzer anlegen. Zufällige Startpasswörter müssen beim ersten Login geändert werden.

## Datei-Uploads und Virenprüfung

Auf deinen ausdrücklichen Wunsch sind neue Uploads im Infomaniak-Paket ohne
Virenscanner erlaubt (`COCKPIT_SCAN_MODE=disabled`). Anmeldung, Rechte sowie
Dateiformat-, Grössen- und Speicherprüfungen bleiben aktiv. Eine automatische
Malware-Prüfung entfällt; ein Scandienst wird nicht benötigt.

Optional lässt sich mit `COCKPIT_SCAN_MODE=required` eine verpflichtende Prüfung
einschalten. Dann blockieren fehlende Scanner und Scannerfehler neue Uploads.
Ein lokaler ClamAV-Dienst
kann über `COCKPIT_CLAMAV_HOST` und `COCKPIT_CLAMAV_PORT` eingestellt werden;
Port 3310 darf nicht ungeschützt öffentlich freigegeben werden.

Alternativ unterstützt `COCKPIT_SCAN_URL` einen privaten HTTPS-Scan-Endpunkt.
Er erhält einen POST mit dem rohen Dateiinhalt und `X-Content-SHA256`, optional
`Authorization: Bearer ...` aus `COCKPIT_SCAN_TOKEN`. Eine Freigabe benötigt HTTP 200
mit `{"clean":true,"sha256":"SHA256-DER-GEPRÜFTEN-DATEI"}`; bei Malware `clean:false`.
Ein beliebiger kommerzieller Dienst benötigt einen zu seiner API passenden Adapter.
Es gibt keine Weiterleitungen; TLS-Zertifikate werden geprüft. Keine vertraulichen
Betriebsdateien werden ohne ausdrücklich konfigurierten Endpunkt extern übertragen.

Diese Anleitung behauptet keine bereits erfolgte Prüfung in einem echten Infomaniak-
Konto. Konkretes Dateisystem, Proxyheader und Upload-Zeitlimits
können erst im gebuchten Hosting getestet werden. Die Ersteinrichtung und der normale
Start werden lokal mit einer getrennten Datenkopie und simulierten HTTPS-Proxyheadern
geprüft. Keine Betriebsdaten werden an externe Dienste gesendet.

## Sicherungen und Wiederherstellung

Die Anwendung erstellt tägliche Sicherungen unter `hosting-data/backups` und behält
sieben automatische Sicherungen. Unveränderte Dokumente werden nach Möglichkeit
per Hardlink gesichert. Zusätzlich eine geschützte externe Sicherung vorsehen.
`npm run backup` im Hostingpaket sichert dieselbe Hosting-Datenquelle.

Bei einer Wiederherstellung nur ein leeres Ziel verwenden. Datenbank und Dokumente
gehören zusammen; `secret.key` unbedingt erhalten. Die Sicherung enthält jetzt auch
den Lesestatus von Erwähnungen. Nach Wiederherstellung sind alte Sitzungen ungültig.

## Offizielle Hosting-Einstellungen

- [Node.js-Konfiguration und PORT](https://www.infomaniak.com/de/support/faq/2535/konfiguration-einer-nodejs-website-bei-infomaniak-andern)
- [Node.js-Hosting](https://www.infomaniak.com/de/hosting/nodejs-hosting)
- [ZIP-Import einer eigenen Node.js-Website](https://www.infomaniak.com/fr/support/faq/1568/installer-un-contenu-lovabledev-sur-un-hebergement-web-infomaniak)
