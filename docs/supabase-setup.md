# Supabase: eingerichteter Stand und Vercel-Anschluss

Stand: 9. September 2026. Das eigene Projekt `tslgkbtfdchkfriuealv` ist verbunden und eingerichtet. **Keine SQL-Dateien erneut einfügen und kein `db reset` gegen dieses Projekt ausführen.**

## Bereits erledigt

23 Anwendungstabellen mit RLS, drei private Buckets, fünf Migrationen, serverexklusive Schreibfunktionen und explizite Client-Leserechte. Der vorhandene Auth-Nutzer blieb erhalten. Die Zwei-Nutzer-Prüfung in `tests/supabase-rls.sql` bestand im gehosteten Projekt; ihre Fixtures wurden vollständig zurückgerollt. Dies bestätigt SQL-Rollen und Storage-Metadaten, noch keinen Browser-Login oder Datei-HTTP-Download.

| Vorheriger Dateiname                                                  | Tatsächliche Supabase-Version / jetziger Dateiname |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| `202609050001_core.sql`                                               | `20260909162611_core.sql`                          |
| `202609050002_storage_templates.sql`                                  | `20260909162626_storage_templates.sql`             |
| `202609060001_recovery.sql`                                           | `20260909162642_recovery.sql`                      |
| `202609070001_direct_uploads.sql`                                     | `20260909162656_direct_uploads.sql`                |
| Ergänzung, per CLI als `20260909163044_access_hardening.sql` angelegt | `20260909163243_access_hardening.sql`              |

Die ersten vier SQL-Inhalte sind unverändert. Die Dateiversionen entsprechen jetzt der tatsächlichen, von Supabase verwalteten Historie. Die fünfte Migration entfernt auch geerbte TRUNCATE-/REFERENCES-/TRIGGER-Rechte, verschiebt die RLS-Hilfe in `creator_private` und ergänzt fehlende FK-Indizes. Das interne Schema nicht in die Data-API-Schemaliste aufnehmen. Neue Tests laden alle Migrationen in sortierter Reihenfolge.

Für **andere** Datenbanken, auf denen bereits die früheren Dateinamen angewendet wurden: zunächst mit `supabase migration list` die Historie vergleichen. Identische Migrationen nicht erneut ausführen. Erst nach Vergleich des gespeicherten SQL-Inhalts die Historie mit den offiziell dokumentierten CLI-Werkzeugen abgleichen. Das hier eingerichtete Projekt benötigt keine Reparatur. [Migrationsablauf](https://supabase.com/docs/guides/deployment/database-migrations).

## Jetzt für die Vercel-Anmeldung

Die Supabase-Verbindung hier erlaubt Schemaänderungen. Sie verteilt keine Backend-Schlüssel nach Vercel oder Trigger.dev. Der verfügbare Vercel-Zugriff kann Projekte und Deployments prüfen, bietet hier aber keine Funktion zum Setzen von Umgebungsvariablen. Deshalb erfolgt die Schlüsseleingabe direkt in den Kontoeinstellungen; Schlüssel nicht in Chat oder Git posten.

1. In [Supabase → Settings → API Keys](https://supabase.com/dashboard/project/tslgkbtfdchkfriuealv/settings/api-keys) einen **Secret Key** für das Backend verwenden. Der vorhandene Publishable Key ist nur für den öffentlichen Client. Ein neuer `sb_secret_…`-Schlüssel wird genauso als zweites Argument an `createClient` übergeben; der bestehende Variablenname in dieser Anwendung lautet weiterhin `SUPABASE_SERVICE_ROLE_KEY`. Ein vorhandener Legacy-`service_role`-Schlüssel funktioniert ebenfalls. Kein Datenbankpasswort verwenden. [Offizielle Schlüsselzuordnung](https://supabase.com/docs/guides/getting-started/api-keys).
2. In [Vercel → chriklfield → Settings → Environment Variables](https://vercel.com/chrikl/chriklfield/settings/environment-variables) `SUPABASE_SERVICE_ROLE_KEY` für **Preview** hinterlegen. Den Wert als Geheimnis behandeln und keinen `NEXT_PUBLIC_`-Präfix verwenden. Die bekannten öffentlichen Werte `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ebenfalls als Projektvariablen für künftige Builds setzen; sie waren im erfolgreichen ersten Preview bereits enthalten. `APP_MODE=live`, `ENABLE_PAID_GENERATION=false`, `ENABLE_STRIPE_CHECKOUT=false`, `ALLOW_STRIPE_LIVE=false` beibehalten.
3. In [Supabase Auth → URL Configuration](https://supabase.com/dashboard/project/tslgkbtfdchkfriuealv/auth/url-configuration) die tatsächlich verwendete Preview-Adresse und genau ihren Callback erlauben. Beim vorhandenen Preview ist der Callback `https://chriklfield-k3bt7m4b7-chrikl.vercel.app/auth/callback`. Nach einem neuen Preview die dann gültige Adresse ergänzen; keine pauschale Freigabe für fremde Vercel-Domains. Den E-Mail-Versand für eigene Testkonten prüfen; für Nutzertests eigenen SMTP-Versand konfigurieren.
4. Den geprüften Branch `feat/vercel-uploads` erneut als **Preview** bauen. Änderungen an Vercel-Umgebungsvariablen gelten erst für neue Deployments. Der `main`-Branch enthält noch nicht die Anwendung. Anschliessend `/login` öffnen, mit der eigenen E-Mail anmelden und einen Charakter anlegen. Eine öffentliche Produktionspromotion ist damit nicht freigegeben. [Vercel-Umgebungsvariablen](https://vercel.com/docs/environment-variables).

## Danach private Medien

Für die Dateiprüfung zusätzlich das Trigger.dev-Projekt und die sechs Tasks aus `docs/vercel.md` bereitstellen. Vercel benötigt `TRIGGER_SECRET_KEY`, der Worker `TRIGGER_PROJECT_ID`, Supabase-URL und einen eigenen Backend-Schlüssel. Ohne laufenden Upload-Worker ist ein erfolgreich übertragenes Bild noch kein geprüftes Library-Ergebnis. fal und Stripe werden für einen reinen Referenz-Upload nicht benötigt.

Die Buckets bleiben privat. Projektweite Dateilimits gelten zusätzlich zu den Bucket-Limits; Supabase Free begrenzt eine Datei auf 50 MB. Keine automatische Tarifänderung. [Storage-Limits](https://supabase.com/docs/guides/storage/uploads/file-limits).

## Verbleibende Advisor-Hinweise

Zehn interne Tabellen haben bewusst keine Client-Policies und keine Client-Grants; der Advisor meldet dafür INFO. Neue Indizes werden bis zur tatsächlichen Nutzung als ungenutzt gemeldet. Der Schutz gegen kompromittierte Passwörter ist im Auth-Projekt deaktiviert; vor Einführung von Passwort-Logins prüfen. Die aktuelle Oberfläche verwendet E-Mail-Links. [Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Keine echten Zahlungen, Credits oder Modellaufträge wurden durch diese Einrichtung erzeugt. Alle Modelle sind weiterhin deaktiviert, bis Preise, Schlüssel und ausdrückliche Kostenfreigabe vorliegen.
