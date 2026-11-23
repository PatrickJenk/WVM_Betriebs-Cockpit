# Go-live-Prüfung

Stand 20. November 2026. Geprüft wurden diese Arbeitskopie und isolierte Testserver. Die Freigabe der Zielinstallation hängt von den folgenden Prüfungen am Hosting ab.

Die Tests für Zugriffsschutz, Konten, Kontrollblätter und den isolierten Start liefen auch mit der portablen, per SHA-256 geprüften Node.js-Version 22.23.5.

## Schutz in der Anwendung

| Bereich | Lokal geprüft |
| --- | --- |
| Anmeldung und Sitzungen | Passwort-Hashes, Anmeldebegrenzung, geschützte Sitzungs-Cookies im Produktionsmodus, Abmeldung und erzwungener Wechsel von Startpasswörtern |
| Berechtigungen | Server prüft Rollen und Eigentümerschaft. Admin-Rechte für Vorlagen und Anlagen. Kontrollblätter, Betriebsdaten und zugehörige PDFs nur nach Anmeldung |
| Schreibzugriffe | Herkunfts- und CSRF-Prüfung, Prüfung der Eingaben und Revisionen, Schutz der Haupt- und Backup-Administratorkonten |
| Dateien | Private Ablage, geschützte Download-Routen, Format- und Grössenprüfung sowie Quoten. Scanner-Fehler blockieren Uploads im Produktionsmodus mit verpflichtender Prüfung |
| Infrastruktur | HTTPS-Anforderung für Produktions-API, HSTS und Browser-Sicherheitsheader. SQLite-Sicherung, Wiederherstellung und manuelles Deployment mit Testdaten geprüft |
| Abhängigkeiten | `npm audit --omit=dev` meldete am Prüftag keine bekannten Lücken in den aufgelösten Produktionspaketen |

Die Orientierung für diese Prüfung waren der [OWASP Application Security Verification Standard](https://asvs.owasp.org/) und das [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Vor der öffentlichen Freigabe

1. **Node.js aktualisieren.** Die auf diesem Rechner installierte Version 22.20.0 liegt vor dem Sicherheitsrelease vom 11. November. Am Hosting mindestens den gepatchten Stand der verwendeten LTS-Linie einsetzen, beispielsweise 22.23.5 oder 24.22.3, und bei der Aufschaltung den aktuellen Patchstand prüfen. [Node.js-Sicherheitsrelease](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases/)
2. **HTTPS und Proxy prüfen.** Die wirkliche Domain als `COCKPIT_ORIGIN` setzen. HTTP muss am Hosting zu HTTPS weiterleiten. Wenn `COCKPIT_TRUST_PROXY=1` gesetzt ist, muss der Node-Port ausschliesslich vom vertrauenswürdigen Reverse Proxy erreichbar sein. Dieser muss `X-Forwarded-Proto` zuverlässig setzen.
3. **Upload-Prüfung entscheiden und testen.** Die mitgelieferte Hosting-Voreinstellung steht auf `disabled`. In diesem Modus werden Dateien nicht auf Schadsoftware geprüft. Für die öffentliche Nutzung einen Scanner gemäss [Konfiguration](CONFIGURATION.md) einrichten, `COCKPIT_SCAN_MODE=required` setzen und einen Upload auf der Zielinstallation prüfen.
4. **Konten, Daten und Sicherung prüfen.** Produktive Konten mit eigenen Zugangsdaten verwenden und den privaten Datenpfad, die Dateirechte sowie eine getrennte Wiederherstellung prüfen. Hauptadmin und Notfallzugang gemäss [Rollenübersicht](ROLLEN_UND_RECHTE.md) einrichten.
5. **Auf der Zieldomain abnehmen.** Mit einem gewöhnlichen Konto und einem Admin Anmeldung, Logbuch, Dokumentzugriff, Vorlagen und PDF prüfen. Falls der Versand eingesetzt wird, SMTP-Test und Benutzereinladung mit einem dafür vorgesehenen Empfänger prüfen.

Die Schritte für die bestehende Installation stehen in der [Infomaniak-Anleitung](INFOMANIAK_DEPLOYMENT.md). Die lokalen Demo-Server sind reine Loopback-Instanzen mit gesperrtem Mailversand.
