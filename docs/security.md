# Sicherheit

## Secrets

Diese Werte sind ausschließlich serverseitig:

- `HF_API_KEY_ID`
- `HF_API_KEY_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- Trigger.dev Secrets
- Stripe Secret und Webhook Secret

Keiner dieser Werte darf als `NEXT_PUBLIC_*` veröffentlicht werden.

## Datenzugriff

Nutzerbezogene Supabase-Tabellen verwenden RLS. Private Medien liegen in privaten Storage-Buckets. Serverinterne Tabellen wie Provider-Attempts, Billing-Events und Outbox benötigen keinen direkten Browserzugriff.

## Provider

Higgsfield-Aufrufe werden serverseitig authentifiziert. Provider-URLs werden nicht ungeprüft an Nutzer weitergereicht. Ergebnisdownloads durchlaufen Host-Allowlist, DNS/IP-Prüfung, Größenlimits und Mediennormalisierung.

## Charakterdaten

Soul-ID-Referenzen sind sensible Nutzerdaten und werden nur für den vom Nutzer initiierten Charakter-Workflow verwendet. Character-Versionen speichern die Higgsfield-Reference-ID und Snapshots der bestätigten Eingaben.

## Löschung

Lokale Referenzen und Ergebnisse werden über die Chriklfield-Löschpipeline entfernt. Providerseitige Aufbewahrung wird separat nach den jeweils aktuellen Higgsfield-Bedingungen geprüft.
