# apps/mobile – Platzhalter

Die native App (React Native / Expo) folgt mit **Meilenstein 11**. Sie ist nötig für
HealthKit (iOS), Health Connect / Samsung Health (Android), Kamera und Sprachaufnahme
(CLAUDE.md §4, §8).

- Auslieferung über **Expo EAS Build** (App Store / Google Play), nicht über Vercel.
- Nutzt die API unter der Vercel-Domain von `apps/web`.
- Gemeinsame Logik und Schemas kommen aus `packages/core`.

Bis dahin enthält dieses Paket keine Abhängigkeiten, damit CI und Installation schlank bleiben.
