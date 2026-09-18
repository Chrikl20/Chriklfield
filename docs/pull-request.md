# Pull Request: Higgsfield-only

Der Branch `feat/higgsfield-only` stellt Chriklfield vollständig auf Higgsfield als Modellprovider um.

## Enthalten

- Higgsfield Provider-Adapter
- Soul ID als Character-Identity
- Soul für Bildgeneration
- Kling über Higgsfield für Image-to-Video
- Genjutsu für Motion Transfer
- serverseitige Provider-Credentials
- Supabase-Migration auf `provider_reference_id`
- Entfernung alter provider-spezifischer Trainingsartefakte
- aktualisierte Tests, Preislogik und Dokumentation

## Vor Merge

Der Vercel-Preview-Build muss `READY` sein. Die Higgsfield-Migration muss im Ziel-Supabase-Projekt angewendet und geprüft sein. Providerpreise bleiben bis zur manuellen Prüfung deaktiviert. Production-Promotion erfolgt separat.
