# Modelladapter und geprüfte Grenzen

Dokumentation und lokale SDK-Typen geprüft am **5./6. September 2026**. Keine Live-Anbieteranfrage zur Generierung ausgeführt. `src/domain/models.ts` speichert Fähigkeiten, Basismodell, Eingaben und Limits; `model_prices` speichert versionierte Preisformel, Preisstand, Freigabe und Kostenlimit. Die folgenden Links sind die offiziellen Vertragsquellen.

| Adapter         | Offizieller Vertrag                                                                           | Anwendung                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Entwurf         | [fal Krea 2 Turbo](https://fal.ai/models/fal-ai/krea-2/turbo/api)                             | `fal-ai/krea-2/turbo`; 1–4 Bilder, eigene Grössen, JPEG, Safety Checker an                                       |
| Training        | [fal Krea 2 Trainer](https://fal.ai/models/fal-ai/krea-2-trainer/api)                         | `images_data_url`, Captions im ZIP, `auto_captioning: Off`, numerische Auflösung 768/1024, Lernrate und Schritte |
| Charakterbild   | [fal Krea 2 Turbo LoRA](https://fal.ai/models/fal-ai/krea-2/turbo/lora/api)                   | Eine private LoRA mit kompatiblem `krea-2`-Basismodell; Scale 0–4                                                |
| Zusatzansichten | [fal Seedream 4.5 Edit](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/api)        | `image_urls`, bis 10 bestätigte Referenzen, `auto_2K`, `max_images: 1`                                           |
| Image-to-Video  | [fal Kling v3 Pro I2V](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api)    | `start_image_url`, Dauer als String 3–15, `generate_audio`                                                       |
| Motion Control  | [fal Kling v3 Pro Motion](https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control/api) | `image_url`, `video_url`, `character_orientation`, `keep_original_sound`                                         |

Kling erhält Bilder/Bewegungsreferenzen **keine Bild-LoRA**. Der LoRA-Familiencheck ist serverseitig. Seedream erhält echte Referenzbilder; ein unveränderter Prompt oder Seed garantiert keine Identität. Die Anwendung begrenzt Training bewusst auf 8–80 Bilder und 50–2.000 Schritte, auch wenn der Anbieter mehr zulässt. Das Datenmodell speichert Versionen sowie private Gewichte, Trainingskonfiguration und manuell ausgewählte Testbilder.

Kling-Motion-Referenzen: 3–30 Sekunden, bei Bildorientierung höchstens 10 Sekunden; 340–3.850 Pixel pro Dimension, MP4 bis 100 MB. Bilder JPEG/PNG/WebP bis 10 MB; die Anwendung decodiert und normalisiert nach JPEG. Zusätzliche Kling-Elements, Multi-Shot und End-Frame-Steuerung sind nicht implementiert. Seedream Edit übernimmt das Referenzformat automatisch; der allgemeine Formatwähler beeinflusst dieses Modell nicht.

## Fehler und Annahmesicherheit

[fal Queue](https://fal.ai/docs/documentation/model-apis/inference/queue) und [fal Webhooks](https://fal.ai/docs/documentation/model-apis/inference/webhooks): Der bezahlte Queue-POST verwendet die dokumentierte REST-Schnittstelle, weil `@fal-ai/client` 1.10.1 intern für `queue.submit` eine Wiederholungsrichtlinie setzt. Ein Timeout oder 5xx führt zu `unknown`, nicht zum erneuten POST. Für Status/Ergebnis wird das SDK verwendet. Ein Result-422 ist ein definitiver Generierungsfehler, ein Status-404 allein kein Beleg für Nichtannahme. Unsichere/unvollständige Ergebnisse werden nicht als Erfolg abgerechnet.

fal-Signaturen: Ed25519, offizielle JWKS, SHA-256 des unveränderten Bodys, Request-ID, Nutzer-ID und Zeitstempel. Zusätzlich bindet ein eigenes HMAC den Callback an den vorab gespeicherten Versuch. Alte, geänderte oder fremde Signaturen werden abgewiesen. Ergebnis-URLs werden weder im Browser verwendet noch beliebig heruntergeladen: exakte HTTPS-Hosts, Pfadpräfixe, DNS-Prüfung und angeheftete öffentliche IPv4-Adresse, begrenzte Redirects/Bytes/Timeouts.

[fal Pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing) liefert kontobezogene Preise. Die Repository-Defaults enthalten keine behaupteten Live-Raten. Vor Freigabe Tarife und deren Einheiten prüfen; Preisschätzungen sind nicht mit Rechnungen gleichzusetzen.

## Weitere offizielle Quellen

- [Supabase SSR-Clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client) und [Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs): Cookie-Refresh im Proxy und verifizierte Benutzeridentität im Backend.
- [Trigger.dev Tasks](https://trigger.dev/docs/tasks/overview), [Idempotency](https://trigger.dev/docs/idempotency), [FFmpeg Build Extension](https://trigger.dev/docs/config/extensions/ffmpeg).
- [Stripe Webhooks](https://docs.stripe.com/webhooks), [Abo-Webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [Invoice Payments](https://docs.stripe.com/api/invoice-payment/list). Stripe SDK 22.6.1 verwendet InvoicePayments statt eines erfundenen `invoice.payment_intent`-Feldes.
- CI nutzt die aktuellen dokumentierten [Checkout](https://github.com/actions/checkout), [Setup Node](https://github.com/actions/setup-node) und [Upload Artifact](https://github.com/actions/upload-artifact) Actions.

Civitai bleibt eine mögliche spätere Integration. Es ist keine ungeprüfte Trainings-API eingebaut. Modellrechte, kommerzielle Nutzung, LoRA-Export, Datenschutz und Anbieteraufbewahrung sind durch die Gründer vor öffentlichem Launch anhand der dann geltenden Bedingungen zu klären.
