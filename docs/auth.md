# Öffentlicher Einstieg und Benutzerkonten

## Besucher und Konten

Explore, kuratierte Vorlagen sowie Image und Video Studio sind öffentlich zugänglich. Gäste können Formulare vorbereiten. Beim Generieren oder Upload erscheint die Kontoeinladung; private Charaktere, Bibliothek und Abrechnung brauchen weiterhin eine verifizierte Sitzung. Alle privaten API-Methoden prüfen unabhängig von der Oberfläche den Nutzer. Es werden weder anonyme Supabase-Konten noch kostenlose Live-Aufträge angelegt.

`/signup` erstellt ein echtes Supabase-Konto mit E-Mail und Passwort (mindestens zehn Zeichen). Bei aktivierter E-Mail-Bestätigung entsteht vor der Bestätigung keine Sitzung. `/login` verwendet `signInWithPassword` und SSR-Cookies; normale Anmeldungen brauchen keine weitere E-Mail. Bestehende Nutzer, die bisher nur Links benutzt haben, können über `/forgot-password` ein Passwort setzen. Der Wiederherstellungslink führt nach erfolgreicher Supabase-Prüfung zu `/reset-password`. Die API akzeptiert Passwortänderungen nur für die verifizierte eigene Sitzung. Supabase-Versand- und Auth-Limits bleiben wirksam.

Nach der ersten erfolgreichen Anmeldung folgt `/onboarding`: Ziel, Stil und Plattform. Die streng validierten Werte werden in `auth.users.user_metadata.creator_preferences` gespeichert. Sie beeinflussen ausschliesslich Darstellung: Startempfehlung, Reihenfolge kuratierter Vorlagen und Standardformat. Metadaten begründen **keine** Berechtigung, Rolle oder Credits. Es braucht keine zusätzliche SQL-Migration. Die Auswahl lässt sich über „Studio personalisieren“ ändern; konkrete Vorlagenformate haben Vorrang vor dem Standard.

Ein vor der Anmeldung vorbereiteter Studio-Entwurf bleibt für maximal eine Stunde im `sessionStorage` desselben Tabs. Gespeichert werden nur validierte Formularfelder, keine Tokens, Uploads oder fremde Medien-IDs. Ein Wechsel in einen anderen Browser oder Tab überträgt diesen lokalen Entwurf nicht. Weiterleitungen erlauben nur bekannte interne Seiten und ausgewählte Parameter; externe Ziele und tokenhaltige Parameter werden verworfen.

## E-Mail-Bestätigung und Wiederherstellung

Registrierung (`signUp`), Wiederherstellung (`resetPasswordForEmail`) und der weiterhin unterstützte Legacy-Link-Endpunkt (`signInWithOtp`) nutzen einen zustandslosen Supabase-Client (`flowType: implicit`, ohne lokale Sitzung). Dadurch ist der Link nicht an den Browser gebunden, der die E-Mail angefordert hat. Das ist für den Wechsel von Mail-App zu Browser erforderlich. Die Standard-E-Mail-Vorlage kann bestehen bleiben; es ist keine neue Redirect-URL erforderlich.

`/auth/callback` ist eine öffentliche Abschlussseite. Sie liest die Zugangsdaten aus dem URL-Fragment, entfernt Fragment und Query sofort aus dem Browserverlauf und übergibt ausschliesslich die erwarteten Felder per Same-Origin-POST an `/api/auth/complete`. Der Server nutzt `setSession` aus dem installierten Supabase-SDK: Es prüft das Access-Token mit Supabase bzw. erneuert eine abgelaufene Sitzung. Der SSR-Client schreibt die Sitzungscookies, bevor der Browser zur Wiederherstellung, zum Onboarding oder zum vorbereiteten Studio navigiert. Studio-Abfragen laufen während des Callbacks nicht. Callback und API-Antwort sind nicht cachebar; der Callback hat `Referrer-Policy: no-referrer` und keine externen Skripte.

Bestehende `?code=...`-Links bleiben über `exchangeCodeForSession` unterstützt, einschliesslich optionaler `sb_flow_id`. Diese alten PKCE-Links benötigen weiterhin den passenden Cookie im ursprünglichen Browser. PKCE für zukünftiges OAuth wird durch den separaten E-Mail-Sender nicht verändert.

Diese Lösung kombiniert den dokumentierten E-Mail-Implicit-Flow mit einer verifizierten SSR-Cookie-Sitzung. Sie überträgt Tokens bewusst im Browser, nicht per URL-Query an den Server. Keine Tokens in Logs, API-Antworten, Analytics oder Fehlermeldungen schreiben. Nicht auf beliebige vom Request gelieferte Hosts oder `next`-URLs weiterleiten. CSRF-Origin-Prüfung, Supabase-Verifikation und RLS bleiben aktiv.

## Einrichtung

- `APP_URL=https://chriklfield.vercel.app`
- Supabase Site URL: `https://chriklfield.vercel.app`
- Supabase Redirect URLs: `https://chriklfield.vercel.app/auth/callback`
- Öffentliche Supabase-URL und Publishable Key in Vercel; Backend-Schlüssel nur serverseitig für die Workspace-Daten.
- E-Mail/Passwort-Provider und Registrierung in Supabase aktivieren, E-Mail-Bestätigung eingeschaltet lassen. Passwort-Mindestlänge auf mindestens zehn Zeichen setzen; angebotenen Schutz vor kompromittierten Passwörtern prüfen.
- Für verlässlichen öffentlichen Betrieb eigenen SMTP-Anbieter konfigurieren. Wiederholtes Anfordern löst Versandlimits aus; die App sendet nie automatisch erneut.

Nach Deployment einen **neuen** Link anfordern. Bereits versandte PKCE-Links ändern dadurch ihr Verhalten nicht. Ein abgelaufener oder bereits verbrauchter Link kann nicht wiederhergestellt werden. E-Mail-Sicherheitsprogramme können Einmal-Links vorab öffnen; bei einem späteren eigenen SMTP-Setup sind eine TokenHash-Bestätigung mit explizitem Klick oder ein eingetippter OTP-Code mögliche weitere Verbesserungen. Neue Free-Projekte mit dem Standard-SMTP können seit Juni 2026 ihre Vorlagen nicht anpassen; dies ist kein App-Fehler.

## Diagnose und Prüfung

`auth_failed` enthält nur den bekannten Supabase-Fehlercode (sonst `unknown`), numerischen HTTP-Status und Phase `send` oder `complete`. `auth_completed` wird erst nach einer vom SDK bestätigten Sitzung geschrieben. Keine E-Mail-Adresse, Cookies, Providertexte oder vollständigen Requests loggen.

`tests/e2e/accounts.spec.ts` prüft öffentliche Navigation, Generation-Gate, Entwurfswiederherstellung, Registrierung, Passwort-Reset und personalisierte Vorgaben mit kontrollierten API-Antworten. `tests/account.test.ts` prüft sichere Weiterleitungen, Metadaten und ablaufende Entwürfe. `tests/auth.test.ts` testet den tatsächlichen Supabase-/SSR-Code mit einem simulierten HTTP-Anbieter und Cookie-Jar: frischer Browser, Cookie-Persistenz im Folgeaufruf, ungültige Tokens, fehlender PKCE-Verifier, Origin-Prüfung, Versandlimits und redigierte Logs. `tests/e2e/auth.spec.ts` prüft Desktop/Mobil, URL-Bereinigung, Reihenfolge der Weiterleitung und abgelaufene Links mit simulierten API-Antworten. Dies ist kein Beleg für einen echten E-Mail-Login. Der abschliessende Live-Nachweis benötigt den Klick des Kontoinhabers; Tests senden keine E-Mails und erzeugen keine Live-Sitzungen.

## Offizielle Referenzen (erneut geprüft am 16. September 2026)

- [Passwortkonten und Wiederherstellung](https://supabase.com/docs/guides/auth/passwords)
- [signUp](https://supabase.com/docs/reference/javascript/auth-signup)
- [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)

- [Supabase E-Mail-Login](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Implicit Flow und URL-Fragmente](https://supabase.com/docs/guides/auth/sessions/implicit-flow)
- [setSession](https://supabase.com/docs/reference/javascript/auth-setsession)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Auth-Fehlercodes](https://supabase.com/docs/guides/auth/debugging/error-codes)
- [E-Mail-Vorlagen auf neuen Free-Projekten](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
