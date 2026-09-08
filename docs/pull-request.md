# Creator Studio: versionierte Charaktere, Bild-/Videoworkflow und abgesicherte Abrechnung

Das bisher leere Repository erhält eine ausführbare erste Creator-Plattform. Der Kernablauf verbindet bestätigte Referenzen und versioniertes Krea-Training mit LoRA-Bildern, Kling-Videos und privater Ergebnisverwaltung.

Enthalten sind Next.js/React/TypeScript, Supabase Auth/RLS/private Buckets, getrennte Trigger.dev-Aufträge, geprüfte fal-Adapter, Stripe Checkout/Portal, FFmpeg und ein expliziter lokaler Demo-Modus. Preisangebote, Jobanlage, Reservierung und Outbox sind atomar; unklare Anbieterannahme führt zum Abgleich statt zu einem zweiten bezahlten POST. Webhooks sind signaturgeprüft und dedupliziert. Zahlungen/Refunds und Ergebnisabrechnung sind unabhängig abgesichert.

Die dunkle Oberfläche umfasst Explore, Characters, Image Studio, Video Studio, Library, Billing und ein Adminpanel. Identität bleibt von Outfit/Szene getrennt; neue Referenzen benötigen Nutzerfreigabe.

Prüfungen: 43 lokale Tests, Typprüfung, Linting, Worker-Bundle und Produktionsbuild am 7. September bestanden. Am 8. September bestanden der gezielte Build mit Testadapter und der echte Vercel-Preview-Build (`READY`). Die anschliessende Browserprüfung wurde nach einem Hänger abgebrochen. Details und Grenzen: `docs/verification.md`. CI für Typprüfung/Lint/Tests/Build, native PostgreSQL-Nebenläufigkeit und Desktop-/Mobil-E2E ist enthalten; der erste GitHub-Lauf muss noch ausgewertet werden. Keine Live-Modellgenerierung, reale Zahlung oder Produktionspromotion durchgeführt.

Vor Launch: Zielkonten und Live-Verträge testen, Preise bestätigen, externe Alarme/Löschprozesse und rechtliche Bedingungen abschliessen. Abhängigkeiten sind festgeschrieben; die ausgeführte Prüfung meldete keine bekannten Schwachstellen. Dieser PR ist als Draft zur Prüfung vorgesehen und enthält keinen Deploy-Automatismus.

Vercel-Anpassung: Live-Medien werden direkt in private Supabase-Eingangsbuckets übertragen und erst nach Trigger-/FFmpeg-Prüfung veröffentlicht. Speicherreservierungen, feste Asset-IDs, Leases, bounded Recovery und verzögerter Rohdaten-Purge schützen gegen doppelte Fertigmeldungen, alte Worker und noch gültige Uploadtokens. Die Oberfläche zeigt den Prüfstatus. Eine vierte Migration und `vercel.json` sind enthalten.
