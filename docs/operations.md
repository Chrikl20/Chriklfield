# Betrieb

## Provider

Higgsfield ist der einzige Modellprovider. Für Live-Generierung werden serverseitig benötigt:

```env
HF_API_KEY_ID=
HF_API_KEY_SECRET=
ENABLE_PAID_GENERATION=true
```

Die Freigabe sollte erst erfolgen, nachdem die Supabase-Migration angewendet und die Higgsfield-Preise geprüft wurden.

## Hintergrundjobs

Trigger.dev verarbeitet Generationen, Upload-Normalisierung, Recovery und Retention. Die Datenbank-Outbox ist die Übergabe zwischen Web-Request und Worker.

Ein Job darf einen kostenpflichtigen Provider-Request nicht blind wiederholen, wenn dessen Annahmestatus unbekannt ist. Solche Fälle werden als betriebliche Meldung behandelt.

## Medien

Eingänge und Ergebnisse werden validiert und privat in Supabase gespeichert. Externe Ergebnis-URLs dürfen nur von explizit freigegebenen Hosts heruntergeladen werden. Neue beobachtete Higgsfield-CDN-Hosts werden erst nach Prüfung zur Allowlist ergänzt.

## Recovery

Worker-Leases und persistierte Provider-Attempts erlauben Wiederaufnahme nach Prozessabbruch. Persistieren und Credit-Settlement erfolgen erst nach erfolgreicher Ergebnissicherung.

## Launch-Gates

Vor Production:

- Datenbankmigrationen auf Zielprojekt prüfen
- Higgsfield-Secrets in Preview und Production setzen
- aktuelle Providerpreise freigeben
- einen kleinen End-to-End-Test ausführen
- Runtime-Logs auf Provider-/Storage-Fehler prüfen
