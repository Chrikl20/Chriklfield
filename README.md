# chriklfield · Creator Studio

Eine private KI-Creator-Plattform für eigene Charaktere: **Referenzen freigeben → Krea-2-LoRA trainieren → Bilder erstellen → ein Bild mit Kling animieren → herunterladen.**

Next.js App Router, React, striktes TypeScript, Tailwind, Supabase Auth/PostgreSQL/Storage, Trigger.dev, fal und Stripe. Web und Hintergrundaufträge laufen als getrennte Prozesse im gleichen Repository. Die eigenständige Oberfläche ist dunkel, responsive und deutschsprachig.

**Status: ausführbare Entwicklungsversion mit explizitem lokalem Demo-Modus.** Echte Modelladapter sind implementiert. Live-Generierungen, reale Zahlungen und öffentliche Produktion wurden nicht ausgeführt. Der konkrete Prüfstand steht in [docs/verification.md](docs/verification.md). Es gibt keine belegte Überlegenheit gegenüber anderen Plattformen.

## In drei Schritten lokal starten

Voraussetzungen: Node.js **24 LTS**, npm, Git. Für Video-Uploads zusätzlich `ffmpeg` und `ffprobe` im PATH (z. B. `brew install ffmpeg` oder `apt-get install ffmpeg`).

Den vollständigen Implementierungsbranch klonen:

```bash
git clone --branch feat/vercel-uploads https://github.com/Chrikl20/Chriklfield.git chriklfield
cd chriklfield
npm ci
npm run demo
```

Alternativ das gelieferte Quellcode-ZIP entpacken und die letzten drei Befehle ausführen. Nach Installation des ChatGPT Codex Connectors gelang am 8. September der erste GitHub-Schreibzugriff. Die Anwendung wird auf `feat/vercel-uploads` zur Prüfung bereitgestellt; `main` enthält zunächst nur den Grundstand. Details zur Übernahme des früheren lokalen Git-Verlaufs: [GitHub-Übergabe](docs/github-upload.md).

Öffne **http://localhost:3000**. Keine Konten oder Schlüssel nötig. Die Demo simuliert Aufträge deterministisch mit gekennzeichneten Szenenfotos und einem lokalen Testclip. Sie speichert nur lokal unter `.demo/`; diese Daten gehören nicht ins Repository. `.demo/` bei gestopptem Server entfernen, um eigene **Demodaten** zurückzusetzen. Demo nie öffentlich bereitstellen; sie hat bewusst nur einen gemeinsamen Testnutzer. Unter `NODE_ENV=production` ist der Modus gesperrt. Es gibt keinen automatischen Wechsel von Live zu Demo.

## Enthaltene Arbeitsbereiche

| Bereich      | Funktionen                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explore      | Kuratierte, filterbare Szenenvorlagen; direkte Übernahme ins Studio                                                                                  |
| Characters   | Identitäts-/Körpermerkmale, private Uploads, Captions, vier Referenzarten, Vorschau des Trainingszuschnitts, Freigaben, versionierte Trainingsstände |
| Image Studio | Krea-2-Entwurf, kompatible Charakter-LoRA, referenzgestützter Seedream-Editor, Szene/Outfit/Pose/Format/Varianten, verbindliches Angebot vor Start   |
| Video Studio | Kling Image-to-Video und Motion Control, gespeichertes Startbild, private Bewegungsreferenz, geprüfte Dauer, Audiooption                             |
| Library      | Bilder/Videos, Favoriten, Download, Löschen, als Referenz oder Testbild übernehmen, direkt animieren                                                 |
| Billing      | Tarif, verfügbare/reservierte Credits, Verbrauchsledger, Checkout und Customer Portal                                                                |
| Admin        | Aufträge, Fehlermeldungen, Anbieterkosten, geprüfte Preisformeln, Templates, Startpause, belegter Abgleich unklarer Anfragen                         |

Ein Textprompt oder Seed ist **keine Identitätssicherung**. Referenzbilder und trainierte Versionen sind die Identitätsgrundlage; Gesicht und Körper müssen an Ergebnissen geprüft werden. Kleidungs- und Szenenangaben bleiben getrennt.

## Live-Konten einrichten

1. `cp .env.example .env.local`. `APP_MODE=live` setzen; Schlüssel nur in der lokalen Datei bzw. im Secret Store des Hosters eintragen. Die Datei bleibt git-ignoriert.
2. Supabase-Projekt anlegen, PostgreSQL 17 verwenden. Alle SQL-Dateien unter `supabase/migrations/` in Dateinamenreihenfolge anwenden. Mit der [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started): `supabase link --project-ref DEINE_REFERENZ`, danach `supabase db push`. Vorher das richtige Ziel prüfen; für bestehende Datenbanken Backup anlegen. Für einen frischen lokalen Stack: `supabase start`, `supabase db reset` (löscht lokale Daten).
3. In Supabase Auth Site URL und Redirect URL `https://DEINE_DOMAIN/auth/callback` konfigurieren; lokal zusätzlich `http://localhost:3000/auth/callback`. E-Mail-Anmeldung und einen eigenen SMTP-Dienst konfigurieren. URL, öffentlichen Publishable/Anon-Key und **separaten Service-Role-Key** in `.env.local` setzen. `creator-private` wird durch die Migration privat angelegt; keine öffentlichen Buckets erstellen.
4. Ein Trigger.dev-Projekt anlegen; Project-Ref und Secret-Key konfigurieren. `npm run worker:dev` in einem zweiten Terminal starten. Das Dashboard muss die Tasks `creator-job`, `recover-jobs`, `recover-payments`, `private-retention`, `media-upload` und `recover-uploads` zeigen. Für den Worker dieselben Backend-Variablen setzen. [Trigger.dev-Konfiguration](https://trigger.dev/docs/config/config-file).
5. fal-Konto und API-Key eintragen. `FAL_WEBHOOK_USER_ID` ist die zum Key gehörende fal-Nutzer-ID für die Signaturprüfung. Einen unabhängigen, mindestens 32 Zeichen langen `FAL_WEBHOOK_BINDING_SECRET` erzeugen, z. B. `openssl rand -hex 32`. Ein öffentlich erreichbarer **HTTPS**-Callback unter `APP_URL` ist für echte Starts erforderlich. Keine kostenpflichtigen Tests ohne ausdrückliche Freigabe.
6. Einmal über `/login` anmelden. Die Supabase-Nutzer-UUID der Gründer in `ADMIN_USER_IDS` eintragen. Im Adminpanel fal-Preise abrufen, Einheit/Rundung/Audiotarif/Trainingsauflösung mit dem eigenen Account abgleichen und die passenden Modelle aktivieren. Ungeprüfte oder über sieben Tage alte Preise sperren Starts.
7. Stripe zunächst im **Testmodus** einrichten: ein einmaliges Produkt mit 1.000 Credits und ein monatliches Creator-Abo mit 3.000 Credits. Price-IDs in `.env.local` setzen. Customer Portal im Stripe-Dashboard konfigurieren. Webhook `POST /api/webhooks/stripe` für `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `customer.subscription.updated` und `customer.subscription.deleted` einrichten. Den zum Ziel passenden Signing Secret verwenden. Lokal kann [Stripe CLI](https://docs.stripe.com/stripe-cli) mit `stripe listen --forward-to localhost:3000/api/webhooks/stripe` weiterleiten.
8. `npm run dev`. Für ausdrücklich freigegebene Anbieterprüfungen `ENABLE_PAID_GENERATION=true`; für Stripe-Test-Checkout `ENABLE_STRIPE_CHECKOUT=true`. **`ALLOW_STRIPE_LIVE` bleibt false**, bis echte Zahlungen ausdrücklich freigegeben wurden. Neue Live-Workspaces haben 0 Credits; Credits entstehen durch verifizierte bezahlte Stripe-Vorgänge. Testdaten der automatisierten Tests werden nie in ein Live-Projekt eingespielt.

## Tests und Build

```bash
npm run typecheck
npm run lint
npm run test:toolchain
npm test
npm run build
```

`npm test` führt SQL/RLS- und Transaktionstests mit PGlite sowie Adapter-, Signatur- und Medientests aus; keine Anbieteranfragen. PGlite ersetzt keinen Test mit unabhängigen PostgreSQL-Verbindungen. `npm run test:toolchain` prüft die Sicherheitsupdates der Worker-Werkzeuge ohne Live-Deployment; die Versionsentscheidungen stehen in [docs/dependencies.md](docs/dependencies.md). `npm run check` führt die obigen lokalen Prüfungen zusammen aus.

```bash
# Eigene, leere Testdatenbank; der Name muss chriklfield_test* lauten.
TEST_DATABASE_URL=postgresql://postgres:PASSWORT@localhost:5432/chriklfield_test npm run test:postgres
npx playwright install --with-deps chromium
npm run test:e2e
```

E2E startet selbst eine lokale Demo auf Port 3000. Vorher andere Server auf diesem Port stoppen. Desktop und mobiles Layout werden mit getrennten Playwright-Projekten geprüft. Keine echten Zahlungs- oder Modellschlüssel für Tests verwenden. CI enthält drei getrennte Gates: Qualität/Build, PostgreSQL mit mehreren Verbindungen sowie Browserprüfungen.

## Deployment vorbereiten

Die Web-App kann auf **Vercel mit Next.js** laufen; private Direktuploads und Medienprüfung im Trigger.dev-Worker sind implementiert. Einrichtung und genaue Umgebungsvariablen: [docs/vercel.md](docs/vercel.md). Alternativ ist ein Dockerfile enthalten. Keine automatische Produktionsbereitstellung in CI.

```bash
docker build -t chriklfield .
docker run --rm -p 3000:3000 --env-file .env.production chriklfield
# Nur nach Wahl und Freigabe der Zielumgebung:
npm run worker:deploy
```

Secrets nicht ins Image bauen. Im Live-Modus gehen Dateien direkt zu privaten Supabase-Eingangsbuckets; FFmpeg läuft im Worker. Vercel empfängt nur Metadaten. Der lokale Demo-Upload benötigt weiterhin FFmpeg im lokalen Prozess. Supabase Free begrenzt einzelne Dateien auf 50 MB; grössere Trainingsarchive und Gewichte brauchen ein passendes Storage-Limit. Betrieb und Wiederanlauf: [docs/operations.md](docs/operations.md).

## Entwicklung und Verantwortung

| Programmierung                                                               | Content / Produkt                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Migrationen, Rechte, Abrechnung, Adapterverträge, Betrieb und Fehlerbehebung | Rechte an Referenzen, Caption-Qualität, Freigaben und sichtbare Körperdetails |
| Anbieter- und Datenbankfehler reproduzierbar prüfen                          | Testbilder je Version bewerten und gute Ergebnisse bewusst übernehmen         |
| Kosten pro Ergebnis und Kosten unbrauchbarer Versuche erfassen               | Vorlagen und Nutzertests pflegen; Vergleichsprotokolle führen                 |

[Architektur](docs/architecture.md) · [Kostenlogik](docs/costs.md) · [Modellgrenzen und Quellen](docs/models.md) · [Sicherheit und Aufbewahrung](docs/security.md) · [Prüfstand](docs/verification.md).

Civitai ist nicht integriert. Es wird keine Trainings-API dort vorausgesetzt. Szenenfotos sind keine KI-Modellergebnisse; Attributionen stehen in [public/demo/credits.json](public/demo/credits.json). Die Code-Lizenz ist vor einer externen Weiterverwendung durch die Gründer festzulegen; Drittanbieter behalten ihre eigenen Lizenzbedingungen.
