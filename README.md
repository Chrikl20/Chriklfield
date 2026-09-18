# Chriklfield · Creator Studio

Chriklfield ist eine private AI-Creator-Plattform für wiederverwendbare Charakteridentitäten:

**Referenzen freigeben → Higgsfield Soul ID trainieren → Bilder mit Soul erzeugen → Bilder mit Kling oder Genjutsu animieren → Ergebnisse privat speichern.**

## Stack

- Next.js 16 / React 19 / TypeScript
- Supabase Auth, PostgreSQL und private Storage-Buckets
- Trigger.dev für langlebige Hintergrundaufträge
- **Higgsfield API als einziger Modellprovider**
- Stripe für Credits und Billing

Provider-Secrets bleiben ausschließlich serverseitig. Der Browser erhält weder Higgsfield API-Key noch Secret.

## Charaktere

Ein Charakter besitzt bestätigte Identitäts- und Körpermerkmale sowie freigegebene Referenzbilder. Für eine neue Identity-Version werden **20–80 bestätigte Bilder** an Higgsfield Soul ID übergeben. Chriklfield speichert anschließend nur die zurückgegebene Provider-Reference-ID in der Charakterversion.

## Studios

| Bereich | Provider-Workflow |
| --- | --- |
| Characters | Higgsfield Soul ID |
| Image Studio · Entwurf | Higgsfield Soul |
| Image Studio · Charakter | Higgsfield Soul + Soul ID |
| Image Studio · Referenz | Higgsfield Soul + Bildreferenz |
| Video Studio | Kling 3.0 Pro über Higgsfield |
| Motion Transfer | Higgsfield Genjutsu |

Das Modellregister liegt in `src/domain/models.ts`. Provider-Aufrufe laufen über `src/server/providers/higgsfield.ts`.

## Lokal starten

```bash
git clone --branch feat/higgsfield-only https://github.com/Chrikl20/Chriklfield.git chriklfield
cd chriklfield
npm ci
npm run demo
```

Der Demo-Modus benötigt keine Provider-Credentials und führt keine kostenpflichtigen Anfragen aus.

Für Live-Betrieb:

```env
APP_MODE=live
HF_API_KEY_ID=
HF_API_KEY_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TRIGGER_PROJECT_ID=
TRIGGER_SECRET_KEY=
ENABLE_PAID_GENERATION=false
```

`ENABLE_PAID_GENERATION` bleibt deaktiviert, bis Higgsfield-Credentials, Datenbankmigrationen und geprüfte Modellpreise eingerichtet sind.

## Datenbank

Alle Migrationen unter `supabase/migrations/` werden in Reihenfolge angewendet. Der aktuelle Zielzustand nutzt für Charakterversionen `provider_reference_id` und `base_model = 'higgsfield-soul'`.

Alte provider-spezifische Trainingsartefakte werden im aktuellen Schema nicht mehr verwendet.

## Prüfung

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Ein erfolgreicher Build bestätigt nicht automatisch einen erfolgreichen kostenpflichtigen Provider-Aufruf. Ein Live-End-to-End-Test erfolgt erst nach bewusster Freigabe der Generation und geprüften Preisen.

Weitere Details: [Architektur](docs/architecture.md) · [Modelle](docs/models.md) · [Kosten](docs/costs.md) · [Vercel](docs/vercel.md) · [Betrieb](docs/operations.md) · [Sicherheit](docs/security.md).
