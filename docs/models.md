# Higgsfield-Modelle

Higgsfield ist der einzige Modellprovider von Chriklfield. Das kanonische Modellregister liegt in `src/domain/models.ts`; Request-Mapping und Statusbehandlung liegen in `src/server/providers/higgsfield.ts`.

| Chriklfield-Key | Verwendung | Higgsfield-Workflow |
| --- | --- | --- |
| `train` | Charakteridentität | Soul ID / Custom Reference |
| `draft` | freier Bildentwurf | Soul |
| `image` | Charakterbild | Soul + Soul ID |
| `edit` | Bildreferenz | Soul + Referenzbild |
| `video` | Bild zu Video | Kling 3.0 Pro über Higgsfield |
| `motion` | Bewegung übertragen | Genjutsu Motion Transfer |

## Soul ID

Eine Trainingsversion benötigt 20–80 freigegebene Bilder derselben erwachsenen Person beziehungsweise eines zulässigen fiktiven Charakters. Nach erfolgreichem Training wird die Higgsfield-ID als `character_versions.provider_reference_id` gespeichert.

## Bilder

Soul-Bildgenerierungen verwenden derzeit 1 oder 4 Varianten. Charakterbilder erfordern eine fertige Soul-ID-Version. Referenzbearbeitung verwendet eine freigegebene Bildreferenz.

## Video

Video- und Motion-Aufträge laufen ebenfalls über Higgsfield. Kling erhält ein Startbild; Genjutsu erhält ein Referenzvideo plus Startbild. Eingaben werden serverseitig auf Dateityp, Dimensionen und Dauer geprüft.

## Preise

Modelle sind nach Provider- oder Preisänderungen standardmäßig deaktiviert. Ein Admin muss Rate, Einheit und Prüfzeitpunkt hinterlegen, bevor kostenpflichtige Starts möglich sind.
