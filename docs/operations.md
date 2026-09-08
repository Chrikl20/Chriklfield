# Betrieb und Wiederanlauf

## Laufzeiten

Web: Node 24, Next.js auf Vercel oder im enthaltenen Standalone-Container, HTTPS. Im Live-Modus erhält der Webprozess nur kleine JSON-Metadaten; private Mediendateien gehen direkt zu Supabase Storage. FFmpeg/FFprobe sind nur für den lokalen Demo-Upload im Webprozess erforderlich. Worker: Trigger.dev Node-Laufzeit, FFmpeg-Extension, `medium-1x`, bis 600 Sekunden pro Modelljob bzw. 300 Sekunden pro Upload-Prüfung. Zustand liegt in PostgreSQL/Storage, nicht im Worker-Dateisystem. Temporäre Dateien werden im `finally` entfernt.

Trigger-Secrets sind separat vom Webhost zu setzen: Supabase URL/Service-Role-Key, fal-Key/Account-ID/Binding-Secret, `APP_URL`, Modellfreigabe, Stripe-Test- oder freigegebene Live-Secrets und Produkt-IDs. Niemals private Medien oder vollständige Prompts in Task-Payloads speichern.

| Task                | Takt / Zweck                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `creator-job`       | Ein Job; Vorbereitung, ein bezahlter POST oder erneutes Lesen/Sichern                                                                |
| `recover-jobs`      | Jede Minute; Outbox dispatchen und aktive Jobs abgleichen                                                                            |
| `recover-payments`  | Alle fünf Minuten; nur bereits signaturgeprüfte, unverarbeitete Stripe-Inbox-IDs erneut autoritativ laden; max. zehn Wiederaufnahmen |
| `private-retention` | Stündlich um Minute 17; Tombstones physisch löschen, alte ZIPs/Angebote/Zähler entfernen, Payloads redigieren                        |
| `media-upload`      | Private Rohdatei prüfen, normalisieren und mit fester Asset-ID veröffentlichen                                                       |
| `recover-uploads`   | Jede Minute; Uploads wiederaufnehmen, abgelaufene Aufträge beenden und Rohdateien nach Tokenablauf entfernen                         |

Outbox-Lease: zwei Minuten, Tokenprüfung, max. 100 Dispatch-Versuche. Job-Lease: zehn Minuten. Trigger-Laufwiederholungen: max. drei mit Verzögerung. Diese Wiederholungen sind **keine** Erlaubnis für einen zweiten fal-POST. Der Minutenabgleich setzt unter derselben Datenbankzustandsmaschine fort. Anhaltende Speicher-/Statusfehler bleiben sichtbar und reserviert, bis sie geklärt sind.

## Störung bearbeiten

1. Bei Kostenauffälligkeit im Adminpanel **Neue Starts pausieren**. Laufende Jobs weiter abgleichen und sichern. `ENABLE_PAID_GENERATION=false` stoppt zusätzlich noch nicht abgeschickte Worker; bereits angenommene Anfragen werden trotzdem weiter abgeglichen.
2. `DISPATCH_FAILED`: Trigger-Zugang/Projekt prüfen, Outbox nicht löschen. Der Zeitplan übernimmt nach Wiederherstellung. Nach 100 Versuchen Ursache prüfen und den Outbox-Zähler gezielt zurücksetzen; kein neues Jobobjekt als Umgehung erstellen.
3. `PROVIDER_ACCEPTANCE_UNKNOWN`: Nicht auf „noch einmal generieren“ ausweichen. Callback abwarten; vorhandene fal-Request-ID eindeutig anhand des Anbieterjournals zuordnen. Im Admin-Kostendialog verknüpfen; der Status wird beim Anbieter geprüft. Ohne Request-ID nur nach bestätigter **Nichtannahme und Nichtberechnung** mit Beleg/Ticket freigeben. Timeout oder 404 allein reichen nicht. Verknüpfung/Freigabe sind im Auditlog sichtbar.
4. `RESULT_RECONCILIATION_REQUIRED`: Supabase-Speicher, Allowlist, Byte-/Schema-/Laufzeitgrenzen prüfen. Bereits gespeicherte Ergebnis-IDs bleiben bestehen. Keine Reservierung manuell überschreiben, solange ein bezahltes Resultat gesichert werden kann.
5. `PAYMENT_RECONCILIATION_REQUIRED`: Signatur/Produkt/Invoice-Payment-Konfiguration prüfen. Rohdaten bei Stripe ansehen, keine Credits aus der Erfolgsseite erzeugen. Nach Fehlerkorrektur das Originalevent im Stripe-Dashboard erneut zustellen oder einen unverarbeiteten Inbox-Eintrag gezielt zur Wiederaufnahme freigeben.
6. `LATE_CONFLICTING_WEBHOOK`: Anbieterstatus und Rechnung abgleichen. Ein bereits abgeschlossenes Kundensettlement bleibt unverändert; Kulanzkorrekturen benötigen einen eigenen auditierbaren Vorgang.
7. `PROVIDER_RETENTION_REVIEW`: Lokale Löschung ist abgeschlossen. Externe Aufbewahrung/vertragliche Löschung bearbeiten und dokumentieren. Keine pauschale vollständige Löschbestätigung senden.

## Beobachtung

Alarme werden dedupliziert in `alerts` erfasst und im Adminpanel angezeigt; **kein externer Alarm wurde versendet**. Vor Produktionsbetrieb einen gewählten Alarmkanal anschliessen. Alarmregeln: Budget 80 %, unbekannte Annahme, nicht lesbarer Anbieterstatus, Dispatch-/Persistierungs-/Zahlungsfehler, widersprüchliche späte Webhooks, externe Löschprüfung.

Prüfe täglich Alter aktiver Jobs, gebundene Credits, fehlende Kostenbelege und unverarbeitete Inbox-Einträge. Preise spätestens wöchentlich neu verifizieren. `provider_attempts.actual_microusd` mit fal-Rechnung abgleichen; fehlgeschlagene Versuche gehören dazu. Trigger/Supabase/Stripe-Gebühren separat erfassen. Kein Nachweis niedrigerer Kosten pro brauchbarem Ergebnis ohne Messreihe.

## Sicher aktualisieren

Erst CI und Modellvertragstests, danach Migrationen im Staging-Projekt, Auth-/RLS-Prüfung mit zwei Konten, separat freigegebener kleiner Provider-Test, schliesslich abgestimmtes Deployment. Backups/PITR vor Schemaänderungen konfigurieren und Restore praktisch testen. Keine `db reset`-Anweisung gegen Live-Projekte.

Ein Rollback der Web-/Worker-Version macht entstandene Anbieteranfragen nicht rückgängig. Persistierte Jobs müssen mit einer kompatiblen Zustandsmaschine weiter abgeglichen werden. Alte Adapter-/Preiskonfigurationen nicht aus laufenden Job-Snapshots entfernen.

## Produktvergleich für beide Gründer

Je Trainingsversion dieselben freigegebenen 12 Testszenen verwenden: Gesicht frontal/profil, Ganzkörper, mehrere Ausdrücke, bekannte/neue Outfits, schwieriges Licht und Bewegung. Kriterien vorab festlegen (Gesicht, Proportionen, Hände, Prompttreue, Videoartefakte, benötigte Nacharbeit). Content-Gründer bewertet ohne Kenntnis des Anbieters; Technik-Gründer erfasst alle Versuche, Zeiten und Rechnungskosten. **Kosten pro brauchbarem Ergebnis = gesamte Versuchs-/Betriebskosten / freigegebene Ergebnisse**. Einschliesslich Fehlschlägen, nicht nur schöner Treffer. Ergebnisse manuell als Testbilder speichern; Referenzbasis nur gezielt ergänzen. Aktuell liegen keine Vergleichsdaten oder Überlegenheitsnachweise vor.

## Direktuploads

`media-upload` und der minütliche `recover-uploads` müssen aktiv sein. In `upload_intents` sind Zustände, Fehlermeldungen, Versuche und Lease gespeichert; keine Rohdateien oder Token loggen. Bei `UPLOAD_DISPATCH_FAILED` Trigger-Konfiguration prüfen. Bei `UPLOAD_WORKER_NOT_CONFIGURED` FFmpeg-Erweiterung neu bauen. Unvollständige Dateien werden nicht in die Library übernommen. Nach fünf Versuchen bleibt der Auftrag terminal fehlgeschlagen; keine endlosen automatischen Prüfungen. Rohspeicher erst nach Tokenablauf und erfolgreichem physischem Purge freigeben. Leases nicht manuell abkürzen, solange ein Worker noch läuft.
