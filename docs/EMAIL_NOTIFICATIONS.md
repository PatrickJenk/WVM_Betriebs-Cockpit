# E-Mail-Benachrichtigungen

## Einrichtung

Hauptadministratoren und Administratoren mit `smtp`-Recht öffnen **Cockpit
verwalten → E-Mail-Einstellungen**. Host, Port, Benutzer, Passwort, TLS-Modus,
Absender, optionale Reply-To-Adresse und tatsächliche produktive Basis-URL
speichern. Die genauen Port-/TLS-Werte beim eigenen Mailanbieter ermitteln.
SMTP-Zugangsdaten gehören weder in Git noch in `.env.example`.

Das Passwort liegt AES-256-GCM-verschlüsselt in SQLite. `secret.key` privat sichern.
Leeres Passwortfeld behält den gespeicherten Wert. Entfernen-Checkbox löscht ihn;
gleichzeitiges Ersetzen und Entfernen wird abgewiesen. Die API liefert nur
`passwordSet`, niemals das Passwort.

**Test E-Mail senden** verwendet die gespeicherte Konfiguration tatsächlich.
Sie funktioniert auch bei ausgeschaltetem automatischem Versand. Nur
`COCKPIT_MAIL_DISABLED=1` sperrt beides. STARTTLS wird erzwungen; Zertifikate werden
geprüft. Erfolgreiche lokale SMTP-Tests ersetzen keine Prüfung des externen
Empfangs und der Absenderfreigabe beim tatsächlichen Anbieter.

Benutzer-E-Mails und Opt-out: **Benutzer & Zugänge → E-Mail & Rechte**.

## Ereignisse und Empfänger

- `@Name` im Beschreibungs-/Ergänzungsablauf: bestehende Benutzerauswahl;
  serverseitige Zuordnung. Eine Mail je Eintrag und erwähntem Benutzer.
- Mehrfachzuweisung: nur neu hinzugefügte Personen. Entfernte ausstehende
  Zuweisungsmails werden storniert; spätere Neuzuweisung ist ein neues Ereignis.
- Überfälligkeit: `Pendenz`, `In Bearbeitung` bzw. aus Altdaten `Offen` mit Frist
  vor dem aktuellen Datum in Europe/Zurich. Aktuelle Verantwortliche und
  nachvollziehbare Beteiligte werden berücksichtigt, bei Altbeständen auch
  eindeutige Kürzel. Abgeschlossene Einträge werden ausgeschlossen.
- Friständerungen/Wiederöffnung bilden neue Fristzyklen. Alte offene Fristmails
  werden nicht für einen inzwischen anderen Zyklus versendet.

Inaktive/gelöschte Konten, fehlende E-Mail, Opt-out und fehlendes Archivleserecht
führen zum Überspringen. Eintragslinks verwenden die konfigurierte Basis-URL
und `/#entry/ID`. Bestehende Login-/Leserechte gelten auch beim Linkaufruf.
Die zusätzliche Dashboard-Markierung nach 30 Tagen ist kein Fristmail-Auslöser.

## Worker und Cron

Der laufende Node-Server prüft beim Start und jede Minute ohne Browser.
Alternativ/ergänzend einen im Hosting verfügbaren geplanten Task alle fünf
Minuten manuell einrichten, mit tatsächlichem Node-/Projektpfad und derselben
privaten Umgebung. Einmaliger Aufruf im bestätigten Projektordner:

```sh
node --env-file=.env.production tools/mail-worker.cjs
```

SQLite-Sperre mit Besitzer-ID, Ablaufzeit und Heartbeat verhindert regulär
gleichzeitige Versandchargen. SMTP-Aufrufe haben 45 Sekunden Gesamtzeitlimit.
Kein öffentlicher Cron-Endpunkt und kein Git-Deployment-Job werden benötigt.

## Status und Grenzen

`mail_outbox` speichert `pending`, `retry`, `sent`, `skipped`, `failed`, Versuche,
nächsten Termin, bereinigten Fehlertext und Sendezeit. Fehler werden mit steigender
Wartezeit maximal achtmal versucht. Danach bleibt `failed` zur Diagnose bestehen.
Die Adminoberfläche zeigt Statuszahlen. Keine ungeprüften SQL-Massenupdates
gegen die Produktion zur Wiederholung ausführen.

Neue Ereignisse werden zusammen mit dem Logbucheintrag transaktional gespeichert.
Ein Mailfehler setzt keinen gespeicherten Eintrag zurück. Nach späterer Aktivierung
können noch relevante wartende Mails versendet werden; vor Freigabe beachten.

Eindeutige Ereignisse und stabile Message-IDs verhindern reguläre Duplikate.
SMTP garantiert bei einem Absturz zwischen Annahme durch den Mailserver und
DB-Erfolgsbestätigung keine absolute Exactly-once-Zustellung.

Diagnose: erst Prozess/Task, dann Datenpfad, Kill-Switch, Aktivierung, Empfänger-
Opt-out, Zugriff, Frist/Zeitzone und SMTP prüfen. Kein `rejectUnauthorized=false`.
Keine echten Empfänger für automatische Entwicklungstests verwenden.
