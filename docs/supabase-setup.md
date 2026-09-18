# Supabase-Setup

Zielprojekt: Chriklfield Supabase.

## Migrationen

Alle Dateien unter `supabase/migrations/` werden in Reihenfolge angewendet. Der Higgsfield-Zielzustand enthält insbesondere:

- `character_versions.provider_reference_id`
- `base_model = 'higgsfield-soul'`
- keine alten Trainingsgewicht-/Konfigurationsspalten
- Modellpreise nur mit Einheiten `image`, `second` oder `job`
- alle Providerpreise nach Migration zunächst deaktiviert

## RLS und Storage

Anwendungstabellen im öffentlichen Schema verwenden RLS. Browsernutzer erhalten nur die für ihren Workspace vorgesehenen Zugriffe. Medien liegen in privaten Buckets und werden über signierte URLs beziehungsweise serverseitige Endpunkte ausgeliefert.

## Prüfung nach Migration

Nach jeder Schemaänderung:

- Migrationen auflisten
- Spalten von `character_versions` prüfen
- `model_prices` prüfen
- Security und Performance Advisors ausführen
- einen ungefährlichen Read-Test durchführen

Provider-Credentials werden nicht in Supabase gespeichert, sondern als serverseitige Runtime-Secrets der App/Worker konfiguriert.
