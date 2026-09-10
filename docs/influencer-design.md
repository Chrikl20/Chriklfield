# Influencer-Gestaltung

Die öffentliche [Higgsfield-Seite](https://higgsfield.ai/) wurde am 9. September 2026 mit Web-Abruf und einer Browseraufnahme angesehen. Die Anregungen sind grosse Medienflächen, schnelle Einstiege in Bild/Video und ein dichter Vorlagenbereich. Chriklfield verwendet eine eigene Seitennavigation, Texte, Gestaltung und lizenzierte Fotos; keine Higgsfield-Medien oder Qualitätsversprechen wurden übernommen.

## Umsetzung

- Dunkles, neutrales Grundlayout mit Lime-Akzenten und klarer Typografie in allen Studios.
- Explore mit Portrait-/Outfit-Motiven, Character-Einstieg, direkter Bild-zu-Video-Weitergabe und sechs Creator-Presets.
- Filter für Fashion, Lifestyle und Beauty. Ein Preset befüllt Szene, Outfit, Pose, Prompt und Format im Image Studio. Die Felder bleiben editierbar; ein Klick startet keinen kostenpflichtigen Auftrag.
- Der aktive Charakter bleibt erhalten. Änderungen der URL-Auswahl initialisieren das Studioformular neu, damit eine neu geöffnete Vorlage nicht alte Eingaben anzeigt.
- Neue Anmeldung mit vertikalen Content-Karten. Der E-Mail-Login und die privaten Medienzugriffe behalten ihre bestehenden Prüfungen.
- Öffentliche Bildnachweise unter `/credits`. Fünf lokal ausgelieferte WebP-Dateien (zusammen rund 507 KiB) und responsive `next/image`-Ausgabe; keine externen Foto-Requests im Browser.
- Zweispaltige Vorlagenkarten auf dem Handy, einspaltige Workflow-Karten, erreichbare Kernaktionen und reduzierte Animationen bei entsprechender Systemeinstellung.

Die sechs Produkt-Presets sind in `src/domain/creator-presets.ts` mit dem Code versioniert. Bestehende, im Adminpanel bearbeitbare Datenbankvorlagen bleiben unter „Weitere Studio-Vorlagen“ verfügbar. Dieser Designwechsel verändert keine gespeicherten Nutzerreferenzen, Charakterversionen oder privaten Ergebnisse und benötigt keine Datenbankmigration.

## Aussage der Fotos

Die Medien sind als Foto-Inspiration gekennzeichnet. Die abgebildeten Personen sind weder trainierte Charaktere noch Testpersonen oder Fürsprecher des Produkts. Die Bilder werden nicht in Trainingsdatensätze übernommen. Die Prompts sind Ausgangspunkte, keine Zusicherung derselben Person, Pose oder Ergebnisqualität. Quelle und Lizenz jeder Datei stehen in `public/creator/credits.json`.

## Prüfung

Nach dem Umbau bestanden lokal die TypeScript-Prüfung, ESLint, 44 Tests in sieben Dateien und der Next.js-Produktionsbuild. Für die neuen Abläufe wurden die bestehenden Desktop-/Mobiltests um die Übernahme und Bearbeitung eines Creator-Presets sowie die Anmeldung/Bildnachweise ergänzt. Die Cloud-Browser-Richtlinie blockiert den Zugriff auf den lokalen Entwicklungsserver; eine lokale visuelle Prüfung wird deshalb nicht behauptet. Die Ergebnisse des zugehörigen GitHub-CI-Laufs und der Vercel-Vorschau werden im Design-Pull-Request festgehalten.

Keine bezahlten Generierungen, echten Zahlungen oder Produktionspromotionen wurden für den Designwechsel ausgeführt. Die Bildqualität der angebundenen KI-Modelle wird durch diese Oberflächenprüfung nicht validiert.
