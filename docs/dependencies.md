# Abhängigkeiten und Kompatibilität

Stand: 6. September 2026. Direkte Abhängigkeiten sind mit exakten stabilen Versionen und `package-lock.json` festgeschrieben. Entwicklungs- und CI-Referenz ist Node 24 LTS. TypeScript 5.9 und ESLint 9 bleiben innerhalb der Peer-Abhängigkeiten der eingebundenen Werkzeuge; eine neuere Hauptversion ist nicht automatisch kompatibel.

Die Installation weist ESLint 9, `tsconfck` und `prom-client` als veraltet aus. Die Next-Plugins für React, Import und Barrierefreiheit deklarieren derzeit noch keine ESLint-10-Kompatibilität. Deshalb wird diese Update-Abhängigkeit dokumentiert statt mit erzwungenen Peer-Konflikten übersprungen; npm meldete für den aufgelösten Stand keine Sicherheitslücken. Die entsprechenden Upstream-Updates und einen erneuten Lintlauf vor dem Launch einplanen.

`npm audit` fand in den ursprünglichen transitiven Versionen Sicherheitsmeldungen. Folgende explizite `overrides` schliessen die gemeldeten Versionsbereiche:

| Paket                 | Festgeschrieben | Grund                                                    |
| --------------------- | --------------- | -------------------------------------------------------- |
| `@opentelemetry/core` | 2.8.0           | Gepatchte Telemetrie-Bibliothek                          |
| `ws`                  | 8.21.0          | Gepatchte WebSocket-Bibliothek                           |
| `deepmerge-ts`        | 8.0.2           | Gepatchtes Konfigurations-Merge in der Worker-Buildkette |
| `tar`                 | 7.5.22          | Gepatchte Archivverarbeitung der CLI                     |
| `esbuild`             | 0.28.2          | Gepatchter Bundler in den Entwicklungswerkzeugen         |

Die letzten drei überschreiten teils ursprünglich deklarierte transitive Versionsbereiche. Deshalb prüft `npm run test:toolchain` die tatsächlich aufgelösten Module an ihren Aufrufstellen: Prisma-Konfigurations-Merge, Erstellen/Entpacken eines TAR-Archivs und Bündeln von `src/trigger/jobs.ts`. Dazu wurden CLI-Hilfe, App-Typprüfung, Tests und Build geprüft. Dies ersetzt keinen authentifizierten Trigger-Staging-Build; dieser bleibt ohne eingerichtetes Konto offen. `@trigger.dev/build` und die CLI sind Entwicklungsabhängigkeiten, der SDK bleibt eine Laufzeitabhängigkeit.

Der vollständige Audit-Abgleich nach Installation meldete **0 bekannte Schwachstellen**. Die CI wiederholt `npm audit --audit-level=high`; neu veröffentlichte Meldungen können das Gate künftig sperren. Updates über einen eigenen Branch mit Lockfile-Diff, Audit und Prüfungen übernehmen. Overrides entfernen, sobald die übergeordneten Pakete selbst geeignete Versionen auflösen. Keine ungeprüften Major-Upgrades mittels `npm audit fix --force`.

Quellen: [OpenTelemetry-Advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf), [ws-Advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [deepmerge-ts-Advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [esbuild-Advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99), [node-tar Security Advisories](https://github.com/isaacs/node-tar/security/advisories).
