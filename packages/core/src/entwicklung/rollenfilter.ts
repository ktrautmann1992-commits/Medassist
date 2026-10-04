import { z } from "zod";
import type { Rolle } from "../roles";
import { nachWhitelist, type Whitelist } from "../regeln/rollenfilter";
import type { EntwicklungsErgebnis } from "./ergebnis";
import { EINSTUFUNGEN } from "./schema";

/**
 * REQ-328: Rollenfilter für das Entwicklungsergebnis – serverseitig, rein, **Whitelist**
 * (gleicher Mechanismus wie REQ-213). PATIENT erhält nur ausdrücklich erlaubte Felder –
 * keine ärztliche Übersicht, keinen ärztlichen Hinweistext; die Patientensicht wird gegen
 * ein striktes Schema validiert. ARZT erhält Übersicht und ärztlichen Hinweis, aber keine
 * Förderideen (REQ-327).
 */

const ANLAUFSTELLE: Whitelist = { id: true, bezeichnung: true, hinweis: true };

export const ENTWICKLUNG_PATIENT_WHITELIST = {
  katalogVersion: true,
  alterMonate: true,
  korrigiert: true,
  regression: true,
  hinweis: true,
  anlaufstellenQuelle: true,
  bereiche: [
    {
      id: true,
      bezeichnung: true,
      einstufung: true,
      titel: true,
      textPatient: true,
      gruende: [true],
      anlaufstellen: [ANLAUFSTELLE],
      foerderideen: [true],
      unvollstaendig: true,
    },
  ],
} as const satisfies Whitelist;

const text = z.string().trim().min(1);
const anlaufstelleSchema = z.strictObject({ id: text, bezeichnung: text, hinweis: text.nullable() });

export const entwicklungPatientSchema = z.strictObject({
  rolle: z.literal("PATIENT"),
  katalogVersion: text,
  alterMonate: z.number().int().min(0).nullable(),
  korrigiert: z.boolean(),
  regression: z.enum(["ja", "unsicher", "nein"]).nullable(),
  hinweis: text,
  anlaufstellenQuelle: text,
  bereiche: z.array(
    z.strictObject({
      id: text,
      bezeichnung: text,
      einstufung: z.enum(EINSTUFUNGEN),
      titel: text,
      textPatient: text,
      gruende: z.array(text),
      anlaufstellen: z.array(anlaufstelleSchema).min(1),
      foerderideen: z.array(text),
      unvollstaendig: z.boolean(),
    }),
  ),
});
export type EntwicklungPatient = z.infer<typeof entwicklungPatientSchema>;

export type EntwicklungArzt = Omit<EntwicklungsErgebnis, "bereiche"> & {
  rolle: "ARZT";
  bereiche: Omit<EntwicklungsErgebnis["bereiche"][number], "foerderideen">[];
};
export type GefilterteEntwicklung = EntwicklungPatient | EntwicklungArzt;

export function filtereEntwicklungNachRolle(ergebnis: EntwicklungsErgebnis, rolle: Rolle): GefilterteEntwicklung {
  switch (rolle) {
    case "ARZT": {
      const kopie = structuredClone(ergebnis);
      // REQ-327: keine Förderideen für die Arzt-Rolle.
      const bereiche = kopie.bereiche.map((b) => {
        const ohne: Partial<typeof b> = { ...b };
        delete ohne.foerderideen;
        return ohne as Omit<typeof b, "foerderideen">;
      });
      return { ...kopie, rolle: "ARZT", bereiche };
    }
    case "PATIENT":
      return entwicklungPatientSchema.parse({ ...(nachWhitelist(ergebnis, ENTWICKLUNG_PATIENT_WHITELIST) as object), rolle: "PATIENT" });
    default:
      throw new Error("Unbekannte Rolle – keine Ausgabe.");
  }
}
