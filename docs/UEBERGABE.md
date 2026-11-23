# Übergabe-Checkliste

Die [README](../README.md) ist der Einstieg für die technische Übernahme. Die [Bedienung](BEDIENUNG.md) und die [Rollenübersicht](ROLLEN_UND_RECHTE.md) sind der Einstieg für die Betriebsverantwortlichen.

## Gemeinsam festhalten

| Thema | Zuständig / Ablageort |
| --- | --- |
| Betrieb und fachliche Freigabe der Kontrollblatt-Vorlagen | |
| Hauptadmin, Stellvertretung und Notfallzugang | |
| Hosting, Domain, Repository und laufender Node-Prozess | |
| Regelmässige Sicherung, Speicherort und Wiederherstellung | |
| SMTP-Verwaltung und technischer Support | |

Zugänge und Wiederherstellungscodes gehören in den Passwortmanager der Organisation. Das Passwort des Backup-Admins wird im [Notfall-Setup](CONFIGURATION.md) verwaltet.

## Gemeinsam ausprobieren

- Mit einem normalen Konto einen Standort öffnen, einen Logbucheintrag erstellen sowie einen Kontrollrundgang erfassen und exportieren.
- Mit einem Admin die Vorlagen beider Rundgangsarten speichern, einen Dokumentordner verwalten und die Kontoverwaltung öffnen.
- Mit einem Konto mit Leitung Betriebspersonal und Austausch EPC + WVM öffnen.
- Eine getrennte Wiederherstellung aus einer Sicherung nach [Datenbank und Wiederherstellung](DATABASE.md) ausführen.
- Vor der Freigabe den tatsächlichen Datenpfad, die HTTPS-Adresse, den Mailversand und die Zuständigkeit für Updates protokollieren.

Bei einer Störung helfen Zeitpunkt, betroffene Ansicht und Fehlermeldung. Die laufende Installation wird gemäss [Hosting-Anleitung](INFOMANIAK_DEPLOYMENT.md) aktualisiert.
