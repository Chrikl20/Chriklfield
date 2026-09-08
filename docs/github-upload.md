# Übergabe an GitHub

Die anfänglichen Schreibversuche wurden mit **HTTP 403 „Resource not accessible by integration“** abgewiesen. Nach Installation des ChatGPT Codex Connectors auf dem Konto `Chrikl20` gelang am 8. September 2026 der erste echte Remote-Commit: `5ca404bf0a8210ed0d0cc002fc9b3473af038da2`. Der Arbeitsbranch `feat/vercel-uploads` wurde darauf angelegt. Der bisherige Schreibblocker ist behoben. Nutzerrechte, Konto-Autorisierung und App-Installation sind getrennte Voraussetzungen; die frühere pauschale Einordnung dieser Verbindung als nur lesbar traf nicht zu.

Die Quellübergabe erfolgt über die GitHub-API auf einem eigenen Branch, mit einem Draft Pull Request nach `main`. Es wird kein Force-Push oder automatischer Merge verwendet. Für neue Checkouts den Implementierungsbranch direkt klonen; der frühere lokale Verlauf bleibt im bereits ausgelieferten Bundle erhalten. Remote-Commits haben wegen des separaten GitHub-Grundstands andere IDs als die früheren lokalen Commits.

Das Quellcode-ZIP enthält alle Dateien und ein `Chriklfield.bundle` mit dem vollständigen lokalen Git-Verlauf: minimaler Grundstand auf `main`, Grundimplementierung auf `feat/creator-platform` und Vercel-Anpassung auf `feat/vercel-uploads`. Das Bundle enthält keine Zugangsdaten oder Demolaufzeitdaten.

## Früheres Offline-Paket mit Git-Verlauf wiederherstellen

ZIP entpacken. Neben dem entpackten Ordner ausführen:

```bash
git clone --branch feat/vercel-uploads chriklfield/Chriklfield.bundle Chriklfield
git -C Chriklfield branch main origin/main
git -C Chriklfield remote set-url origin https://github.com/Chrikl20/Chriklfield.git
cd Chriklfield
npm ci
npm run demo
```

Das Remote ist inzwischen initialisiert. Den lokalen Bundle-Grundstand deshalb nicht über `main` oder den vorhandenen Implementierungsbranch schreiben. Für weitere Entwicklung den Remote-Branch frisch klonen und eigene Änderungen auf einen neuen Branch übernehmen. Keine Tokens in Chat, README oder Repository schreiben. Zum Hochladen von CI-Dateien sind zusätzlich die Workflow-Schreibrechte der gewählten Anmeldemethode erforderlich. CI auswerten; nicht automatisch mergen oder bereitstellen. Eine vorbereitete PR-Beschreibung steht in [pull-request.md](pull-request.md).

## Ohne Git-Verlauf lokal ausprobieren

Im entpackten Ordner `chriklfield` einfach `npm ci` und `npm run demo` ausführen. Das beiliegende Git-Bundle wird von Next.js nicht benötigt und kann ausserhalb des Projektordners aufbewahrt werden.

Für Vercel enthält [vercel.md](vercel.md) den aktuellen Ablauf. `main` im Bundle ist nur der Grundstand; vor dem Deploy den vollständigen Implementierungsbranch wählen oder den geprüften Stand regulär zusammenführen.
