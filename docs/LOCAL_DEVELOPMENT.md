# Lokale Entwicklung

Git, Node.js mindestens 22.16 und npm installieren. Für TLS-/Scanner-Tests wird
OpenSSL benötigt; Windows-Tests suchen in der Git-Installation. Alternativ
`OPENSSL` auf den tatsächlichen Pfad setzen.

Bestehende Arbeitskopie weiterverwenden. Nur für eine neue lokale Arbeitskopie:

```powershell
git clone https://github.com/PatrickJenk/WVM_Betriebs-Cockpit.git
cd WVM_Betriebs-Cockpit
npm.cmd ci
```

## Sicherer Test

```powershell
npm.cmd run start:test
```

http://localhost:4183, Testkonto `test` / `111` (Rolle WVM). Für die
Testadministration steht `WVM-admin` / `9876` zur Verfügung. Jeder Start erzeugt ein neues
temporäres Datenverzeichnis; der Pfad wird angezeigt. Nur Loopback, sämtliche
SMTP-Mails gesperrt. Scanner nur in dieser isolierten Demo ausgeschaltet.
Beenden mit Strg+C. Alternativer Port über `COCKPIT_TEST_PORT`.
Die Anlagenlisten der Heizzentralen sind in einer neuen Demo für die manuelle
Erfassung vorbereitet. Nach Änderungen am Backend eine mit `start:test`
gestartete Demo neu starten. Änderungen am Browser-Code lädt die Seite
automatisch nach.

## Bestehende lokale Daten

`npm.cmd start` startet http://localhost:4173. Standard: `storage/cockpit.sqlite`,
`storage/files/`, `storage/secret.key`. Konten bleiben erhalten. Eine leere
Entwicklungsumgebung wird beim ersten Sitzungsaufruf initialisiert. Das ist kein
Produktionsverfahren. `.env.production` wird von diesem Befehl nicht geladen.
Bei einer Kopie echter Daten Mailversand sperren:

```powershell
$env:COCKPIT_MAIL_DISABLED = '1'
npm.cmd start
```

LAN nur im vertrauenswürdigen Netzwerk: `npm.cmd run start:lan` (Port 4175).
IP und Firewall selbst prüfen; Demo-Zugänge nicht öffentlich freigeben.

## Prüfungen

```powershell
npm.cmd run check
npm.cmd run check:syntax
npm.cmd run check:format
npm.cmd run check:repository
npm.cmd run check:deployment
npm.cmd run check:smtp
npm.cmd run check:hosting
npm.cmd run check:hosting:scanner
npm.cmd audit
```

Tests verwenden eigene temporäre Daten, Testkonten und lokale Mail-/Scanner-
Server. `npm.cmd run format` formatiert JS/CSS/HTML/JSON. Es gibt keinen Bundler.
Optionale Handbuch-Pythonquellen sind kein Deployment-Schritt.

## Git

Das Produktionsrepository verwendet `main`. Vor einem Commit den aktuellen
Branch, das Remote und alle vorgemerkten Änderungen prüfen.

```powershell
git status
git diff --stat
git diff --cached --stat
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "<Änderung beschreiben>"
```

Nach Prüfung und nur wenn `main` konfliktfrei vorwärtsgeführt werden kann:

```powershell
git switch main
git merge --ff-only <freigegebener-branch>
git push origin main
```

Push bewusst selbst ausführen. Bei abweichender Historie keinen Force-Push
verwenden: lokal zusammenführen und erneut testen. Später je Aufgabe einen Branch.

`.gitignore` entfernt keine alten Commit-Inhalte. Der Repository-Check ist ein
Mustercheck, keine vollständige Secret-Garantie. Bei veröffentlichten Zugangsdaten
zuerst sperren/rotieren; eine Historienbereinigung separat abstimmen.
