import { standardFragenkataloge, standardRegelwerk } from "@medassist/core";
import { env } from "./env";

/**
 * REQ-005, REQ-021, REQ-201, REQ-300: Wird aus `instrumentation.ts` beim Serverstart aufgerufen
 * (nur Node.js-Runtime). Bei ungültiger Konfiguration oder ungültigem Regelwerk
 * (`/content/regeln/`, Fail-safe) wird die Server-Instanz beendet – die Fehlermeldung
 * enthält nur Variablennamen bzw. Regel-IDs, keine Werte.
 */
export function pruefeKonfigurationBeimStart(): void {
  try {
    env();
    standardRegelwerk();
    // REQ-300: Fragenkataloge (`/content/fragen/`) – Fail-safe wie das Regelwerk.
    standardFragenkataloge();
  } catch (fehler) {
    console.error(fehler instanceof Error ? fehler.message : fehler);
    process.exit(1);
  }
}
