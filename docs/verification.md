# Verifikation

## Aktueller Higgsfield-Stand

Der Branch `feat/higgsfield-only` baut auf Vercel erfolgreich. Der Runtime-Stack verwendet Higgsfield als einzigen Modellprovider.

Geprüft werden getrennt:

1. TypeScript-/Next.js-Build
2. Supabase-Schema und Migrationen
3. Provider-Credentials und Runtime-Konfiguration
4. echter Soul-ID- und Generierungsdurchlauf
5. private Ergebnisspeicherung und Credit-Settlement

Ein `READY`-Deployment bestätigt nur den Cloud-Build und die Bereitstellung der Web-App. Es bestätigt nicht automatisch einen erfolgreichen kostenpflichtigen Higgsfield-Aufruf.

## Sicherheitsgates

Kostenpflichtige Generation bleibt deaktiviert, solange die aktuelle Higgsfield-Preisprüfung fehlt. Die Provider-Migration setzt alle Modellpreise bewusst auf `enabled = false` und `verified_at = null`.

Vor Production müssen ein Soul-ID-Training, ein Charakterbild sowie die gewünschten Video-Workflows kontrolliert getestet werden.
