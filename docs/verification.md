# Liefer- und Prüfstand

Stand: 8. September 2026. Dieses Dokument trennt Implementierung von tatsächlich ausgeführten Prüfungen. Die anfänglichen GitHub-Schreibversuche wurden mit HTTP 403 abgewiesen. Nach Installation des ChatGPT Codex Connectors gelang am 8. September der erste Remote-Commit (`5ca404bf0a8210ed0d0cc002fc9b3473af038da2`); der Arbeitsbranch `feat/vercel-uploads` wurde angelegt. Die vollständige Quellübergabe und CI-Prüfung folgen darauf.

| Umfang                                                   | Stand                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Next/React/TypeScript, Oberfläche, Auth, private Uploads | Implementiert; lokale Demo startet                                        |
| Krea-Training, LoRA-Inferenz, Seedream-Referenzen        | Echte Adapter und Hintergrundablauf implementiert; keine Live-Generierung |
| Versionen, Captions, Freigaben, Trainingszuschnitte      | Implementiert; Archiv-/SQL-Tests vorhanden                                |
| Kling I2V/Motion, Library, FFmpeg                        | Implementiert; keine echte Kling-Generierung                              |
| Stripe, Reservierungen, Outbox, Recovery, Admin          | Implementiert; lokale Transaktions-/Signaturtests                         |
| Dokumentation, Lockfile, CI, Container                   | Enthalten                                                                 |
| Vercel, private Direktuploads, asynchrone Dateiprüfung   | Implementiert; vierte Migration und Upload-/Recovery-Tests bestanden      |

## Tatsächlich geprüft

- Node 24.19.0, npm 11.9.0; Neuinstallation mit `npm ci` am 6. September erfolgreich, Abhängigkeiten im Lockfile festgeschrieben. Die Vercel-Anpassung benötigt keine weiteren Abhängigkeiten.
- Vollständiges `npm audit --json`: 0 bekannte Schwachstellen am 7. September 2026, einschliesslich Entwicklungsabhängigkeiten. Das ist ein zeitgebundener Datenbankabgleich, keine allgemeine Sicherheitsgarantie.
- Worker-Werkzeuge: Konfigurations-Merge, TAR-Archiv-Rundlauf und Bundle des gesamten Worker-Einstiegs offline geprüft; `npm run worker:dev -- --help` erfolgreich. Der installierte CLI-Binaryname ist `trigger`. Kein Trigger-Deployment ausgeführt.
- 43 Vitest-Tests in sieben Dateien bestanden: alle vier PostgreSQL-Migrationen über PGlite, RLS zweier Nutzer, serviceexklusive RPCs, Reservierungen, Deduplikation, späte Events, Neustarts/Leases, Trainingsfehler/Snapshots, Rückerstattungen, Löschrennen, Ed25519/Stripe-Signaturen, Adapterfelder, kein zweiter POST bei unklarer Annahme, Dateiformate/Archive/SSRF.
- Die elf zusätzlichen Tests prüfen private Upload-Aufträge, Speicherreservierungen, fremde Nutzer, abgelaufene Leases, atomare und doppelte Veröffentlichung, begrenzte Wiederaufnahme, verzögerten Rohdaten-Purge, Rechteentzug, ungültige Dateiinhalte, unklare Datenbankantworten sowie exakte Vercel-Origins und den tatsächlich installierten Supabase-SDK-Aufruf mit simulierten HTTP-Antworten.
- Vollständiges `APP_MODE=live NEXT_TELEMETRY_DISABLED=1 npm run check` am 7. September erfolgreich: Typprüfung einschliesslich `next typegen`, Linting, Worker-Bundle/Werkzeuge, alle 43 Tests und Produktionsbuild mit Next 16.3.4 (12 Seiten/Routen, dynamische API und Auth-Callback). Routentypen werden für einen frischen Checkout vor der Typprüfung erzeugt.
- Am 8. September nach der Buildkorrektur: Produktionsbuild mit `VERCEL=1`, `APP_MODE=live` und einem lokalen Testadapter über `NEXT_ADAPTER_PATH` erfolgreich, einschliesslich Typprüfung, aller 12 Seiten/Routen und `onBuildComplete`. ESLint für die geänderte Next-Konfiguration erfolgreich. Es wurden nur Buildkonfiguration und Node-Versionsgrenze verändert; die 43 fachlichen Tests stammen weiterhin vom 7. September.
- Desktop-Browser am 6. September: Explore visuell geprüft; Bildstudio, vorherige Preisbestätigung, Demo-Auftrag mit einmaliger Abbuchung und Übernahme des Bildes ins Video Studio, Videopreisbestätigung und fertiger Demo-Testclip geprüft. Charakterauswahl blieb erhalten. Gefundener HTTP-Vorschaufehler bei `crypto.randomUUID` behoben und Preisbestätigung erneut erfolgreich geprüft. Der neue Direktupload wurde noch nicht im Live-Browser geprüft.

## Noch getrennt zu verifizieren

Die öffentliche Supabase-URL und der Publishable Key sind lokal eingerichtet. Supabase-Service-Role-Key sowie fal-/Trigger-/Stripe-Backendzugänge fehlen. Migrationen wurden nicht auf das eigene Supabase-Projekt angewendet. Auth-Mailversand, echte RLS-/Storage-Integration, Provider-Callbacks, reale Trainings-/Generierungsresultate, Trigger-Deployment und Zahlungen sind deshalb **nicht live bestätigt**. Keine bezahlten Modellaufrufe oder echten Zahlungen ausgeführt.

Die Umgebung hat keinen verwendbaren nativen PostgreSQL-Dienst. PGlite führt echte SQL-Funktionen aus, serialisiert aber Verbindungen intern; es ist kein Beleg für konkurrierende Serververbindungen. `npm run test:postgres` und der CI-PostgreSQL-Job sind für drei unabhängige Verbindungen einschliesslich zwölf Payment-/Refund-Rennen, paralleler Upload-Speicherreservierungen und doppelter Fertigmeldungen eingerichtet, hier aber nicht ausgeführt.

Playwright enthält Desktop- und Mobilprüfungen aller Kernseiten und des Angebotsablaufs. Sie wurden hier nicht ausgeführt; die verfügbare Browsersteuerung bot keine mobile Viewport-Emulation. Die responsive CSS-Umsetzung wurde geprüft, ist aber kein Ersatz für einen mobilen Browserlauf. CI konnte vor Behebung des GitHub-Zugriffs nicht gestartet werden. Docker und Supabase CLI wurden nicht ausgeführt. Es gibt noch keine erfolgreich freigegebene öffentliche Produktion.

## Tatsächlicher Vercel-Versuch am 7. September

Der verbundene Vercel-Dateiupload hat 113 Dateien angenommen und zunächst `INITIALIZING` gemeldet. Angefordert wurde `target: preview`; die nach Wiederherstellung des Zugriffs abrufbare Deployment-Metadaten ordnen diesen ersten Versuch als `production` ein. Quellstand: Commit `c4b4928d91a3612d9dfe0d2150d5a38c7134d965` auf `feat/vercel-uploads`. Zusätzlich zu den 112 Repository-Dateien wurde eine nur für das Deployment vorbereitete `.env.production` mit der bekannten öffentlichen Supabase-Konfiguration, `APP_MODE=live` und deaktivierten Generierungs-/Checkout-/Live-Zahlungsfreigaben übertragen. Keine Backend-Secrets, lokalen Demodaten oder Git-Dateien wurden übertragen.

- Deployment-ID: `dpl_8d1osR8jwczAFPXdEmBBHnghwPni`.
- Vorschau: <https://chriklfield-mhi1ar0s6-chrikl.vercel.app>.
- Build-Ansicht: <https://vercel.com/chrikl/chriklfield/8d1osR8jwczAFPXdEmBBHnghwPni>.

Die anschliessenden Abfragen des Deployments und Projekts wurden zunächst mit **HTTP 403** abgewiesen. Nach erneuter Verbindung ist Vercel am 8. September erreichbar. Der erste Build war tatsächlich mit `ENOENT .next/next-server.js.nft.json` fehlgeschlagen: Der aktive Next-Buildadapter erzeugt die Datei nicht, der zusätzlich aktivierte Standalone-Schritt benötigt sie aber. `next.config.ts` trennt nun die Vercel-Ausgabe von der Standalone-Ausgabe für Docker. Kein Zugriffsschutz wurde abgeschaltet.

## Erfolgreicher Vercel-Build am 8. September

Der korrigierte Quellstand `bb8fca9b87d81e89f9e8b7c9c33a9f53f8d78122` wurde erneut als Preview übertragen. Vercel meldete für `dpl_EZPEuBpQFKgUU2nQo3HVbB3FiQDq` tatsächlich `READY`; die Builddauer betrug rund 56 Sekunden. Der Metadatenwert `target` war `null`, passend zum angeforderten Preview. Keine Produktionspromotion und keine kostenpflichtige Generierung wurden ausgeführt.

- Vorschau: <https://chriklfield-k3bt7m4b7-chrikl.vercel.app/login>.
- Build-Ansicht: <https://vercel.com/chrikl/chriklfield/EZPEuBpQFKgUU2nQo3HVbB3FiQDq>.

Die anschliessende gebündelte Seiten-/Browser-/Logprüfung hing und wurde abgebrochen; daraus liegen keine verwertbaren Einzelresultate vor. `READY` bestätigt den Cloud-Build, nicht Login, E-Mail-Versand, Datenbank oder Medien-Workflow. Der Zugriffsschutz wurde nicht abgeschaltet. Backend-Zugangsdaten und Live-Migrationen fehlen weiterhin.

## Konkrete nächste Aufgaben vor öffentlichem Betrieb

1. Quellübergabe auf dem Arbeitsbranch und CI abschliessen. Staging-Konten/Secrets, vier Migrationen, sechs Trigger-Tasks, SMTP und HTTPS-Callback einrichten; zwei echte Nutzer gegeneinander prüfen. Die Supabase-Verbindung wurde als nächster Einrichtungsschritt angeboten; ihre Installation bei GitHub allein stellt dieser Arbeitsumgebung noch keinen Supabase-Zugriff bereit.
2. Kontobezogene fal-Preisformeln freigeben; nach ausdrücklicher Kostenfreigabe je einen kleinen Trainings-, Bild-, Edit-, I2V- und Motion-Test durchführen. Dateien, Webhook-/Polling-Recovery und Rechnungsbeträge abgleichen.
3. Stripe-Test-Checkout, Abo-Verlängerung, Teil-/Vollrefund im Zielprojekt prüfen; Dispute-/Chargeback-Prozess ergänzen. Keine Live-Credits aus Testevent-Fakes.
4. Externen Alarmkanal, Storage-Inventarabgleich, Anbieter-/Auth-Kontolöschung und Backup-Restore-Prozess vervollständigen. Nutzungs-/Datenschutz-/Modellbedingungen klären.
5. Charakterqualität, Kosten pro freigegebenem Ergebnis und mobile Nutzbarkeit mit beiden Gründern praktisch bewerten. Für grosse Bibliotheken Pagination und Mitgliedereinladungen ergänzen.
