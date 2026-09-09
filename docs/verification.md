# Liefer- und Prüfstand

Stand: 9. September 2026. Dieses Dokument trennt Implementierung von tatsächlich ausgeführten Prüfungen. Nach Installation des ChatGPT Codex Connectors gelang die GitHub-Übergabe: alle 112 Dateien wurden anhand ihrer Git-Blob-Prüfsummen mit dem lokalen Stand verglichen und mit Commit `b526d7168e5e19d5ea3be8a15b1ce4a921defce2` auf `feat/vercel-uploads` veröffentlicht. [Draft PR #1](https://github.com/Chrikl20/Chriklfield/pull/1) ist offen. `main` enthält weiterhin nur den Grundstand; es wurde nichts gemergt.

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

Die öffentliche Supabase-URL und der Publishable Key sind lokal eingerichtet. Supabase-Service-Role-Key sowie fal-/Trigger-/Stripe-Backendzugänge fehlen. Alle fünf Migrationen sind seit 9. September im Zielprojekt angewendet; Rollen-/RLS-Prüfungen sind unten belegt. Auth-Mailversand, tatsächliche JWT-/Storage-HTTP-Zugriffe, Provider-Callbacks, reale Trainings-/Generierungsresultate, Trigger-Deployment und Zahlungen sind deshalb **nicht live bestätigt**. Keine bezahlten Modellaufrufe oder echten Zahlungen ausgeführt.

Die lokale Umgebung hat keinen verwendbaren nativen PostgreSQL-Dienst. PGlite führt echte SQL-Funktionen aus, serialisiert aber Verbindungen intern; es ist kein Beleg für konkurrierende Serververbindungen. Nach Korrektur des Testeinstiegs bestand `npm run test:postgres` am 8. September in GitHub Actions mit PostgreSQL 17 und drei unabhängigen Verbindungen: zwölf Payment-/Refund-Rennen, parallele Credit- und Upload-Speicherreservierungen, doppelte Abrechnung/Fertigmeldungen und globale Budgets. Das belegt die getesteten Datenbankabläufe im CI-Testschema; Supabase Auth und Storage müssen weiterhin im Zielprojekt geprüft werden.

Playwright enthält Desktop- und Mobilprüfungen aller Kernseiten und des Angebotsablaufs. Im ersten GitHub-CI-Lauf am 8. September bestanden alle vier Tests auf Desktop Chromium und im emulierten iPhone-13-Layout. Das ersetzt keinen Test auf einem echten iPhone und bestätigt nur den expliziten Demo-Ablauf. Die CLI wurde am 9. September zum Anlegen der ergänzenden Migration verwendet; die fünf Live-Migrationen wurden über die verbundene Supabase-Anwendung ausgeführt. Es gibt noch keine erfolgreich freigegebene öffentliche Produktion.

## Erster GitHub-CI-Lauf am 8. September

[Lauf 34265766130](https://github.com/Chrikl20/Chriklfield/actions/runs/34265766130) auf `b526d716`:

- `quality`: erfolgreich, einschliesslich Installation, Audit, Typprüfung, Linting, Worker-Werkzeugen, Tests und Produktionsbuild.
- `browser`: erfolgreich; vier Desktop-/Mobiltests in 34,1 Sekunden. Kernseiten, beibehaltene Charakterauswahl und Preisbestätigung vor dem simulierten Ergebnis wurden geprüft.
- `postgres`: fehlgeschlagen, bevor Datenbanktests liefen. `tsx` interpretierte die Datei als CommonJS, während der Testeinstieg Top-Level-`await` verwendete. Der Einstieg ist jetzt in eine asynchrone `main()`-Funktion mit Fehlerbehandlung eingeschlossen; die fachlichen Assertions bleiben erhalten. Der lokale CommonJS-Transform mit dem installierten esbuild ist erfolgreich. Die lokale `tsx`-CLI-Prüfung war wegen eines gesperrten IPC-Sockets nicht möglich; der erfolgreiche Wiederholungslauf ist unten belegt.

## Erfolgreicher vollständiger GitHub-CI-Lauf

[Lauf 34266257916](https://github.com/Chrikl20/Chriklfield/actions/runs/34266257916) auf Commit `31e35b15a54d2acc54a7740c519bac702d17290d` ist mit **success** abgeschlossen. Alle drei Jobs bestanden: `quality` (Installation, Audit, Typprüfung, Linting, Worker-Werkzeuge, Tests und Produktionsbuild), `postgres` (echte parallele PostgreSQL-Verbindungen) und `browser` (Desktop-/Mobil-Demo). Dieser Lauf belegt den damaligen Quellstand. Aktuelle Folgeläufe und der jeweilige Commit sind im [Draft PR #1](https://github.com/Chrikl20/Chriklfield/pull/1) sichtbar. Keine Prüfung hat bezahlte Modellaufrufe, echte Zahlungen oder Live-Datenbankmigrationen ausgeführt.

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

Die anschliessende gebündelte Seiten-/Browser-/Logprüfung hing und wurde abgebrochen; daraus liegen keine verwertbaren Einzelresultate vor. `READY` bestätigt den Cloud-Build, nicht Login, E-Mail-Versand, Datenbank oder Medien-Workflow. Der Zugriffsschutz wurde nicht abgeschaltet. Dieser Preview wurde ohne Backend-Zugangsdaten gebaut. Die Datenbankmigrationen sind inzwischen angewendet; der vollständige Login-/Upload-Ablauf bleibt separat zu prüfen.

## Supabase tatsächlich eingerichtet am 9. September

Projekt `tslgkbtfdchkfriuealv` war `ACTIVE_HEALTHY` (PostgreSQL 17.6). Vor der Einrichtung: keine Anwendungstabellen, keine Buckets, keine Migrationen und ein vorhandener Auth-Nutzer. Dieser Nutzer wurde erhalten. Vier bereits in CI geprüfte Migrationen und eine lokal geprüfte ergänzende Rechtemigration wurden jeweils mit erfolgreicher Supabase-Antwort angewendet.

- 23 Anwendungstabellen; auf allen ist RLS aktiv.
- Drei private Buckets: `creator-private`, `creator-intake-images`, `creator-intake-videos`.
- Keine Schreib-/TRUNCATE-/REFERENCES-/TRIGGER-Rechte für `anon` oder `authenticated` auf Anwendungstabellen. Explizite SELECT-Grants plus Mitgliedschafts-Policies bleiben bestehen.
- Keine öffentlich oder für Browsernutzer ausführbare SECURITY-DEFINER-Funktion im API-Schema `public`. Die RLS-Hilfe liegt in `creator_private`, prüft die echte `auth.uid()` und hat einen leeren Suchpfad. Das interne Schema darf nicht als Data API-Schema exponiert werden.
- Die vom Dashboard angelegte automatische RLS-Eventfunktion bleibt erhalten; ihre unnötigen Client-EXECUTE-Rechte wurden entfernt.
- 26 vom Advisor gemeldete fehlende Fremdschlüsselindizes ergänzt. Nachkontrolle: keine fehlenden FK-Indizes mehr; nur 33 erwartete INFO-Meldungen über bislang ungenutzte Indizes einer leeren Anwendung.
- `tests/supabase-rls.sql` wurde vollständig im echten Projekt ausgeführt: Eigentümerzugriff, Fremdnutzer-Ausschluss, private Storage-Metadaten, gesperrte Client-RPCs/TRUNCATE und Eigentumsprüfung im privilegierten Backend bestanden. Die zwei temporären Nutzer und alle Testdaten wurden in derselben Transaktion zurückgerollt. Eine separate Nachkontrolle bestätigte wieder einen Auth-Nutzer, null Workspaces, null Storage-Objekte und null Ledger-Einträge.
- Zusätzlicher echter HTTP-Aufruf mit dem vorhandenen Publishable Key und dem installierten Supabase-SDK: SELECT auf private Charaktere wurde mit HTTP 401 / PostgreSQL-Code `42501` abgewiesen. Der Schlüssel ist gültig; die erwartete Zugriffsverweigerung ist wirksam.
- Alle sechs Modelle bleiben deaktiviert. Keine Testcredits, kostenpflichtigen Generierungen oder Zahlungen angelegt.

Der Security Advisor meldet noch zehn INFO-Hinweise „RLS enabled, no policy“ für absichtlich ausschliesslich serverseitige Tabellen ohne Client-Grants. Dafür werden keine pauschalen Policies ergänzt. Ein Auth-WARN bleibt: Schutz vor kompromittierten Passwörtern ist im Projekt deaktiviert. Die Anwendung nutzt aktuell E-Mail-Links; vor Freigabe einer Passwortanmeldung im Dashboard prüfen. [Advisor zu Tabellen ohne Policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [ungenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Typprüfung, ESLint und alle 44 Vitest-Tests in sieben Dateien bestanden am 9. September nach der Ergänzung. Der erste Typprüfungslauf fand eine fehlende Ergebnistypangabe im neuen Regressionstest; diese wurde korrigiert und der gesamte Lauf wiederholt.

Die Migrationen wurden lokal auf die tatsächlich von Supabase vergebenen Versionen umbenannt, ohne den SQL-Inhalt der ersten vier zu ändern. Lokale Tests laden alle SQL-Migrationen sortiert; die neue Regression simuliert die weitreichenden Supabase-Standardgrants und prüft ausdrücklich TRUNCATE. Ein MD5-Vergleich aller fünf SQL-Dateien mit den im Projekt gespeicherten Migrationen stimmt exakt überein. Keine Migration-History wurde manuell überschrieben. Details und Zuordnung: [supabase-setup.md](supabase-setup.md).

## Konkrete nächste Aufgaben vor öffentlichem Betrieb

1. Backend-Secrets in Vercel/Trigger, sechs Trigger-Tasks, SMTP und HTTPS-Callback einrichten; zwei echte Nutzer über Browser-JWTs und Storage-HTTP gegeneinander prüfen. Supabase ist verbunden, Schema und SQL-Zugriffsschutz sind eingerichtet. Konkrete Einrichtung: [supabase-setup.md](supabase-setup.md).
2. Kontobezogene fal-Preisformeln freigeben; nach ausdrücklicher Kostenfreigabe je einen kleinen Trainings-, Bild-, Edit-, I2V- und Motion-Test durchführen. Dateien, Webhook-/Polling-Recovery und Rechnungsbeträge abgleichen.
3. Stripe-Test-Checkout, Abo-Verlängerung, Teil-/Vollrefund im Zielprojekt prüfen; Dispute-/Chargeback-Prozess ergänzen. Keine Live-Credits aus Testevent-Fakes.
4. Externen Alarmkanal, Storage-Inventarabgleich, Anbieter-/Auth-Kontolöschung und Backup-Restore-Prozess vervollständigen. Nutzungs-/Datenschutz-/Modellbedingungen klären.
5. Charakterqualität, Kosten pro freigegebenem Ergebnis und mobile Nutzbarkeit mit beiden Gründern praktisch bewerten. Für grosse Bibliotheken Pagination und Mitgliedereinladungen ergänzen.
