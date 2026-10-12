# Benutzerhandbuch Wärmeverbund Betriebs Cockpit

Stand 7. Oktober 2026 · Version 1.0 · Aktueller Funktionsstand der Testversion

Das Cockpit verbindet Logbuch und Dokumentenablage für WVM und EPC. Du dokumentierst Arbeiten, findest offene Punkte und siehst, wer Einträge erstellt oder ergänzt hat. Alle Geräte arbeiten mit gemeinsamen Serverdaten.

## Anmeldung und Navigation

Melde dich mit deinem persönlichen Benutzerkonto an. Beim ersten Login oder nach einer Passwortzurücksetzung musst du ein eigenes Passwort festlegen. Über «Mein Passwort ändern» kannst du es später mit dem aktuellen Passwort ändern. Bei einem vergessenen Passwort hilft der Admin. E-Mail, SMS-Codes und Zwei-Faktor-Anmeldung sind derzeit nicht aktiv.

Links sind die Wärmeverbünde beim Einloggen zugeklappt. Öffne den Verbund und darunter «Heizzentralen» oder «Unterstationen». Unterschiedliche Symbole kennzeichnen die Standorttypen. Wähle einen Standort und den Reiter «Logbuch» oder «Dokumente». Der Adresslink öffnet Google Maps. Am Handy öffnet das Menü-Symbol die Navigation.

Mehrere Tabs desselben Browsers teilen sich die Anmeldung. Für verschiedene Konten verwende getrennte Browserprofile oder Browser. Änderungen werden im Hintergrund aktualisiert; bei offenem Formular oder Detailfenster kann die Aktualisierung warten. Nach der Nutzung abmelden.

## Dashboard und Filter

Das Dashboard zeigt alle für dich sichtbaren Einträge. Klicke auf «Offene Pendenzen», «Hohe Priorität», «Überfällige Pendenzen» oder «Einträge diese Woche», um die entsprechende Auswahl zu sehen. Offene Pendenzen umfassen «Pendenz» und «In Bearbeitung». Hohe Priorität zählt offene Arbeiten; die Wochenübersicht beginnt am Montag.

Nutze Suche und Filter für Standort, Anlage, Status, Priorität, Person und Zeitraum. «Dashboard», das Logo links und das grosse Logo setzen alle Filter zurück. «Filter zurücksetzen» entfernt die Filter in der aktuellen Ansicht.

## Farben richtig lesen

| Anzeige | Farbe | Bedeutung |
| --- | --- | --- |
| Status Erledigt | Grün | Arbeit abgeschlossen |
| Status Pendenz | Gelb bis Orange | Arbeit offen |
| Status In Bearbeitung | Blau | Arbeit begonnen und noch offen |
| Überfällig | Rot | Mehr als 30 Tage offen oder Fälligkeitsdatum überschritten |
| Priorität Gering / Mittel / Hoch | Grün / Gelb / Rot | Niedrige / mittlere / hohe Dringlichkeit |
| Personen WVM / EPC | Blau / Orange | Unternehmenszugehörigkeit |
| Gemischte Personenanzeige | Farbverlauf | Ersteller und Bearbeiter aus WVM und EPC |

Status und Priorität sind unabhängig: Ein erledigter Eintrag kann weiterhin hohe Priorität tragen. Bei einem Ersteller oder Bearbeiter erscheint das Kürzel, bei mehreren die Anzahl. Anklicken zeigt vollständige Namen. Die Farben des Umschlags werden auf Seite 2 erklärt.

<!-- PAGE -->
## Logbuch und Kommunikation

### Einen Eintrag erstellen

1. «Neuer Logbucheintrag» öffnen und zuerst den Wärmeverbund wählen. Danach sind nur seine Heizzentralen und Unterstationen auswählbar.
2. Standort und Anlage wählen. Es erscheinen nur dort freigegebene aktive Anlagen. Fehlt eine Anlage, kontaktiere den Admin.
3. Titel und Beschreibung eingeben. Datum und Uhrzeit entsprechen dem Öffnen des Formulars. Dokumentiere Feststellung, Arbeit, Ergebnis und offene Schritte.
4. Status bewusst wählen: Das Formular startet mit «Erledigt». Für offene Arbeiten «Pendenz» oder «In Bearbeitung» wählen. Priorität auf «Gering», «Mittel» oder «Hoch» setzen.
5. Bei offenen Arbeiten bei Bedarf Fälligkeitsdatum und «Notiz / nächste Schritte» eintragen. Dateien oder Bilder anhängen und speichern.

### Gemeinsam ergänzen und abschliessen

Öffne einen Eintrag über den Titel oder Pfeil und klicke «Bearbeiten». Alle Benutzer können sichtbare Einträge ergänzen, auch Einträge anderer Personen. Du kannst Beschreibung und Dateien hinzufügen sowie Status und Priorität ändern. Wärmeverbund, Standort, Anlage, Datum, Titel und bisheriger Text bleiben bestehen. Neue Folgehandlungen dokumentierst du als Ergänzung; bestehende Folgehandlungen werden nicht frei umgeschrieben.

«Erfasst von» bleibt der ursprüngliche Ersteller; «Zuletzt ergänzt» zeigt den letzten Bearbeiter. Die Personenanzeige sammelt tatsächliche Ersteller und Bearbeiter. Mit «Als erledigt markieren» schliesst du eine offene Pendenz ab. Nur der Admin sieht den vollständigen Änderungsverlauf und kann Einträge dauerhaft löschen.

### Personen erwähnen

Schreibe in Beschreibung, Ergänzung oder beim Erstellen in den nächsten Schritten @ und wähle den vollständigen Namen aus. Eindeutige Vornamen werden ebenfalls erkannt; die Auswahl vermeidet Tippfehler. Beispiel: «Brandschutzklappen ausgetauscht und mit @Patrick Jenk kontrolliert. Revision in Auftrag gegeben. Terminbestätigung steht noch aus.» Solange die Folgearbeit offen ist, passt «Pendenz».

Die Person erscheint unter «Erwähnte Personen». Eine Erwähnung macht sie nicht zum Ersteller oder Bearbeiter und weist keine Aufgabe zu. Für eine Antwort ergänzt sie den gleichen Eintrag. Es gibt keinen separaten Chat und keine E-Mail-, SMS- oder Push-Benachrichtigungen. Dringende Störungen müssen zusätzlich über den betrieblich vereinbarten direkten Meldeweg gemeldet werden.

### Der Umschlag und seine Zahl

Der Umschlag ist immer sichtbar. Die Zahl zählt sichtbare Einträge mit deiner @Erwähnung in Beschreibung oder nächsten Schritten, nicht die einzelnen Nennungen. Eigene Einträge zählen nur, wenn du darin zusätzlich erwähnt bist.

| Umschlag | Bedeutung |
| --- | --- |
| Rot | Neue, noch nicht über den Umschlag angesehene Erwähnung; auch bei erledigten Einträgen |
| Orange | Keine ungesehene Erwähnung, aber mindestens ein erwähnter Eintrag ist noch offen |
| Blau | Keine ungesehene Erwähnung, alle erledigt oder Zahl 0 |

Rot hat Vorrang vor Orange. Neue Erwähnungen werden auch nach deiner Abwesenheit angezeigt. Ein Klick filtert alle deine Erwähnungen und markiert die aktuell sichtbaren als gesehen. Rot wird dann je nach Status orange oder blau. Lesen erledigt keine Pendenz. Der Gesehen-Stand bleibt pro Konto am Server gespeichert, auch auf anderen Geräten. Ein Klick auf «Dashboard» zeigt danach wieder alle Einträge.

<!-- PAGE -->
## Dokumente und Benutzerrechte

### Dateien ablegen und öffnen

Wähle den Standort und öffne «Dokumente». Öffne den Zielordner und verwende «Dateien hochladen»; mehrere Dateien sind möglich. Am Computer kannst du Dateien auf einen Ordner oder in die Ablagefläche ziehen. Ohne gewählten Ordner ist der Upload-Button deaktiviert. Am Handy verwendest du die Dateiauswahl.

Suche nach Dateien oder Ordnern. Dateiliste und Ordnerpfad helfen bei der Orientierung. Du siehst Name, Ordner, Typ, Grösse sowie ablegende Person und Datum. Ein Klick auf den Namen oder Doppelklick öffnet PDF- und Bildvorschauen. Andere Dateien werden heruntergeladen und im passenden Programm geöffnet. «Download» ist auch für PDF und Bilder verfügbar.

Eigene normale Uploads kannst du mit «Umbenennen / Verschieben» ändern oder in einen anderen Ordner ziehen. Uploads anderer Personen und des Admins kannst du nur ansehen und herunterladen. Prüfe vor dem Hochladen Standort und Ordner und verwende einen sprechenden Dateinamen. Beachte bei einem Fehler die konkrete Meldung zu Format, Grösse oder Berechtigung.

### Wer darf was

WVM und EPC haben dieselben normalen Bedienrechte. Die Firmenfarbe gibt keine zusätzlichen Rechte.

| Funktion | WVM und EPC | Admin |
| --- | --- | --- |
| Sichtbare Logbucheinträge lesen und erstellen | Ja | Ja |
| Andere Einträge ergänzen und Dateien anhängen | Ja | Ja |
| Status und Priorität ändern | Ja | Ja |
| Ersteller Bearbeiter und Erwähnungen sehen | Ja | Ja |
| Vollständigen Änderungsverlauf sehen | Nein | Ja |
| Logbucheinträge dauerhaft löschen | Nein | Ja |
| Dokumente lesen herunterladen und hochladen | Ja | Ja |
| Eigene normale Uploads ändern und löschen | Ja | Ja |
| Fremde oder Admin-Uploads ändern und löschen | Nein | Ja |
| Ordner und Anlagen verwalten | Nein | Ja |
| Benutzer verwalten und Passwörter zurücksetzen | Nein | Ja |

### Adminfunktionen

«Benutzer verwalten» erlaubt Konten mit Name, eindeutigem Kürzel und Rolle anzulegen. Ein zufälliges Startpasswort wird einmal angezeigt und sicher weitergegeben. Nach Anlegen oder Zurücksetzen muss der Benutzer ein eigenes Passwort festlegen. Der Admin kann andere Benutzer löschen und das Sicherheitsprotokoll ansehen.

Über «Anlagen verwalten» beim Standort pflegt der Admin die freigegebenen Anlagen. Er verwaltet Ordner und Unterordner sowie alle Dokumente. Vor dem Löschen eines Ordners mit Dokumenten müssen die Dateien verschoben werden. Beim Löschen eines Logbucheintrags werden Verlauf und zugehörige Anhänge dauerhaft entfernt.

### Erledigte Einträge zum Quartalswechsel

Erledigte Einträge aus früheren Quartalen werden ab 1. April, 1. Juli, 1. Oktober und 1. Januar nach Schweizer Zeit für normale Benutzer ausgeblendet. Ihre Anhänge sind dann nur noch für den Admin zugänglich; auch die Erwähnungen zählen nicht mehr im normalen Umschlag. Offene Pendenzen bleiben sichtbar.

Der Admin behält erledigte Einträge und Verlauf. Es handelt sich um eine Ausblendung, keine automatische Löschung. Dokumente in der Dokumentenablage werden durch diese Logbuchregel nicht entfernt.
