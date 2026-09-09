# Zugriff, Medien und Aufbewahrung

## Zugriffsgrenzen

Supabase Auth verifiziert die Sitzung mit `getUser`. Ein Workspace wird serverseitig angelegt; Nutzer können sich keine fremde Workspace-ID durch API-Parameter zuweisen. RLS begrenzt direkte Datenbank-/Storage-Lesezugriffe auf Mitgliedschaften. Finanz-, Outbox-, Webhook- und Admin-Tabellen sind nicht für Browserzugriffe freigegeben. Schreibende RPCs sind ausschliesslich für `service_role` ausführbar. Backend- und Workerpfade prüfen die tatsächliche Mitgliedschaft selbst. Administratoren werden nur anhand serverseitiger UUID-Allowlist erkannt.

Mutationen erfordern eine exakte Origin-Übereinstimmung mit `APP_URL` bzw. den serverseitig festgelegten Vercel-Preview-Adressen. Webhooks sind davon ausgenommen und müssen eine gültige Anbietersignatur tragen. Bezahlte Starts benötigen HTTPS-Callbacks, geprüfte Preise und ausdrückliche Feature-Freigaben. Der Demo-Modus ist lokal, ungeschützt gegen andere Nutzer derselben Demo-Instanz und deshalb in Produktion gesperrt.

Service-Role-, fal-, Trigger- und Stripe-Secrets bleiben im Backend. `.env.example` enthält keine Geheimnisse. Keine Prompts, Medienbytes, signierten URLs oder API-Schlüssel loggen. Die strukturierte HTTP-Fehlerausgabe enthält nur Fehlercodes. Trigger-Payloads enthalten nur Job-IDs, keine Medien/Prompts. Provider-/SDK-Fehler werden vor Weitergabe normalisiert. Infrastruktur- und Proxy-Access-Logs müssen Querystrings der Webhook-URL ausblenden.

## Private Dateien

Live-Uploads werden nach authentifizierter Metadaten-Anfrage direkt in getrennte private Supabase-Eingangsbuckets übertragen. Ein signiertes Token erlaubt einmaliges Schreiben auf einen bestimmten Pfad; allgemeine Browser-Schreibrechte und Leserechte auf Rohdateien fehlen. Der Worker normalisiert Dateien und veröffentlicht erst danach das Ergebnis. Die Demo nutzt weiterhin die lokale Node-API. Signierte Browserzugriffe laufen nach 60 Sekunden ab; Worker-Eingaben sind sechs Stunden lesbar, damit der Anbieter sie aus einer Warteschlange abrufen kann. Wer eine signierte URL besitzt, kann sie während ihrer Gültigkeit verwenden. Nach Löschmarkierung werden keine neuen URLs ausgegeben; bereits ausgestellte URLs können bis zum Ablauf/physischer Löschung gültig bleiben.

Magic Bytes und echtes Decodieren ersetzen Vertrauen in Dateinamen/MIME-Header. Bilder: max. 10 MB/40 Megapixel, mind. 300 Pixel je Dimension, JPEG/PNG/WebP, Metadaten entfernt. Videos: MP4 bis 100 MB, gemessene Dimensionen/Dauer mit FFprobe, FFmpeg ohne Netzwerkprotokolle, Remux und Metadatenentfernung. Nur selbst erzeugte Trainings-ZIPs mit begrenzter Bild-/Bytezahl und sicheren Dateinamen; keine fremden ZIPs/Pickle-Gewichte. LoRA-Downloads müssen Safetensors-Struktur und erlaubte Dateigrösse erfüllen.

Externes Laden: HTTPS, genaue Host-Allowlist und Pfadpräfixe, keine Credentials, IP-Literale oder beliebigen Ports; öffentliche IPv4-DNS-Ziele werden vor jedem Redirect geprüft und für den TLS-Request angeheftet. Eine geänderte fal-Download-Domain bleibt gesperrt, bis der Betreiber ihre Herkunft überprüft und die Allowlist aktualisiert hat. Keinen pauschalen `*.amazonaws.com`- oder beliebigen URL-Fallback hinzufügen.

Neue Uploads/Angebote haben nutzerbezogene Minutenlimits; Uploads reservieren zusätzlich die volle Kapazität des Eingangsbuckets und den maximalen normalisierten Output. Rohdateien bleiben bis 135 Minuten nach Erstellung und danach bis zum nächsten Recovery-Lauf privat gespeichert, damit gültige Uploadtokens nach dem Purge nicht erneut genutzt werden können. Details in [vercel.md](vercel.md). Registrierungen begrenzen den Workspace auf anfangs 2 GiB noch nicht physisch gelöschte Dateien. Speicherung und Löschung verwenden dieselbe Workspace-Sperre. Fehler bei Registrierung entfernen eindeutig verwaiste Uploads; bei unklarer Datenbankantwort bleibt das Objekt für Wiederaufnahme erhalten. Für Crash-Waisen ohne Datenbankzeile ist ein regelmässiger Storage-Inventarabgleich erforderlich.

## Löschverhalten

Laufende Jobs blockieren Löschungen im Workspace; offene Uploads blockieren zusätzlich Charakter-/Workspace-Löschungen, damit weder reservierte Credits noch bezahlte Ausgaben verloren gehen. Einzelne Assets werden sofort in der App ausgeblendet, Referenzverknüpfungen entfernt und von einem stündlichen Task physisch gelöscht. Eine einzelne Bildlöschung trainiert existierende LoRAs nicht rückwärts; für Gewichte/Identität den gesamten Charakter löschen. Die Charakterlöschung entfernt eigene Gewichte, Konfiguration, verknüpfte Referenzen und zugehörige Medien; geteilte, einem anderen Charakter zugeordnete Bibliotheksmedien bleiben erhalten.

| Daten                                              | Lokale Regel                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Referenzen, Ergebnisse, Gewichte                   | Privat bis Nutzerlöschung; danach stündlicher Purge                           |
| Training-ZIP                                       | Sieben Tage nach Erstellung und erst bei terminalem Job zur Löschung          |
| Identität/Captions in Trainings- und Job-Snapshots | Bei Charakter-/Workspace-Löschung redigieren                                  |
| Verarbeitete Webhook-Nutzlasten                    | Nach sieben Tagen redigieren; Deduplikations-IDs behalten                     |
| Nicht gestartete Preisangebote                     | Einen Tag nach Ablauf entfernen                                               |
| Request-Zähler                                     | Nach einer Stunde entfernen                                                   |
| Zahlungs-/Kostenjournal                            | Beträge und IDs bleiben zur Abrechnung; rechtliche Frist vor Launch festlegen |

Die lokale Löschung ist **keine Garantie für Löschung bei fal, Trigger, Stripe oder in Backups**. Das System erzeugt `PROVIDER_RETENTION_REVIEW` und markiert den Auftrag `local_complete_provider_review`. Anbieter-Retention, vertragliche Löschung und Backup-Zyklen müssen separat bestätigt werden. Eine vollständige Kontolöschung inklusive Supabase-Auth-Konto, Stripe-Kunde und externer Kopien braucht vor Launch einen abgestimmten Prozess; der aktuelle Workspace-Löschpfad ist kein pauschales „Recht auf Vergessen“-Versprechen.

## Vor öffentlichem Launch

Referenz-/Persönlichkeitsrechte, Einwilligungen, synthetische Kennzeichnung, zulässige Inhalte und kommerzielle Modellrechte prüfen. Datenschutzinformationen, Auftragsverarbeitung, Anbieterregionen, Steuer-/Widerrufsfragen und Aufbewahrungsfristen festlegen. Zuständigkeit für Meldungen, Missbrauch, Urheberrecht und ungewollte Identitätsähnlichkeit bestimmen. Es sind keine anwaltlichen Prüfungen oder rechtlichen Freigaben erfolgt.

Technisch: Auth mit zwei echten Konten gegen das Zielprojekt prüfen, Provider-Callback/Storage/Tarifvertrag live nach Freigabe bestätigen, Disputes behandeln, Storage-Inventarabgleich und externen Alarmkanal ergänzen, Content-/Sicherheitsfilter bewerten und Last-/Restore-Test ausführen. Anbieter-Safety-Flags bleiben aktiviert. Sicherheitsheader sind enthalten; eine strengere noncebasierte CSP ist vor breiter Öffentlichkeit sinnvoll (Next benötigt aktuell Inline-Skripte; im Entwicklungsmodus zusätzlich Eval).
