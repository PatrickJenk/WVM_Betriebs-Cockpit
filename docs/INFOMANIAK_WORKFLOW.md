# Cockpit auf Infomaniak veröffentlichen

## Einmalig im Infomaniak Manager

Für die neue Installation muss `package.json` im GitHub-Branch `main` das Skript `hosting:init` enthalten.

1. Im [Infomaniak Manager](https://manager.infomaniak.com/) das Webhosting und darin deine **Node.js-Website** öffnen. Unter **Erweiterte Einstellungen verwalten → Node.js** findest du die folgenden Einstellungen. [Infomaniak-Anleitung](https://www.infomaniak.com/de/support/faq/2535/eine-nodejs-konfiguration-andern)
2. Wenn die Website noch das Infomaniak-Beispielprojekt zeigt, importiere über die benutzerdefinierte Node.js-Einrichtung das Repository `PatrickJenk/WVM_Betriebs-Cockpit` mit dem Branch `main`. Bei einem privaten Repository muss der Import Leserechte erhalten. Wenn das Cockpit bereits aus einem ZIP läuft, sichere zuerst die Installation und folge für die Git-Übernahme [Abschnitt A.5 der Deployment-Anleitung](INFOMANIAK_DEPLOYMENT.md#5-sonderfall-bestehende-zip-installation-ohne-git). [Infomaniak-Anleitung zum Import](https://www.infomaniak.com/de/support/faq/2537/erstellen-sie-eine-nodejs-website-bei-infomaniak)
3. Trage für den Git-Checkout diese Werte ein:

   | Feld | Wert |
   | --- | --- |
   | Node.js-Version | 24, sofern verfügbar. Mindestens 22.16 |
   | Ausführungsordner | Ordner mit `package.json`, zum Beispiel `./`, wenn das Repository direkt im Websiteverzeichnis liegt |
   | Build-Befehl | `npm ci --omit=dev --ignore-scripts && node tools/check-syntax.cjs` |
   | Start-Befehl | `npm run start:production` |
   | Port | Den im Manager konfigurierten Port übernehmen. Infomaniak übergibt ihn als `PORT` |

4. Setze in der privaten Produktionskonfiguration `COCKPIT_ORIGIN` auf die vollständige HTTPS-Adresse ohne abschliessenden Schrägstrich und `COCKPIT_DATA_DIR` auf den absoluten privaten Datenpfad ausserhalb des Git-Checkouts. Als Vorlage dient [`.env.example`](../.env.example). Eine private `.env.production` im Ausführungsordner wird vom Startbefehl eingelesen. Prüfe HTTPS im Website-Dashboard. Für eine Testinstallation setze zusätzlich `COCKPIT_MAIL_DISABLED=1`.
5. Entscheide zwischen leerer Neuinstallation und Übernahme bisheriger Betriebsdaten. Bei einer Übernahme kopiere SQLite, `files/` und `secret.key` gemeinsam aus einer kalten Sicherung in einen privaten Datenordner. Für eine leere Installation verwende den folgenden Abschnitt. [Datenbank und Sicherungen](DATABASE.md)
6. Prüfe im SSH-Terminal im Ausführungsordner, ob der Server GitHub lesen kann:

   ```sh
   git status --short
   git branch --show-current
   git ls-remote --exit-code --heads origin main
   ```

   Erwartet werden ein sauberer Checkout auf `main` und eine Ausgabe mit `refs/heads/main`. Bei fehlenden Rechten den GitHub-Zugang vom Hosting prüfen. Die SSH-Anmeldung am Hosting und die Leserechte auf GitHub sind getrennte Zugänge.
7. Führe den Build im Manager aus. Sobald er erfolgreich ist, starte die Website über das Dashboard. Prüfe die HTTPS-Adresse und den Admin-Login. Bei Fehlern öffne das Ausführungsprotokoll. [Infomaniak-Hilfe zum Node.js-Start](https://www.infomaniak.com/de/support/faq/2536/ein-problem-mit-einer-nodejs-website-beheben)

## Leere Installation mit neuem Admin-Konto

Verbinde dich mit dem SSH-/SFTP-Benutzer der **Node.js-Umgebung** über den Node.js-Host im Infomaniak Manager. Das Terminal muss denselben Ausführungsordner sehen wie WinSCP. Für diese Website:

```sh
cd /srv/customer/sites/betrieb.waermeverbund.ch
node --version
git status -sb
npm run hosting:init -- --new-installation /srv/customer/cockpit-betriebsdaten https://betrieb.waermeverbund.ch
```

Der Befehl legt im neuen privaten Verzeichnis eine leere Betriebsdatenbank, einen Schlüssel und das Konto `WVM-admin` an. Er zeigt das Startpasswort einmal im privaten SSH-Terminal. Einen bereits vorhandenen Zielordner lehnt er ab. Führe den Befehl vor dem ersten Start aus. Verwende ihn ausschliesslich im privaten SSH-Terminal, damit das Passwort nicht in den Anwendungslogs erscheint.

Setze im Manager als Ausführungsbefehl:

```sh
env COCKPIT_DATA_DIR=/srv/customer/cockpit-betriebsdaten COCKPIT_ORIGIN=https://betrieb.waermeverbund.ch npm run start:production
```

Mit Node.js 24 und Empfangsport 3000 den Build ausführen, dann im Dashboard **Run** klicken. Anschliessend die HTTPS-Website öffnen, als `WVM-admin` anmelden und das Startpasswort ändern.

## Checkliste für jede Codeänderung

1. **Ändern.** Öffne den Arbeitsbranch in VS Code oder GitHub Codespaces. Lass Änderungen im Arbeitsbranch vornehmen.
2. **Vorschau öffnen.** Starte `npm run start:test`. Öffne im Codespace unter **Ports** die private Vorschau auf **4183**. Der Demo-Login ist `WVM-admin` mit Passwort `9876`.
3. **Prüfen und OK geben.** Öffne den Diff unter **Source Control**. Teste die geänderte Funktion. Führe `npm run check:syntax` und `npm run check` aus. Wenn ein Assistent für dich arbeitet, soll er vor Commit und Push auf dein ausdrückliches OK warten.
4. **Commit und Push.** Markiere die gewünschten Dateien, prüfe sie mit `git diff --cached`, commite sie und pushe den Arbeitsbranch. Öffne einen Pull Request nach `main`. Prüfe den Diff und die eingerichteten GitHub-Checks. Klicke auf **Merge pull request**, wenn dieser Stand veröffentlicht werden soll. Merke dir den vollständigen Commit-Hash auf `main`.
5. **Sichern und aktualisieren.** Notiere den derzeitigen Server-Commit mit `git rev-parse HEAD`. Prüfe, ob die Änderung Datenmigrationen enthält. Stoppe im Manager die Website und pausiere einen gegebenenfalls eingerichteten Mail-Task. Erstelle die kalte Sicherung nach [Abschnitt A.4 der Deployment-Anleitung](INFOMANIAK_DEPLOYMENT.md#4-bestehenden-produktionsstand-kalt-sichern). Danach führe im sauberen Hosting-Checkout auf `main` aus:

   ```sh
   git fetch origin main
   git rev-parse FETCH_HEAD
   ```

   Wenn der ausgegebene Hash mit deiner Freigabe übereinstimmt, übernimm genau diesen Commit:

   ```sh
   git merge --ff-only FETCH_HEAD
   git rev-parse HEAD
   ```

   Bei einem anderen Hash oder Fehler halte vor dem Start an und kläre den Stand. Private Betriebsdaten, Konfiguration und Sicherungen bleiben ausserhalb des Code-Updates.
6. **Build und Start.** Führe im Infomaniak Manager den gespeicherten Build-Befehl aus. Wenn der Build erfolgreich ist und gegebenenfalls nötige Migrationen geprüft und freigegeben sind, klicke im Dashboard auf **Start**. Bei Fehlern prüfe das Protokoll und nutze bei Bedarf [die Wiederherstellungsschritte](INFOMANIAK_DEPLOYMENT.md#teil-g-wiederherstellung).
7. **Website kontrollieren.** Öffne die HTTPS-Adresse, lade die Seite neu und teste Login, die geänderte Funktion und einen vorhandenen Testanhang. Aktiviere danach den pausierten Mail-Task wieder.

Für den ersten Durchlauf kannst du auf einer Testinstallation einen sichtbaren Anmeldetitel ändern. Die Vorschau zeigt den neuen Titel vor dem Commit. Die Testwebsite zeigt ihn nach Git-Update, Build und Start. Prüfe dabei den Commit-Hash auf dem Hosting gegen GitHub.

Nach der einmaligen Einrichtung holt Infomaniak die Codeänderungen direkt von GitHub. Der Build und Start werden für diesen Ablauf im Manager ausgelöst. Ein dokumentierter GitHub-Push-Trigger für den Neustart dieser verwalteten Node.js-Website konnte nicht bestätigt werden.
