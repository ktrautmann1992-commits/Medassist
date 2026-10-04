import koerperkarte from "../../../../content/fragen/koerperkarte.json" with { type: "json" };
import koerperlich from "../../../../content/fragen/koerperlich.json" with { type: "json" };
import seelisch from "../../../../content/fragen/seelisch.json" with { type: "json" };
import entwicklung from "../../../../content/fragen/entwicklung.json" with { type: "json" };
import { standardRegelwerk } from "../regeln/standard";
import { ladeFragenkataloge } from "./laden";
import type { Fragenkataloge } from "./typen";

/**
 * REQ-300: Standard-Fragenkataloge aus `/content/fragen/` – per JSON-Import gebündelt
 * (kein Dateizugriff zur Laufzeit), geprüft gegen das Standard-Regelwerk.
 */
export const FRAGEN_DATEIEN = { koerperkarte, koerperlich, seelisch, entwicklung } as const;

let geladen: Fragenkataloge | undefined;

export function standardFragenkataloge(): Fragenkataloge {
  geladen ??= ladeFragenkataloge(FRAGEN_DATEIEN, standardRegelwerk());
  return geladen;
}
