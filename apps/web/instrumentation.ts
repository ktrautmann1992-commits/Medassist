/**
 * REQ-005, REQ-021: Prüft die serverseitige Konfiguration beim Start der
 * Server-Instanz (`register` läuft einmal, bevor Anfragen bedient werden).
 * Ungültige Werte – z. B. `ZWEI_FA_AKTIV=ja` – beenden den Prozess mit Exit-Code 1,
 * statt still einen Standard anzunehmen oder jede Anfrage mit 500 zu beantworten.
 *
 * Während `next build` wird nicht geprüft: Dort gibt es (z. B. im CI-Checks-Job)
 * bewusst keine Umgebungsvariablen. Die Node.js-spezifische Logik liegt in
 * `lib/startpruefung.ts` und wird nur in der Node.js-Runtime geladen.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { pruefeKonfigurationBeimStart } = await import("./lib/startpruefung");
  pruefeKonfigurationBeimStart();
}
