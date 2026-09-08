# Vercel: Web-App und privater Upload-Workflow

Die Web-App ist für Next.js auf Vercel vorbereitet. Medienbytes werden im Live-Modus direkt in private Supabase-Storage-Buckets übertragen. Trigger.dev führt Dateiprüfung, FFmpeg und Modellaufträge aus. `vercel.json` legt Framework, Installation und Build fest; Vercel braucht weder FFmpeg noch beschreibbaren dauerhaften lokalen Speicher.

## Build-Konfiguration

`next.config.ts` aktiviert `output: 'standalone'` nur ausserhalb von Vercel. Bei `VERCEL=1` übernimmt der Vercel-Adapter das Verpacken der Functions. Next 16.3.4 erzeugt mit einem Adapter die Server-Tracedatei nicht, die der zusätzliche Standalone-Schritt erwartet. Der erste Cloud-Build scheiterte deshalb nach erfolgreicher Kompilierung mit `ENOENT .next/next-server.js.nft.json`. Der Docker-Build benötigt weiterhin seine Standalone-Ausgabe. Node ist in `package.json` und Lockfile auf `24.x` begrenzt, damit der Hoster nicht automatisch auf eine neue Hauptversion wechselt. [Next-Ausgabeformat](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Vercel-Node-Version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Reihenfolge für die erste Einrichtung

1. Den vollständigen Quellcode ins gewünschte GitHub-Repository übertragen, nicht die ZIP-Datei allein. Im gewählten Root-Verzeichnis müssen `package.json`, `package-lock.json`, `src` und `vercel.json` liegen. Der aktuelle lokale Branch heisst `feat/vercel-uploads`; der mitgelieferte `main`-Grundstand allein enthält nur eine README. [GitHub-Übergabe](github-upload.md).
2. Im eigenen Supabase-Projekt **alle vier Migrationen in Dateinamenreihenfolge** anwenden. Wenn die ersten drei bereits ausgeführt wurden, nur `202609070001_direct_uploads.sql` ergänzen. Vorhandene Tabellen nicht löschen oder die initialen Migrationen blind wiederholen. Der Publishable Key erlaubt keine Schema-Migrationen.
3. Trigger.dev-Projekt einrichten und `npm run worker:deploy` mit dem eigenen autorisierten Konto ausführen. Die Tasks `media-upload` und `recover-uploads` müssen aktiv sein, zusätzlich zu den vier bisherigen Tasks. Backendvariablen in Trigger setzen; der Upload-Worker benötigt Supabase-URL und Service-Role-Key. Er benötigt weder fal noch Stripe für reine Datei-Uploads. Die FFmpeg-Erweiterung ist bereits konfiguriert.
4. In Vercel das Repository importieren. **Application Preset: Next.js**, **Root Directory: Ordner mit package.json**, **Node.js: 24.x**. Build `npm run build`, Installation `npm ci`, Output Directory automatisch. Als Quellbranch den vollständigen Implementierungsstand verwenden bzw. diesen zuvor regulär nach `main` übernehmen.
5. Die folgenden Umgebungsvariablen eintragen. Geheime Werte nur in die jeweiligen Secret-Einstellungen, nie in Git oder Chat kopieren. Die bekannte öffentliche Supabase-Konfiguration im Arbeitsverzeichnis wird absichtlich nicht in das Quellcodepaket exportiert.

| Variable                               | Wert/Zweck                                                                       | Web       | Worker                            |
| -------------------------------------- | -------------------------------------------------------------------------------- | --------- | --------------------------------- |
| `APP_MODE`                             | `live` (Demo ist im Produktionsbuild gesperrt)                                   | Ja        | Ja                                |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL des eigenen Supabase-Projekts                                                | Ja        | Ja                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Öffentlicher Publishable Key                                                     | Ja        | Für Auth-Prüfungen bei Bedarf     |
| `SUPABASE_SERVICE_ROLE_KEY`            | Geheimer Service-Role-Key des gleichen Projekts                                  | Ja        | Ja                                |
| `TRIGGER_SECRET_KEY`                   | Secret für das passende Trigger-Environment                                      | Ja        | SDK-/Projektkonfiguration         |
| `TRIGGER_PROJECT_ID`                   | Project-Ref für CLI/Worker-Deployment                                            | Optional  | Ja                                |
| `APP_URL`                              | Gewünschte vollständige HTTPS-Adresse; für Produktionsalias/Custom Domain setzen | Empfohlen | Für Modell-Callbacks erforderlich |
| `ENABLE_PAID_GENERATION`               | Vorerst `false`                                                                  | Ja        | Ja                                |
| `ENABLE_STRIPE_CHECKOUT`               | Vorerst `false`                                                                  | Ja        | Optional                          |
| `ALLOW_STRIPE_LIVE`                    | Vorerst `false`                                                                  | Ja        | Ja                                |
| `ADMIN_USER_IDS`                       | Supabase-UUIDs der berechtigten Gründer, kommasepariert                          | Für Admin | Optional                          |

`APP_URL` kann beim ersten Vercel-Build fehlen, wenn Systemvariablen aktiviert sind: Produktion verwendet `VERCEL_PROJECT_PRODUCTION_URL`, Preview bevorzugt `VERCEL_BRANCH_URL`, sonst `VERCEL_URL`. Ein explizites `APP_URL` hat Vorrang. Die Origin-Prüfung akzeptiert im Preview zusätzlich genau die vom Hoster gelieferten Branch-/Deployment-Domains. Keine beliebigen Request-Host-Header werden vertraut. Preview möglichst mit einem separaten Supabase-/Trigger-Testprojekt betreiben; Produktionssecrets nicht pauschal auf alle Preview-Branches verteilen.

6. In Supabase Auth die tatsächliche Website als Site URL setzen und `https://DEINE_DOMAIN/auth/callback` zur Redirect-Allowlist hinzufügen. Für Preview die konkreten eigenen Preview-Adressen ergänzen. Eigenen SMTP-Versand konfigurieren. Änderungen an öffentlichen `NEXT_PUBLIC_*`-Werten benötigen einen neuen Build.
7. Zuerst Login, Charakteranlage und ein kleines eigenes Referenzbild prüfen. Danach eine geeignete MP4-Bewegungsreferenz über 4,5 MB testen; sie muss direkt zu Supabase gehen und nach Worker-Prüfung in der Library erscheinen. Dafür fällt keine fal-Generierung an; reguläre Storage-/Worker-Nutzung zählt dennoch beim jeweiligen Anbieter.

fal-/Stripe-Variablen erst für die jeweiligen nächsten Phasen nach [README](../README.md) und [Betrieb](operations.md) ergänzen. Ein laufender Web-Build ist kein Nachweis einer vollständigen Modell-, Storage- oder Zahlungsintegration. Keine automatische öffentliche Veröffentlichung oder kostenpflichtige Generierung ist in CI eingerichtet.

## Was der Upload technisch macht

1. `POST /api/uploads` nimmt kleines JSON mit MIME, Bytezahl, optionalem Charakter und Idempotenzschlüssel an. Die Datenbank prüft Eigentum, reserviert Speicher und begrenzt aktive Uploads auf drei pro Workspace.
2. Der Server stellt ein Supabase-Uploadtoken für genau einen zufälligen Pfad aus (`upsert: false`). Zwei getrennte private Eingangs-Buckets begrenzen Bilder auf 10 MiB und MP4 auf 100 MiB. Es gibt keine öffentlichen Lese- oder allgemeinen Browser-Schreibrechte für diese Buckets.
3. Der Browser ruft den offiziellen SDK-Aufruf `uploadToSignedUrl` direkt gegen Supabase auf. Bei unklarer Antwort wird der ursprüngliche Upload abgeglichen; die Vercel-Route erhält keine Datei. Der Fertig-Callback markiert den gespeicherten Upload-Auftrag als `queued`. Bei verlorener Bestätigung kann die Statusanzeige die Prüfung desselben Uploads erneut anstossen.
4. `media-upload` prüft Mitgliedschaft, tatsächliche Bytezahl, Dateisignatur, Decodierbarkeit, Abmessungen und Dauer. Sharp/FFmpeg entfernen Metadaten. Nur normalisierte Dateien werden mit einer unveränderlichen Asset-ID in `creator-private` gespeichert und in einer einzigen Datenbanktransaktion veröffentlicht.
5. Leases verhindern parallele Veröffentlichung; ein überholter Worker darf kein Ergebnis freigeben. `recover-uploads` nimmt unterbrochene Aufträge wieder auf. Maximal fünf Prüfversuche, fünf gleichzeitige Upload-Worker und fünf Minuten pro Worker-Lauf. Die Library zeigt wartende oder fehlgeschlagene Prüfungen.
6. Upload-Tokens sind nach Supabase-Vertrag zwei Stunden gültig. Die App stellt sie nur in den ersten zehn Minuten aus. Rohdateien bleiben deshalb bis mindestens 135 Minuten nach Auftragserstellung privat liegen und werden dann vom Recovery-Task entfernt. Ein zu frühes Löschen würde einen erneuten Upload mit noch gültigem Token erlauben. Bis zur bestätigten Löschung wird die volle Bucket-Kapazität auf das Speicherlimit angerechnet; normalisierte Ergebnisse zählen zusätzlich.

Die derzeitige Übertragung ist ein einzelner signierter Upload, kein TUS-Upload mit Wiederaufnahme einzelner Chunks. Bei abgebrochener Verbindung kann eine erneute vollständige Übertragung nötig sein. Die im Hintergrund laufende Dateiprüfung ist dagegen wiederaufnehmbar. Die lokale Demo behält ihre lokale Upload-Strecke; sie sendet keine Dateien an Supabase.

## Anbietergrenzen und Freigabe

- Vercel Functions erlauben normale Request-/Response-Payloads bis 4,5 MB. Deshalb transportieren sie hier nur Metadaten bzw. signierte Weiterleitungen. [Vercel-Limits](https://vercel.com/docs/functions/limitations).
- Supabase setzt zusätzlich ein projektweites Dateilimit. **Free-Projekte erlauben höchstens 50 MB je Datei**. Für 100-MiB-Motion-Dateien, grössere Trainingsarchive oder Gewichte ist ein passendes eigenes Storage-Limit/Tarif erforderlich. Kleinere Referenzbilder funktionieren innerhalb dieser Grenze. Keine automatische Tarifänderung. [Supabase-Dateilimits](https://supabase.com/docs/guides/storage/uploads/file-limits).
- SDK-Vertrag geprüft anhand `@supabase/storage-js` 2.115.0 (`StorageFileApi.ts`, `createSignedUploadUrl` und `uploadToSignedUrl`) und dessen offiziellen JSDoc-Beispielen; der vollständige SDK-Aufruf ist offline mit simulierten HTTP-Antworten getestet. [Offizieller SDK-Quellcode](https://github.com/supabase/supabase-js/tree/master/packages/core/storage-js).
- Die Callback-Adresse muss für fal/Stripe erreichbar sein. Vercel Deployment Protection kann externe Callbacks blockieren. Ein separates Staging-Ziel mit freigegebenem Callback verwenden; keinen Schutz stillschweigend ausschalten. [Systemvariablen](https://vercel.com/docs/environment-variables/system-environment-variables).

Nach Wiederherstellung des Vercel-Zugriffs und Korrektur der Buildausgabe meldete die zweite Vorschau am 8. September tatsächlich `READY`: <https://chriklfield-k3bt7m4b7-chrikl.vercel.app/login>. Sie wurde direkt aus Dateien erstellt. Die anschliessende Seitenprüfung hing und wurde abgebrochen; ein funktionierender Login oder Medien-Workflow ist damit nicht bestätigt. Auth/Storage, vier Live-Migrationen und Trigger-Deployment müssen noch im eigenen Konto eingerichtet und praktisch geprüft werden. Deployment-ID, Quellcommit und belegter Stand stehen in [verification.md](verification.md).
