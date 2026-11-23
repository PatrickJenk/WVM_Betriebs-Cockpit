# Datenbank, Migrationen und Sicherung

SQLite aus Node `node:sqlite`; keine MariaDB und kein SQL-Server nötig.
`COCKPIT_DATA_DIR` ist privat und dauerhaft. Darin liegen `cockpit.sqlite`,
gegebenenfalls WAL/SHM, `files/`, `secret.key` und `backups/`.

## Modell

| Bereich | Tatsächliche Speicherung |
| --- | --- |
| Benutzer, Betriebsrollen/Systemrechte, Logbuch, Dokumentreferenzen, Navigation, Anlagen | JSON in `state`, mit Revision und Transaktionen |
| Kontrollblätter | `state.data.controlRoundBase` für gemeinsame Punkte, `state.data.controlTemplates` für Ergänzungen, Auswahlwerte und Ablage je Heizzentrale, `state.data.controlRuns` für gespeicherte Rundgänge |
| Historische Kontrollblatt-Daten | Frühere Vorlagen und Notizen liegen weiterhin im State. Die Tabelle `control_logos` enthält Bilder früherer PDF-Fassungen. |
| Passwörter | Gesalzene scrypt-Hashes im vorhandenen Benutzerobjekt |
| Sitzungen, Upload-Metadaten, Audit, Loginbegrenzung, gelesene Erwähnungen | `sessions`, `uploads`, `upload_jobs`, `audit`, `attempts`, `mention_reads` |
| Führung | `leadership_meetings`, `leadership_tasks`, `leadership_audit` |
| Kontakte | `contacts`, `contact_images`, `contact_organizations` |
| SMTP und Benachrichtigungen | `mail_settings`, `mail_outbox`, `mail_overdue_events`, `mail_worker` |
| Einmalige Hauptadmin-Zuordnung | `collaboration_migrations` |
| Nur vorbereitete Ersteinrichtung | gegebenenfalls `hosting_setup` |

Erwähnungen, Benutzer-E-Mails, Opt-out und Verantwortliche ergänzen das vorhandene
Modell, keine zweite Benutzerverwaltung. Normale Anhänge liegen unter `files/`,
Kontaktbilder als BLOB in SQLite. PDFs abgeschlossener Sitzungen werden aus den
Sitzungsdaten im Speicher erzeugt und nicht als neue Datei abgelegt.

Bei einem Kontrollrundgang werden der vom Server erfasste Beginn, die
angemeldete Person, gegebenenfalls die Rundgangsart, Ja/Nein-Antworten und Bemerkungen
festgehalten. Der PDF-Abruf verwendet die archivierte Datei und kann sie bei
einer fehlenden Datei aus den damaligen Rundgangsdaten erzeugen.
Frühere Kontrollblätter behalten ihre damaligen Antwortwerte.

## Migrationen

Das vorhandene Backend führt additive Tabellen-/Spaltenergänzungen beim Laden
und bestimmte Vorlagen-/Rollenmigrationen beim Start bzw. API-Zugriff aus.
Dies ist **keine** Laravel-/Prisma-/Django-Anwendung. Es gibt kein `artisan`,
`prisma migrate` oder separates DB-Build-Verfahren.

Für einen kontrollierten Produktionswechsel Webprozess **und Mail-Cronjob**
stoppen, kalt sichern und die Änderungen prüfen. `deploy.sh` führt keine
Migration und keinen Neustart aus. Nach separater Freigabe:

```sh
npm run db:migrate -- --confirm-production-migrations
```

Ohne Bestätigungsargument beendet sich das Werkzeug, bevor schreibende
Servermodule geladen werden. Es prüft die vorhandene Datenbank zunächst nur
lesend, ergänzt dann die vorhandenen Schemata, Hauptadmin-/Frist-Infrastruktur
und bisherige Standort-/Ordner-Vorlagen. Daten und Konten werden nicht gelöscht.
Wiederholte Aufrufe sind zulässig. Die private Produktionskonfiguration muss
denselben Datenpfad wie der Webprozess verwenden.

Ein Serverneustart kann weiterhin integrierte Migrationen auslösen. Deshalb
auch den anschliessenden Start erst nach dieser bewussten Freigabe durchführen.
Bei unbekannten älteren Datenformaten/fehlender SQLite-`state`-Tabelle stoppen
und den bestehenden Datenstand gesondert analysieren; nicht neu initialisieren.

## Sicherung

Empfohlen für einen Codewechsel: nach bestätigtem Stop aller Schreiber eine
vollständige kalte Kopie des Datenordners einschliesslich WAL/SHM, Schlüssel und
Dateien. Der manuelle Helfer erzeugt ein solches Archiv, plus Code und private
Dateikonfiguration, in einem vorgegebenen privaten Verzeichnis ausserhalb des
Projekts und Datenordners. Schritte: [Deployment](INFOMANIAK_DEPLOYMENT.md).

Zusätzlich bleibt die vorhandene anwendungseigene Sicherung erhalten:

```sh
node --env-file=.env.production tools/backup.cjs
```

Sie enthält `state.json`, Uploads, Audit, gelesene Erwähnungen, Führungsdaten,
`collaboration.json` mit Kontakten/Bildern/SMTP/Mailstatus und `secret.key`.
Die `.env.production` selbst und Manager-Einstellungen separat privat sichern.
Der laufende Server prüft stündlich die Sicherungswartung; sieben tägliche
automatische Sicherungen bleiben erhalten. Manuelle Sicherungen werden nicht
automatisch entfernt. Kopien zusätzlich extern/verschlüsselt aufbewahren.

Die Servermodule des Sicherungswerkzeugs können beim Laden Schemaergänzungen
ausführen. Soll vor einem Update garantiert kein Anwendungscode laufen, die
beschriebene kalte Dateisicherung verwenden.

## Wiederherstellung

Zwei unterschiedliche Formate nicht vermischen:

1. **Kalte vollständige Datenkopie:** in ein neues leeres privates Verzeichnis
   entpacken; alten Datenordner unverändert behalten. SQLite, Dateien und Schlüssel
   zusammen übernehmen. Nach Prüfung und Freigabe den Prozess auf den neuen
   Datenpfad umstellen. Nie eine ältere Datenbank isoliert über eine neuere kopieren.
2. **Anwendungssicherung mit `manifest.json`:** `tools/restore.cjs` prüft Hashes und
   importiert ausschliesslich in einen leeren, ausdrücklich angegebenen Zielordner.
   Ältere Sicherungen ohne Erweiterungsdaten werden unterstützt.

Für Format 2 nach Eingabe der tatsächlichen Pfade in einer Shell:

```sh
read -r -p 'Neues leeres absolutes Zielverzeichnis: ' RESTORE_DIR
read -r -p 'Absoluter Pfad zur Anwendungssicherung: ' APP_BACKUP
COCKPIT_DATA_DIR="$RESTORE_DIR" node tools/restore.cjs "$APP_BACKUP"
```

Nicht `.env.production` mit dem alten Zielpfad für diesen Import vorladen.
Sicherungen und Schlüssel sind vertraulich. Ohne Schlüssel sind verschlüsselte
SMTP-/MFA-Daten nicht entschlüsselbar. Eine Code-Rückkehr bedeutet nicht
automatisch eine Rückkehr der Datenbank; siehe [Rollback](INFOMANIAK_DEPLOYMENT.md#teil-g-wiederherstellung).
