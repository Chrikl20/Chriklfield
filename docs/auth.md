# E-Mail-Anmeldung

## Ablauf und Entscheidung

Neue E-Mail-Links werden mit dem offiziellen `signInWithOtp` eines zustandslosen Supabase-Clients (`flowType: implicit`, ohne lokale Sitzung) angefordert. Dadurch ist der Link nicht an den Browser gebunden, der die E-Mail angefordert hat. Das ist für den Wechsel von Mail-App zu Browser erforderlich. Die Standard-E-Mail-Vorlage kann bestehen bleiben; es ist keine neue Redirect-URL erforderlich.

`/auth/callback` ist eine öffentliche Abschlussseite. Sie liest die Zugangsdaten aus dem URL-Fragment, entfernt Fragment und Query sofort aus dem Browserverlauf und übergibt ausschliesslich die erwarteten Felder per Same-Origin-POST an `/api/auth/complete`. Der Server nutzt `setSession` aus dem installierten Supabase-SDK: Es prüft das Access-Token mit Supabase bzw. erneuert eine abgelaufene Sitzung. Der SSR-Client schreibt die Sitzungscookies, bevor der Browser vollständig nach `/explore` navigiert. Studio-Abfragen laufen während des Callbacks nicht. Callback und API-Antwort sind nicht cachebar; der Callback hat `Referrer-Policy: no-referrer` und keine externen Skripte.

Bestehende `?code=...`-Links bleiben über `exchangeCodeForSession` unterstützt, einschliesslich optionaler `sb_flow_id`. Diese alten PKCE-Links benötigen weiterhin den passenden Cookie im ursprünglichen Browser. PKCE für zukünftiges OAuth wird durch den separaten E-Mail-Sender nicht verändert.

Diese Lösung kombiniert den dokumentierten E-Mail-Implicit-Flow mit einer verifizierten SSR-Cookie-Sitzung. Sie überträgt Tokens bewusst im Browser, nicht per URL-Query an den Server. Keine Tokens in Logs, API-Antworten, Analytics oder Fehlermeldungen schreiben. Nicht auf beliebige vom Request gelieferte Hosts oder `next`-URLs weiterleiten. CSRF-Origin-Prüfung, Supabase-Verifikation und RLS bleiben aktiv.

## Einrichtung

- `APP_URL=https://chriklfield.vercel.app`
- Supabase Site URL: `https://chriklfield.vercel.app`
- Supabase Redirect URLs: `https://chriklfield.vercel.app/auth/callback`
- Öffentliche Supabase-URL und Publishable Key in Vercel; Backend-Schlüssel nur serverseitig für die Workspace-Daten.
- Für verlässlichen öffentlichen Betrieb eigenen SMTP-Anbieter konfigurieren. Wiederholtes Anfordern löst Versandlimits aus; die App sendet nie automatisch erneut.

Nach Deployment einen **neuen** Link anfordern. Bereits versandte PKCE-Links ändern dadurch ihr Verhalten nicht. Ein abgelaufener oder bereits verbrauchter Link kann nicht wiederhergestellt werden. E-Mail-Sicherheitsprogramme können Einmal-Links vorab öffnen; bei einem späteren eigenen SMTP-Setup sind eine TokenHash-Bestätigung mit explizitem Klick oder ein eingetippter OTP-Code mögliche weitere Verbesserungen. Neue Free-Projekte mit dem Standard-SMTP können seit Juni 2026 ihre Vorlagen nicht anpassen; dies ist kein App-Fehler.

## Diagnose und Prüfung

`auth_failed` enthält nur den bekannten Supabase-Fehlercode (sonst `unknown`), numerischen HTTP-Status und Phase `send` oder `complete`. `auth_completed` wird erst nach einer vom SDK bestätigten Sitzung geschrieben. Keine E-Mail-Adresse, Cookies, Providertexte oder vollständigen Requests loggen.

`tests/auth.test.ts` testet den tatsächlichen Supabase-/SSR-Code mit einem simulierten HTTP-Anbieter und Cookie-Jar: frischer Browser, Cookie-Persistenz im Folgeaufruf, ungültige Tokens, fehlender PKCE-Verifier, Origin-Prüfung, Versandlimits und redigierte Logs. `tests/e2e/auth.spec.ts` prüft Desktop/Mobil, URL-Bereinigung, Reihenfolge der Weiterleitung und abgelaufene Links mit simulierten API-Antworten. Dies ist kein Beleg für einen echten E-Mail-Login. Der abschliessende Live-Nachweis benötigt den Klick des Kontoinhabers; Tests senden keine E-Mails und erzeugen keine Live-Sitzungen.

## Offizielle Referenzen (geprüft am 14. September 2026)

- [Supabase E-Mail-Login](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Implicit Flow und URL-Fragmente](https://supabase.com/docs/guides/auth/sessions/implicit-flow)
- [setSession](https://supabase.com/docs/reference/javascript/auth-setsession)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Auth-Fehlercodes](https://supabase.com/docs/guides/auth/debugging/error-codes)
- [E-Mail-Vorlagen auf neuen Free-Projekten](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
