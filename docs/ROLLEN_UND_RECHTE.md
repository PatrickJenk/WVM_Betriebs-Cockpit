# Rollen und Rechte im Betriebscockpit

**User** hat die Grundrechte eines angemeldeten Kontos. **Leitung** ergänzt diese um die Personalverwaltung und den standardmässigen Zugang zu «Austausch EPC + WVM». **Admin** ergänzt sie um die technische und betriebliche Verwaltung. Admin und Leitung lassen sich kombinieren. Die Spalte Admin beschreibt ein Konto ohne zusätzlich gesetzte Leitung. Bei älteren Konten ohne ausdrückliche Einstellung bleibt der bisherige Leitungszugriff für WVM und Admin erhalten. WVM und EPC bezeichnen grundsätzlich die Unternehmenszugehörigkeit. [Rollenlogik](../src/auth/roles.js)

| Bereich | User | Leitung | Admin ohne Leitung |
| --- | --- | --- | --- |
| Dashboard, Wärmeverbünde, Heizzentralen und Unterstationen | Anzeigen und filtern | Wie User | Wie User, zusätzlich Standortstruktur verwalten |
| Logbuch und Archiv | Alle Einträge und zugehörigen Anhänge lesen, filtern und Einträge erfassen | Wie User | Alle Einträge lesen, erfassen und verwalten |
| Offene Logbucheinträge | Beschreibung und Anhänge ergänzen, Status, Tätigkeit, Fälligkeit und Zuständigkeit anpassen. Ereigniszeit nur bei eigenen Einträgen korrigieren. | Wie User | Auch fremde Einträge bearbeiten, einschliesslich Standort, Anlage, Titel, Beschreibung und Anhängen. Urheberschaft und ursprüngliche Erfassungszeit bleiben erhalten. |
| Ältere erledigte Einträge | Lesen. Eigene Einträge löschen. | Wie User | Auch bearbeiten und fremde Einträge löschen |
| Logbucheinträge löschen | Eigene mit gespeicherter Urheberschaft | Eigene mit gespeicherter Urheberschaft | Eigene und fremde |
| Übergeordnete Dokumentationen und Handbuch | Anzeigen und herunterladen | Wie User | Zusätzlich allgemeine Dokumente hinzufügen und löschen |
| Dokumente je Standort | Anzeigen, herunterladen und hochladen. Eigene Dokumente umbenennen, verschieben und löschen, soweit die Datei kein abgeschlossenes Kontrollblatt ist. | Wie User | Auch fremde Dokumente und Dokumentordner verwalten |
| Kontrollblatt | Rundgänge erfassen und abgelegte PDFs unter Dokumente öffnen oder herunterladen. | Wie User | Zusätzlich Grundvorlage, Kontrollpunkte, optionale Rundgangsarten und PDF-Ablageordner verwalten. |
| Betriebspersonal | Kontaktverzeichnis lesen | Kontakte und Profilbilder hinzufügen, bearbeiten und löschen | Kontaktverzeichnis lesen und Kontakte innerhalb ihrer Organisation neu anordnen. Kontaktpflege mit zusätzlicher Leitung. |
| Betriebsführung | Zugang nach Freigabe pro Jourfix | Austausch EPC + WVM standardmässig, separate Freigabe nach Einrichtung einer Zugriffsliste | Beide Jourfixe, Zugriff verwalten |
| Navigation, Standorte, Anlagen, Register und Ordner | Vorhandene Struktur nutzen | Wie User | Struktur hinzufügen, bearbeiten, ausblenden und löschen. Anlagen aktivieren und deaktivieren. |
| Benutzerverwaltung und Sicherheitsprotokoll | Kein Zugang | Kein Zugang | Konten und Standardrollen verwalten, Einladungen und Passwort-Resets auslösen, Sicherheitsprotokoll lesen. Für geschützte Konten gelten zusätzliche Systemrechte. |
| E-Mail-Versand und Vorlagen | Automatische Benachrichtigungen bei aktiviertem Versand und entsprechender Kontoeinstellung erhalten | Wie User | Versand konfigurieren, testen und Vorlagen bearbeiten mit SMTP-Systemrecht oder als Haupt- bzw. Backup-Admin |
| Eigenes Konto | Eigenes Passwort ändern und abmelden | Wie User | Wie User. Für den Backup-Admin erfolgt die Passwortrotation im separaten Setup. |

Die Behandlung älterer erledigter Einträge richtet sich nach dem Abschlussquartal in der Zeitzone Europe/Zurich. Die normalen Rollen können solche Einträge lesen. Korrekturen übernimmt ein Admin. Das Löschen durch die ursprüngliche Person stützt sich auf die gespeicherte Konto-ID. Historische Einträge ohne eindeutige Konto-ID bleiben löschbar für Admins. [Logbuchregeln](../src/services/entry-status.js) · [Serverprüfung der Datenänderungen](../server-api.cjs)

## Zusätzliche Systemrechte

- **Hauptadmin** hat SMTP- und Rollenverwaltung und kann geschützte Hauptadmin-Konten verwalten. Der letzte aktive Hauptadmin muss erhalten bleiben.
- **Delegiertes SMTP-Recht** erlaubt die Konfiguration von Absender, Versand, Vorschau und Mailvorlage.
- **Delegiertes Rollenrecht** erlaubt die entsprechende Systemrollenverwaltung. Änderungen an Hauptadmin-Konten bleiben Haupt- oder Backup-Admin vorbehalten.
- **Backup-Admin** hat volle administrative Systemrechte für den Notfall. Er wird im separaten Setup angelegt und rotiert. Die normale Benutzerverwaltung kann ihn weder ändern noch deaktivieren oder löschen.

Ausgeblendete Buttons unterstützen die Bedienung. Die Zugriffsrechte werden zusätzlich im Server geprüft. [Konto- und Mailrechte](../server-collaboration.cjs) · [Führung](../server-leadership.cjs) · [Kontrollblatt](../server-control-sheet.cjs)
