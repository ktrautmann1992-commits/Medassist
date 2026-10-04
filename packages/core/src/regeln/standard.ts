import krisenpfad from "../../../../content/regeln/krisenpfad.json" with { type: "json" };
import redFlags from "../../../../content/regeln/red-flags.json" with { type: "json" };
import vokabular from "../../../../content/regeln/vokabular.json" with { type: "json" };
import { ladeRegelwerk, type Regelwerk } from "./laden";

/**
 * REQ-201: Das Standard-Regelwerk aus `/content/regeln/`. Die Dateien werden per
 * JSON-Import gebündelt (kein Dateizugriff zur Laufzeit; landen im Function-Bundle).
 * Geladen und validiert wird beim ersten Aufruf; ein Fehler wird nicht abgefangen.
 */
export const REGEL_DATEIEN = { vokabular, redFlags, krisenpfad } as const;

let geladen: Regelwerk | undefined;

export function standardRegelwerk(): Regelwerk {
  geladen ??= ladeRegelwerk(REGEL_DATEIEN);
  return geladen;
}
