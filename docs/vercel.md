# Vercel

Chriklfield läuft als Next.js-App auf Vercel. Der GitHub-Branch `feat/higgsfield-only` erzeugt Preview-Deployments; Production wird erst nach erfolgreicher End-to-End-Prüfung promoted.

## Environment Variables

Mindestens:

```env
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_API_KEY_ID=
HF_API_KEY_SECRET=
TRIGGER_PROJECT_ID=
TRIGGER_SECRET_KEY=
ENABLE_PAID_GENERATION=false
```

Stripe-Variablen werden zusätzlich benötigt, sobald Checkout aktiviert wird.

Provider-Secrets gehören sowohl für Preview als auch Production in die jeweils passende Vercel-Umgebung. Ein erfolgreicher Build beweist nicht, dass Runtime-Secrets vorhanden sind.

## Deployment

Git-Pushes auf Feature-Branches erzeugen Previews. Erst wenn Preview, Supabase-Schema, Provider-Credentials und ein echter Test zusammenpassen, wird der geprüfte Stand nach Production übernommen.

Die Hauptdomain soll nur auf einen bereits erfolgreichen Deployment-Stand zeigen.
