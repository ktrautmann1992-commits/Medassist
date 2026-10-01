import { env } from "./env";

/**
 * REQ-005, REQ-021: Wird aus `instrumentation.ts` beim Serverstart aufgerufen
 * (nur Node.js-Runtime). Bei ungültiger Konfiguration wird die Server-Instanz
 * beendet – die Fehlermeldung enthält nur Variablennamen, keine Werte.
 */
export function pruefeKonfigurationBeimStart(): void {
  try {
    env();
  } catch (fehler) {
    console.error(fehler instanceof Error ? fehler.message : fehler);
    process.exit(1);
  }
}
