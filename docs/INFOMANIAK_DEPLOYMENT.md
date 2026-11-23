# Infomaniak: bestehende Installation manuell mit Git aktualisieren

Alle hier beschriebenen Produktionsschritte führt der Betreiber manuell aus.

## Zuerst die tatsächliche Installation identifizieren

Das Produktionsrepository verwendet den Branch `main`. Vor dem Update
das tatsächliche Repository und den laufenden Installationspfad bestätigen.

**Nicht vor Ort geprüft:** SSH-Host/Port/Benutzer, Website-Typ, Projektpfad,
Datenpfad, produktive Domain, Prozessverwaltung, aktuelle Produktionsrevision,
GitHub-Authentifizierung und verfügbare geplante Tasks. Die folgenden Eingaben
werden aus deinem Manager und der vorhandenen Installation ermittelt, nicht geraten.

Der Code ist Node.js mit SQLite und benötigt mindestens Node 22.16. Dass Git oder
ein Node-CLI vorhanden ist, beweist noch keinen verwalteten dauerhaften Node-
Webprozess. Falls die bestehende Website nur Apache/PHP ausführt, **nicht diesen
Code darüberkopieren**: Website-Typ und bestehende Backend-Architektur zunächst
mit dem Betreiber/Infomaniak klären. Kein zweites Projekt und keinen Neuimport anlegen.
Infomaniak bietet Node-Umgebungen an; die konkrete Zuordnung des vorhandenen
Produkts bleibt zu prüfen. [Offizielle Produktbeschreibung](https://www.infomaniak.com/fr/hebergement/hebergement-nodejs).

## Teil A: Zugang und bestehende Einrichtung

### 1. Manager und SSH

1. [Infomaniak Manager](https://manager.infomaniak.com/) mit dem bestehenden
   Konto öffnen, richtige Organisation wählen und unter Hosting/Websites das
   bereits verwendete Hosting öffnen. Keine neue Website erstellen.
2. Die bestehende Website auswählen: öffentliche URL, Website-/Anwendungstyp,
   Projekt-/Ausführungsordner, Node-Version, Startbefehl und Logs notieren.
3. Beim Hosting **FTP / SSH** öffnen. Bestehenden Zugang prüfen; falls nötig
   einen Zugang mit **FTP + SSH** erstellen/aktivieren. Bei Node-Umgebungen die
   richtige bestehende Umgebung zuordnen. Reine FTP-Berechtigung genügt nicht.
4. Angezeigten SSH-Host, Benutzer und gegebenenfalls abweichenden Port übernehmen.
   Bei fehlendem Menü erst die eigenen Kontorechte/Produktoptionen prüfen.

Diese Navigationsschritte sind anhand der offiziellen Anleitungen für
[FTP-/SSH-Konten](https://www.infomaniak.com/fr/support/faq/1982/gerer-les-comptes-ftp-ssh)
und [SSH-Konsole](https://www.infomaniak.com/fr/support/faq/1941/se-connecter-en-ssh-et-utiliser-des-commandes-en-ligne)
geprüft. Manager-Beschriftungen können von der Anzeigesprache abhängen.

In lokaler PowerShell tatsächliche Werte eingeben:

```powershell
$sshServer = Read-Host 'SSH-Host aus dem Manager'
$sshUser = Read-Host 'SSH-Benutzer aus dem Manager'
$sshPort = Read-Host 'SSH-Port aus dem Manager'
ssh -p $sshPort "$sshUser@$sshServer"
```

Host-Fingerprint vor Bestätigung mit einem vertrauenswürdigen Nachweis vergleichen.
Passwort nicht als Befehlsargument übergeben. Alternativ die SSH-Konsole des
Managers verwenden. SSH vom PC zum Hosting und GitHub-Anmeldung **vom Hosting**
sind zwei verschiedene Verbindungen; ein funktionierender SSH-Login beweist keine
GitHub-Berechtigung. Schlüssellogin hängt von der Hostingumgebung ab; die
[Infomaniak-Schlüsselanleitung](https://www.infomaniak.com/fr/support/faq/2054/se-connecter-avec-cle-ssh)
nennt Einschränkungen für Node-Websites. Kein SSH-Agent-Forwarding voraussetzen.

### 2. Tatsächlichen Projektordner finden

In der SSH-Shell:

```sh
pwd
ls -la
command -v git
git --version
command -v node
node --version
command -v npm
npm --version
```

Den im Manager angegebenen Ausführungsordner verwenden. Der Document-Root einer
PHP-Website muss nicht der Node-Projektordner sein. Nur im eigenen Hostingbereich
und bei Bedarf begrenzt nach `package.json` suchen, keine fremden Verzeichnisse.
Dann den bestätigten **absoluten** Projektpfad eingeben:

```sh
read -r -p 'Absoluter bestehender Projektpfad: ' PROJECT_DIR
cd -- "$PROJECT_DIR"
PROJECT_DIR=$(pwd -P)
ls -la
test -f package.json
test -f server.cjs
test -f server-api.cjs
```

Fehlen diese Dateien, nicht blind installieren. Eine öffentlich erreichbare HTML-
Seite allein beweist nicht, dass dieses Backend dort verwendet wird.
Nicht `.env.production`, Datenbank oder Schlüssel auf der Konsole ausgeben.

### 3. Git, Branch und GitHub prüfen

Wenn `.git` bzw. ein zugehöriges Git-Worktree vorhanden ist:

```sh
git rev-parse --show-toplevel
git status --short
git remote -v
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git ls-remote --heads origin main
```

Remote muss das oben genannte Repository bezeichnen; HTTPS oder entsprechende
GitHub-SSH-Adresse sind zulässig. Keine Tokens in Remote-URLs speichern oder
Ausgaben mit enthaltenen Zugangsdaten weitergeben. `ls-remote` prüft nur Leserechte,
keinen Push und keinen Codewechsel. SSH-Schlüssel für GitHub ggf. als eigenen
read-only Deploy Key im Repository hinterlegen; bei HTTPS die im Hosting verfügbare
sichere Anmeldung verwenden. Kein Token im Script/in der Anleitung voraussetzen.

Der Produktivbranch soll `main` sein. Der tatsächliche Serverbranch ist **vor**
einer Änderung zu prüfen. Nicht bei lokalen Änderungen spontan umschalten.

### 4. Bestehenden Produktionsstand kalt sichern

Vor Git-Übernahme, Pull, Dependencies oder Migrationen:

1. Aktuelle Code-Revision, Node-Version, Start-/Installationsbefehle, Origin,
   Datenpfad und private Manager-Konfiguration notieren, keine Passwörter in Git.
2. Webprozess im vorhandenen Manager stoppen und Mail-Task/Cronjob pausieren.
   Prüfen, dass keine weitere Instanz in dieselbe Datenbank schreibt.
3. Tatsächlichen privaten Datenpfad aus der bestehenden Konfiguration ermitteln.
   Er muss SQLite, Dateien und Schlüssel enthalten. Bei abweichendem Datenmodell
   stoppen und den eigenen Sicherungsweg klären.
4. Ein bereits angelegtes privates Sicherungsverzeichnis **ausserhalb** des
   Projekts und Datenordners wählen. Speicherplatz und Leseschutz kontrollieren.

```sh
read -r -p 'Absoluter bestehender Datenpfad: ' DATA_DIR
read -r -p 'Absoluter privater Sicherungsordner ausserhalb Projekt/Daten: ' BACKUP_ROOT
test -d "$DATA_DIR/files"
test -f "$DATA_DIR/cockpit.sqlite"
test -f "$DATA_DIR/secret.key"
test -d "$BACKUP_ROOT"
umask 077
BACKUP_DIR="$BACKUP_ROOT/cockpit-before-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -- "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/data.tar.gz" -C "$DATA_DIR" .
tar --exclude=.git --exclude=node_modules --exclude=.npm-cache --exclude=tmp --exclude=output \
  -czf "$BACKUP_DIR/worktree.tar.gz" -C "$PROJECT_DIR" .
tar -tzf "$BACKUP_DIR/data.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/worktree.tar.gz" >/dev/null
```

Vor Ausführung selbst sicherstellen, dass der Sicherungspfad nicht im zu
archivierenden Baum liegt. Keine laufende SQLite-Datei isoliert kopieren: WAL/SHM,
Schlüssel und Uploads gehören dazu. Das Worktree-Archiv schützt auch bisherige
manuelle Codeänderungen und eine private Dateikonfiguration. Manager-Variablen
separat privat sichern. Archive enthalten Geheimnisse und gehören nicht ins Web/Git.

Bei vorhandenem Git zusätzlich:

```sh
git rev-parse HEAD > "$BACKUP_DIR/before-commit.txt"
git diff --binary > "$BACKUP_DIR/server-worktree.patch"
git diff --cached --binary > "$BACKUP_DIR/server-index.patch"
```

### 5. Sonderfall: bestehende ZIP-Installation ohne Git

Ohne Git-Metadaten funktioniert kein `git pull`. Weder Projekt löschen noch
`git clone` in den gefüllten Websiteordner ausführen. Nach obiger Vollsicherung
kann dieselbe Installation zunächst **nur mit Git-Metadaten** verbunden werden:

```sh
git init -b main
git remote add origin https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git
git fetch origin main
git update-ref refs/heads/main "$(git rev-parse FETCH_HEAD)"
git restore --source=FETCH_HEAD --staged -- .
git status --short --untracked-files=no
git diff --stat
```

Diese Befehle ersetzen keine Anwendungsdatei und migrieren keine Datenbank.
Sie machen Abweichungen des vorhandenen Worktrees gegenüber dem GitHub-Stand
sichtbar. Sie sind nur für eine noch **nicht** versionierte Installation bestimmt;
niemals damit eine bereits vorhandene Branchhistorie ersetzen.

Jetzt produktive Änderungen einzeln mit lokalem Code vergleichen und nachtragen.
Vor jedem `git add` zuerst tatsächliche private Pfade in `.gitignore` bzw.
`.git/info/exclude` schützen. Nicht Serverdaten committen. Die alten ZIP-Pakete
ändern `package.json` für `npm start`; der Git-Quellstand verwendet stattdessen
**`npm run start:production`**. Vor Umstellung den Manager-Startbefehl entsprechend
prüfen. Dateien erst nach Vergleich und Sicherung einzeln übernehmen. Kein
pauschales `checkout --force`, `reset --hard` oder `clean`.

Erst wenn Abweichungen geklärt, sensible Pfade ausgeschlossen und `git status`
sauber sind, mit Teil C fortfahren. Eine unbekannte ZIP-/PHP-Installation kann
nicht durch einen universellen sicheren Überschreibbefehl abgeglichen werden.

## Teil B: lokal auf GitHub veröffentlichen

Im bestehenden VS-Code-Projekt die Befehle aus
[lokale Entwicklung](LOCAL_DEVELOPMENT.md#git) ausführen. Änderungen prüfen
und über den vereinbarten Branch nach `main` übernehmen. Danach den geprüften
Stand von `main` manuell veröffentlichen.

`git status` zeigt Änderungen; `git add -A` merkt Änderungen/Entfernungen vor;
`git diff --cached` zeigt genau den Commit-Inhalt; `git commit` sichert lokal;
`git push origin main` veröffentlicht den geprüften Branch. Kein Push geschieht
durch die Anwendung, Tests oder das Deployment-Script.

## Teil C: Änderungen auf der bestehenden Installation holen

Im bestätigten Projektordner und bei sauberem Worktree:

```sh
pwd
git status --short
git remote -v
git branch --show-current
git fetch origin
git log --oneline HEAD..origin/main
git diff --stat HEAD..origin/main
```

Bei Änderungen auf dem Server: abbrechen, bereits gesicherten Patch prüfen und
fachlich relevante Änderungen zuerst lokal integrieren. Nicht blind staschen,
überschreiben oder einen Merge auf der Produktion erzwingen. Unversionierte
Dateien, die ein Update überschreiben würde, ebenfalls zuerst sichern/klären.

Nach Sicherung und bestätigtem Stop der Schreiber:

```sh
git pull --ff-only origin main
```

Voraussetzung: aktiver Branch `main`, korrektes `origin`, funktionierende
Leserechte und nicht divergierte Historie. Fast-Forward führt keinen automatischen
Konfliktmerge durch. Bei Divergenz lokal klären; kein Force-Pull.

### Optional: manueller Helfer

Nur auf sauberem `main`, mit expliziter `.env.production`/Umgebung und verfügbaren
Befehlen `bash`, `git`, `node`, `npm`, `tar`:

```sh
bash deploy.sh --check
COCKPIT_APP_STOPPED=1 bash deploy.sh --apply --backup-dir "$BACKUP_ROOT"
```

`--check` macht keinen Fetch/Pull, keine Installation und keine Migration.
`--apply` verlangt die eigene Bestätigung, dass Webprozess und Cron gestoppt sind.
Es prüft Pfade/Repository/Branch/Daten nur lesend, holt `main`, sichert kalte Daten,
Code und private Dateikonfiguration, führt exakt den geholten Commit per
Fast-Forward zusammen und installiert mit `npm ci --omit=dev --ignore-scripts`.
Anschliessend folgt eine Syntaxprüfung. `--ignore-scripts` verhindert fremde
Installationshooks; die aktuellen Runtime-Pakete benötigen solche Hooks nicht.
Es führt **keinen Neustart und keine Migration** aus. Bei Fehlern gestoppt lassen.

Das Script liegt nur als manuelles Werkzeug im Repository; kein Cronjob darf es
aufrufen. Die vorhandene Umgebung muss Bash/Node unterstützen; Ausführung auf
dem echten Infomaniak-Konto wurde nicht durchgeführt.

## Teil D: nach dem Codewechsel

**Obligatorisch beim manuellen Ablauf ohne Helfer:**

```sh
npm ci --omit=dev --ignore-scripts
node tools/check-syntax.cjs
```

Lockfile verwenden, nicht produktiv ungeprüft `npm update` ausführen. Kein
Frontend-Build, kein PHP-Composer-Schritt, kein `artisan`, kein Redis-/DB-Cache-
Flush. Es gibt keinen persistenten App-Cache zu löschen. Im Browser nach dem
Neustart ggf. hart neu laden.

**Separat zu prüfen und freizugeben:** additive Migrationen. Erst nach Sicherung
und Review bewusst ausführen:

```sh
npm run db:migrate -- --confirm-production-migrations
```

Ohne Bestätigungsargument schreibt das Werkzeug nichts. Ein Serverstart kann
auch weiterhin integrierte Migrationen auslösen; deshalb keinen unfreigegebenen
Neustart als Ersatz verwenden. Bei Fehler nicht mit leerer Datenbank weitermachen.

**Danach manuell im bestehenden Manager:** denselben Ausführungsordner, den
Manager-Port, Node-Version und Startbefehl **`npm run start:production`** bestätigen.
Keinen `node --watch`-/lokalen Demo-Prozess und keinen zweiten Hintergrundprozess
über SSH starten. Vorhandene Stop/Start-/Neustart-Steuerung des Node-Produkts
verwenden; konkrete systemd-/PM2-Kommandos sind für dieses Konto nicht nachgewiesen.

Dateirechte: Datenordner und `files/` für den Prozess beschreibbar, Schlüssel
und private Konfiguration nur für befugte Konten lesbar. Eigentümer prüfen;
kein `chmod -R 777` und keine ungeprüften rekursiven Rechteänderungen.

**Optional/bei Bedarf:** im Manager verfügbaren geplanten Task alle fünf Minuten
mit demselben Datenpfad aktivieren. Den tatsächlichen Node-Pfad über `command -v
node` ermitteln, Projektpfad über `pwd -P`. Aufgabe: Wechsel in diesen Projektordner,
dann `node --env-file=.env.production tools/mail-worker.cjs`. Bei einem externen
Cron-System den tatsächlich angebotenen Scheduler benutzen; keinen verfügbaren
`crontab`-Zugriff oder ein nicht belegtes Manager-Menü behaupten.

## Teil E: Daten und Kontrolle

Nie überschreiben: produktives `COCKPIT_DATA_DIR`, SQLite/WAL/SHM, `files/`,
`secret.key`, Sicherungen, `.env.production`, separate Manager-Geheimnisse.
Git aktualisiert nur Code. Private Daten dürfen weder versioniert sein noch in
einem durch den Import ersetzten Verzeichnis liegen. Ein altes Erstinstallations-
ZIP darf niemals über eine laufende Datenbank gelegt werden. Reset-/Prepare-
Werkzeuge nicht im normalen Update einsetzen.

Nach Start: richtige HTTPS-Adresse, Login mit bestehendem Konto, Logbuch und
Anhänge, Dashboard/Filter, Kontakte/Bilder, Rollen und Sitzungen kontrollieren.
Mit bewusst gewählten Testkonten SMTP-Einstellungen, Empfang und Eintragslink
prüfen. `COCKPIT_MAIL_DISABLED=1` sperrt alle Mails; für gewollten Versand auf `0`
setzen und zusätzlich im Adminbereich aktivieren. Wartende Ereignisse beachten.
Logs, Tasklauf und Versandstatus prüfen. Keine realen Empfänger für automatisierte Tests.

## Teil F: Fehlerbehebung

| Problem | Diagnose und sichere Lösung |
| --- | --- |
| SSH verbindet nicht | Manager-Zugang, Host, Port, Rechte und Fingerprint prüfen; richtige Node-Umgebung wählen; ggf. Manager-Konsole. Nicht zufällige Benutzernamen/Hosts versuchen |
| Kein Git-Repository | `pwd`, `ls -la`, `git rev-parse --show-toplevel`; richtigen Ordner finden. Bei ZIP ohne Git Teil A.5; nichts löschen/neu klonen |
| GitHub-Anmeldung scheitert | `git remote -v`, `git ls-remote --heads origin main`; getrennte ausgehende GitHub-Anmeldung/Deploy Key prüfen. Kein Token in URL oder Logs |
| Pull wegen lokaler Änderungen | Kalte Sicherung und Patches prüfen; produktive Änderungen lokal integrieren. Keine pauschale Verwerfung |
| Falscher Branch/Divergenz | Branch/HEAD/upstream prüfen; sauberer `main` nötig. Konflikte lokal lösen und neu testen, kein Force-Push/-Pull |
| Alte Website sichtbar | Bestätigten Projekt-/Prozesspfad und `git rev-parse HEAD` vergleichen; Manager-Neustart/Logs prüfen; Browser neu laden; keine Daten löschen |
| Angeblicher Buildfehler | Cockpit hat keinen Bundler. `node --version`, `npm ci`, Syntaxfehler prüfen; Manager-Befehl darf kein erfundenes Buildscript verlangen |
| Dependencies fehlen | Lockfile und passende Node/npm prüfen; im Projekt `npm ci --omit=dev --ignore-scripts`; nicht beliebige neueste Einzelpakete installieren |
| SQLite-/Migrationsfehler | Absoluten Datenpfad, Schreibrechte, Speicherplatz, SQLite-Unterstützung und Sicherung prüfen. Prozess gestoppt lassen; keine neue/leere DB anlegen |
| Fehlende Berechtigungen | Dateieigentümer und Hostingprozess prüfen; minimale zielgerichtete Rechte. Keine `777`-Reparatur |
| HTTP 500 | Manager-Prozesslogs, richtige Node-Version, Daten/Schlüssel und Konfiguration prüfen. Keine Geheimnisse an Support kopieren |
| SMTP geht nicht | Kill-Switch, Aktivierung, Host/Port/TLS, Absenderfreigabe, Benutzeradresse/Opt-out und Rechte prüfen; Testmail bewusst senden; TLS-Prüfung nicht deaktivieren |
| Cron läuft nicht | Schedulerangebot, absolute Pfade, Arbeitsordner, gleiche Umgebung/Daten und Tasklogs prüfen; CLI einmal bewusst manuell ausführen. Keine Browserabhängigkeit |
| Script-Prüfung stoppt | Ungesicherte Änderungen, falschen Branch/Remote oder fehlende explizite Daten-/Origin-Konfiguration beheben; Schutz nicht umgehen |

## Teil G: Wiederherstellung

Webprozess und Cron stoppen. Fehlerstand und neu hinzugekommene Daten zuerst
sichern. Der Helfer speichert `release.txt` mit vorherigem Commit, Codearchiv,
kalte Datenkopie und gegebenenfalls `env.production.private`. Manager-Konfiguration
bleibt separat zu sichern.

**Code-only-Rückkehr:** prüfen, ob der alte Code mit dem aktuellen additiv
erweiterten Schema und Datenformat funktioniert. Vorherigen Commit aus der
privaten Sicherung nehmen, nicht aus einem geratenen Tag:

```sh
read -r -p 'Geprüfter vorheriger Commit aus der Sicherung: ' OLD_COMMIT
git status --short
git show --no-patch --oneline "$OLD_COMMIT"
git switch --detach "$OLD_COMMIT"
npm ci --omit=dev --ignore-scripts
```

Nur bei sauberem Worktree und geklärter Datenkompatibilität. Dieser Wechsel
rollt keine Datenbank zurück und führt keine Migration aus. Er ist ein bewusst
vorübergehender Notfallzustand. Reguläre Korrektur bevorzugt lokal als geprüften
Revert-/Fix-Commit nach `main` bringen; erst nach Behebung und sauberem Worktree
auf den korrigierten `main` wechseln. Kein produktiver `reset --hard`.

**Daten-/Konfigurations-Rückkehr:** nur nach gesonderter Entscheidung über
zwischenzeitliche Benutzeränderungen. Alte Daten niemals über aktuelle mischen.
In einen neuen leeren privaten Zielordner wiederherstellen und SQLite, Dateien
und passenden Schlüssel gemeinsam übernehmen. Danach den Datenpfad bzw. die
private Konfiguration kontrolliert umstellen. Die neue fehlgeschlagene Umgebung
für Diagnose behalten. Siehe [Datenbank und Sicherung](DATABASE.md).

Erst nach Freigabe und Kontrollen wieder starten. Ein fehlgeschlagenes Update
rechtfertigt weder Datenlöschung noch unkontrollierte Rückwärtsmigrationen.

## Kompakte Befehlsübersicht

Nach korrekter SSH-Verbindung, bestätigtem Projektordner, sauberem `main`,
gestoppten Schreibern und tatsächlichem privaten `BACKUP_ROOT`:

```sh
bash deploy.sh --check
COCKPIT_APP_STOPPED=1 bash deploy.sh --apply --backup-dir "$BACKUP_ROOT"
# Erst nach separater Sicherungs-/Migrationsfreigabe:
npm run db:migrate -- --confirm-production-migrations
# Danach ausschliesslich im bestehenden Manager mit npm run start:production starten.
```

Keine der Produktionsaktionen wurde bei der lokalen Projektbereinigung ausgeführt.
