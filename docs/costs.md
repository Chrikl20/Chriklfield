# Credits, Angebote und Kosten

Alle Providerbeträge werden intern in Mikro-USD gespeichert. Kundencredits sind ganzzahlige Einheiten.

## Preislogik

`src/domain/pricing.ts` verwendet die serverseitige Preiszeile des jeweiligen Higgsfield-Workflows. Unterstützte Einheiten sind:

- `image`
- `second`
- `job`

Auf den geschätzten Providerbetrag wird ein Kostenpuffer angewendet; anschließend wird in Credits umgerechnet. Die Regel ist eine interne Kalkulation und keine Zusage einer festen Marge.

## Preisfreigabe

Ein Modell kann nur starten, wenn:

- `model_prices.enabled = true`
- ein positiver Preis hinterlegt ist
- `verified_at` höchstens sieben Tage alt ist
- Quote und aktuelle Preisversion übereinstimmen
- Projekt-, Workspace-, Nutzer- und Modellbudgets nicht überschritten werden

Die Higgsfield-Migration setzt alle Modellpreise bewusst auf deaktiviert und ungeprüft. Damit kann nach dem Providerwechsel keine alte Preiskonfiguration versehentlich weiterverwendet werden.

## Unklare Providerannahme

Wenn ein kostenpflichtiger POST zeitlich unklar endet, wird nicht automatisch erneut gesendet. Der Versuch bleibt zur manuellen oder serverseitigen Abklärung erhalten. Damit wird ein möglicher Doppelcharge vermieden.
