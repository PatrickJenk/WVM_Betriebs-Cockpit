# Konfiguration

Vorlage: `.env.example`. Produktion über private `.env.production` oder die
Manager-Umgebung konfigurieren. `start:production`, `db:migrate` und `mail:run`
laden die Datei, sofern vorhanden. `deploy:check` liest sie ebenfalls, ohne bereits
gesetzte Prozessvariablen zu ersetzen. `npm start` lädt diese Datei nicht.

## Anwendung

| Variable | Bedeutung / tatsächlicher Standard |
| --- | --- |
| `NODE_ENV` | `production` aktiviert Produktionsschutz; der Hostingstarter setzt diesen Modus selbst |
| `COCKPIT_DATA_DIR` | Absoluter privater dauerhafter Datenpfad. Lokal `storage/`, alter ZIP-Starter `hosting-data/`. Für Git-Betrieb ausdrücklich setzen |
| `COCKPIT_ORIGIN` | Exakte HTTPS-Origin ohne Pfad/Schrägstrich. Für Git-Betrieb explizit; alte Starterwerte bestätigen keine tatsächliche Domain |
| `HOST` | Lokal `127.0.0.1`, LAN/Produktionsstarter `0.0.0.0`; Hosting-Netzgrenzen beachten |
| `PORT` | Vom Manager vorgegeben. Lokal 4173, LAN 4175; keinen lokalen Port öffentlich erzwingen |
| `COCKPIT_TRUST_PROXY` | `1` nur hinter vertrauenswürdigem HTTPS-Proxy mit exklusivem Node-Zugriff. Alter Hostingstarter setzt standardmässig `1` |
| `COCKPIT_MAIL_DISABLED` | `1` sperrt sämtlichen SMTP-Versand einschliesslich Testmails. Sonst gilt zusätzlich die Aktivierung im Adminbereich |
| `COCKPIT_TEST_PORT` | Nur isolierter Teststarter; Standard 4183 |

Die private Konfiguration muss echte, ermittelte Werte enthalten. Die Vorlage
enthält Platzhalter. Keine Zugangsdaten in URLs/Shellbefehlen. Der Node-Prozess
benötigt Schreibrechte auf Datenordner, SQLite/WAL/SHM und `files/`. Schlüssel
privat halten; keine pauschalen `777`-Rechte.

## Uploads und Scanner

| Variable | Standard / Wirkung |
| --- | --- |
| `COCKPIT_MAX_FILE_MB` | 60 MB je normalem Upload |
| `COCKPIT_USER_QUOTA_MB` | 10240 MB je Benutzer für normale Uploads |
| `COCKPIT_TOTAL_QUOTA_MB` | 102400 MB insgesamt für normale Uploads |
| `COCKPIT_CONTACT_IMAGE_QUOTA_MB` | 128 MB für Kontaktbilder; max. 2 MB je Bild |
| `COCKPIT_SCAN_MODE` | Scanner-Modul: `required`. Bestehender Hostingstarter/Vorlage: bewusst `disabled` (keine Malware-Prüfung, Format-/Rechteprüfung bleibt) |
| `COCKPIT_CLAMAV_HOST` | Eigener ClamAV-Host, kein Dienst vorausgesetzt |
| `COCKPIT_CLAMAV_PORT` | 3310 |
| `COCKPIT_SCAN_URL` | Alternativ eigener privater HTTPS-Scanner |
| `COCKPIT_SCAN_TOKEN` | Optionales privates Bearer-Token des HTTPS-Scanners |

`required` blockiert bei fehlendem Scanner Produktionsuploads. Die bestehende
Betriebsentscheidung vor einem Update bewahren; nicht still auf `disabled`
wechseln. Auch Kontaktbilder verwenden die Scanner-Vorgabe.

## SMTP und Werkzeuge

### Backup-Administrator einrichten

Die zuständige Betriebsperson führt den Setup in einem interaktiven Terminal
mit Zugriff auf das private, bereits initialisierte Cockpit-Datenverzeichnis
aus. `COCKPIT_DATA_DIR` muss ausdrücklich auf diesen absoluten Pfad zeigen.
Der Befehl kann die private `.env.production` aus dem Projektverzeichnis laden.

```sh
npm run setup:backup-admin
```

Beim Einrichten werden ein freies Kürzel und zweimal das Notfallpasswort
abgefragt. Die Passworteingabe bleibt verborgen. Ein vom Passwortmanager
generiertes Passwort mit mindestens 20 Zeichen verwenden und beide
Zugangsdaten im Notfall-Tresor hinterlegen. Das Konto dient ausschliesslich
Notfällen. Es hat alle administrativen Rechte einschliesslich SMTP und
Rollenverwaltung. Die fachliche Rolle «Leitung» ist unabhängig davon.

Die normale Benutzerverwaltung kann das Notfallkonto weder bearbeiten noch
deaktivieren, zurücksetzen oder löschen. Für eine Passwortrotation denselben
Befehl mit `-- --rotate` aufrufen. Dabei werden bestehende Sitzungen des
Notfallkontos widerrufen.

### Benutzereinladungen

Neue Konten melden sich mit ihrem Kürzel an. Für bestehende Konten bleiben die
bisherigen Anmeldenamen gültig. Das Cockpit sendet Startpasswörter über den
bereits eingerichteten und aktivierten SMTP-Versand. Beim ersten Login muss
das Passwort geändert werden. SMTP nimmt die Nachricht zur Zustellung an.
Bei einem gemeldeten Fehler kann ein Admin den Versand am vorhandenen Konto
erneut auslösen. Jeder erneute Versand ersetzt das vorige Startpasswort und
widerruft bestehende Sitzungen des Kontos.

SMTP-Host, Port, Benutzername, verschlüsseltes Passwort, TLS, Absender, Reply-To,
Aktivierung und Mail-Link-Basis-URL liegen in SQLite. Keine `SMTP_PASSWORD`-
Umgebungsvariable ist implementiert. Siehe [SMTP](EMAIL_NOTIFICATIONS.md).

- `COCKPIT_APP_STOPPED=1`: Bestätigung des Operators für `deploy.sh --apply`, dass
  Webprozess und Mail-Cronjob gestoppt sind. Das Script beweist den Managerzustand
  nicht selbst. Kein Runtime-Schalter.
- `OPENSSL`: tatsächlicher OpenSSL-Pfad für Tests.
- `BASH_BIN`: optionaler Bash-Pfad für den lokalen Deployment-Test; Windows
  verwendet sonst Git Bash. Auf dem Hosting wird `bash` direkt verwendet.
- `NODE_EXTRA_CA_CERTS`: nur für bewusst vertraute eigene Testzertifikate; Tests
  setzen dies für Kindprozesse. TLS-Prüfung nicht global ausschalten.

SSH-/GitHub-Zugänge sind separate Konten. Es gibt keine Actions-Secrets,
Deploy-Webhooks oder automatische Repository-Synchronisierung.

## Schrift der Sitzungsprotokolle

`COCKPIT_VERDANA_DIR` kann auf einen privaten Serverordner mit den lizenzierten Dateien `verdana.ttf` und `verdanab.ttf` zeigen. Das Cockpit verwendet sonst die Verdana-Installation des Systems, sofern sie im Windows-Schriftenordner oder unter `/usr/share/fonts/truetype/msttcorefonts` liegt. Falls Verdana fehlt, werden die PDFs in Helvetica erzeugt.
