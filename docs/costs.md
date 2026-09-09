# Credits, Angebote und Kosten

Alle Anbieterbeträge sind ganzzahlige **Mikro-USD** (1 USD = 1.000.000 Mikro-USD). Kundencredits sind ganze Einheiten. Stripe-Produktpreise bestimmen den Verkaufspreis; sie sind nicht an eine behauptete USD-Parität gebunden.

## Preisangebot

`src/domain/pricing.ts`, Preisregel `2026-09-05.v1`:

1. Geprüfte Modellrate × Einheiten × zutreffende Audio-/Auflösungsfaktoren.
2. Aufrunden und 15 % Kostenpuffer → reservierter Anbieteransatz.
3. Kundencredits = `ceil(Anbieteransatz × 1.6 / 10_000)`.

Das ist eine konfigurierbare Kalkulationsregel, keine garantierte Marge. Stripe-Gebühren, Steuer, Storage, Worker-Laufzeit, Support und unbrauchbare Ergebnisse sind zusätzlich zu messen. Ohne verifizierten Live-Preis gibt es **kein** Live-Angebot; die Demo enthält ausdrücklich fiktive Raten.

| Modell        | Implementierte Preisformeln                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Krea-Bilder   | Preis pro Bild oder pro angefangenen Megapixeln je Bild; Varianten werden einzeln berücksichtigt |
| Krea-Training | Preis pro Schritt oder fester Auftrag; 1024er-Auflösung kann einen geprüften Faktor erhalten     |
| Seedream Edit | Preis pro Bild; `max_images=1`, maximal vier angeforderte Ausgaben                               |
| Kling I2V     | Preis pro Sekunde × gewählte Dauer, geprüfter Audiofaktor                                        |
| Kling Motion  | Preis pro Sekunde × aufgerundete, **serverseitig gemessene** Referenzdauer; Audiofaktor          |

Einheiten sind im Adminpanel auf diese unterstützten Formeln begrenzt. Ist der tatsächliche Kontotarif anders aufgebaut, muss die Formel angepasst und getestet werden, bevor das Modell aktiviert wird. `fetchFalPrices` liefert offizielle Rohpreise, aktiviert aber nichts. Raten sind sieben Tage gültig. Das Angebot gilt zehn Minuten, gehört einem Nutzer/Workspace und trägt Preisversion, Eingabehash sowie einen eingefrorenen Eingabekontext. Der Start lehnt einen inzwischen geänderten Preisstand ab.

## Atomarität

`enqueue_job` legt Job, Reservierung, Ledger-Eintrag, Trainingsversion (falls benötigt) und Outbox in einer Transaktion an. Projekt-, Workspace- und Angebotssperren verhindern Überbuchung. Bereits aktive Jobs zählen zu Nutzer-, Modell-, Workspace- und Projektlimits. Ein Idempotenzschlüssel ist pro Nutzer/Workspace eindeutig; ein Angebot kann nur einmal gestartet werden.

`settle_job` sperrt in derselben Reihenfolge. Erfolg zieht einmalig Credits ab und hebt die Reservierung auf; definitiver technischer Fehler gibt einmalig frei. Ein später widersprechendes Ereignis ändert ein abgeschlossenes Settlement nicht und wird als Alarm sichtbar. Reservieren und Freigeben sind im Ledger als Verfügbarkeitsbewegungen geführt; für die Berechnung des Kontostands nur Zahlung/Refund/Capture betrachten, nicht alle Ledger-Zeilen summieren.

Bei Timeout unbekannter Annahme bleiben Credits reserviert. Erst Statusabfrage/Callback mit Request-ID oder belegte Anbieterbestätigung der Nichtannahme löst den Fall. Automatische Anbieter-Neuversuche: **0**; Worker-Wiederaufnahmen für Lesen/Sichern sind erlaubt.

## Stripe

Nur signaturgeprüfte Events gelangen in die Inbox; danach werden Session, Invoice, PaymentIntent und gegebenenfalls Charge über das Stripe-SDK erneut gelesen. Ein Checkout-Redirect schreibt keine Credits. Top-ups werden über die bezahlte Session, Abos ausschliesslich über `invoice.paid` gutgeschrieben. Ereignis-ID, bezahlte Resource, PaymentIntent und Charge werden unabhängig dedupliziert.

Die erste Version unterstützt genau einen passenden SKU mit Menge 1 und einer vollständigen PaymentIntent-Zahlung pro Rechnung. Gemischte Rechnungen, Mehrfachzahlungen oder reine Kundenguthaben werden zur Prüfung zurückgewiesen. Keine Credits für kostenlose/manuell als bezahlt markierte Rechnungen ohne passenden erfolgreichen PaymentIntent. Beträge, Währung und Kunde müssen übereinstimmen.

Rückerstattungen verwenden den autoritativen kumulativen Charge-Betrag. Zahlung und Refund sperren denselben Charge-Schlüssel **vor** der Workspace-Sperre, auch wenn der Refund zuerst eintrifft. Die anteilige Rücknahme wird aufgerundet und nur der neue Anteil abgezogen. Bereits verbrauchte Credits können zu einem negativen Kontostand führen; weitere Starts sind dann blockiert. Dispute-/Chargeback-Ereignisse benötigen noch einen eigenen betrieblichen Prozess vor öffentlichem Launch.

## Anbieterrechnung und Limits

Jeder Versuch hat getrennte Felder für Schätzung, tatsächliche Kosten und Rechnungsabgleich. Fehlgeschlagene Versuche zählen mit ihrem konservativen Ansatz weiter zum Ausgabenlimit, bis ein Rechnungsbetrag bestätigt wurde. Ein nachweislich vor Annahme abgewiesener POST darf mit 0 erfasst werden. Erfolgreich bedeutet nicht, dass tatsächliche Anbieterrechnungskosten bereits bekannt sind.

Die initialen Ausgabenlimits gelten **kumulativ**, nicht monatlich: Projekt 200 USD, Workspace/Nutzer 50 USD, Modell 100 USD. Anfangs sind ohnehin alle Modelle deaktiviert. Bei 80 % des Workspace-Budgets wird ein deduplizierter Alarm erzeugt; ein überschrittenes Limit blockiert neue Reservierungen. Kostenkorrekturen können bereits überschrittene Beträge sichtbar machen, keine bereits entstandenen Kosten rückgängig machen. Einmal pro Woche Preise und Rechnungen prüfen; Budgeterhöhungen bewusst über eine administrierte Migration vornehmen, nicht durch Löschen der Historie.
