import { z } from "zod";
import { ANLAUFSTELLEN } from "./kontakte";
import type { Pruefergebnis } from "./engine";
import { DRINGLICHKEITEN, REGEL_STATUS, ZEITRAHMEN, dringlichkeitSchema, quelleSchema } from "./schema";

/**
 * REQ-212: Ergebnisobjekt einer Bewertung (Regel-Engine, später auch KI-Ausgaben in
 * Meilenstein 6). Enthält alle Felder für die Arzt-Rolle; die Patientensicht entsteht
 * ausschließlich über den Whitelist-Rollenfilter (REQ-213).
 */

export const GESAMTSTATUS = ["KRISE", ...DRINGLICHKEITEN, "KEINE_WARNZEICHEN"] as const;
const text = z.string().trim().min(1);
export const REGELBEREICHE = ["krisenpfad", "red-flags", "sicherheitsnetz"] as const;

export const ausgeloesteRegelSchema = z.object({
  regelwerk: z.enum(REGELBEREICHE),
  id: text,
  version: text,
  titel: text,
  dringlichkeit: dringlichkeitSchema,
  zeitrahmen: z.enum(ZEITRAHMEN),
  hinweisPatient: text,
  hinweisArzt: text,
  anlaufstelle: z.enum(ANLAUFSTELLEN),
  quelle: quelleSchema.nullable(),
  quelleHinweis: text.nullable(),
  status: z.enum(REGEL_STATUS),
  geprueftVon: text.nullable(),
});

export const diagnoseSchema = z.object({
  bezeichnung: text,
  icd10Code: text.nullable(),
  /** V Verdacht, G gesichert, A Ausschluss, Z Zustand nach. */
  sicherheit: z.enum(["V", "G", "A", "Z"]),
  einschaetzung: z.number().min(0).max(1).nullable(),
  begruendung: text.nullable(),
  ausschlussGrund: text.nullable(),
  quellen: z.array(quelleSchema),
});

export const krisenhinweisSchema = z.object({ grund: z.enum(["positiv", "unvollstaendig"]) });
export const notfallhinweisSchema = z.object({
  dringlichkeit: z.enum(["NOTFALL", "DRINGEND"]),
  zeitrahmen: z.enum(["SOFORT", "HEUTE"]),
});

export const moeglicheUrsacheSchema = z.object({
  /** Alltagssprache. */
  bezeichnung: text,
  fachbegriff: text.nullable(),
  begruendung: text,
});

export const facharztEmpfehlungSchema = z.object({ fachrichtung: text, begruendung: text.nullable() });

export const bewertungsergebnisSchema = z.object({
  regelwerkVersion: text,
  status: z.enum(GESAMTSTATUS),
  dringlichkeit: dringlichkeitSchema.nullable(),
  ablaufBeenden: z.boolean(),
  krisenhinweis: krisenhinweisSchema.nullable(),
  notfallhinweis: notfallhinweisSchema.nullable(),
  ausgeloesteRegeln: z.array(ausgeloesteRegelSchema),
  moeglicheUrsachen: z.array(moeglicheUrsacheSchema),
  // --- nur Arzt (REQ-213) ---
  arbeitsdiagnose: diagnoseSchema.nullable(),
  differentialdiagnosen: z.array(diagnoseSchema),
  diagnostischeGrundlage: z.array(text),
  facharztEmpfehlungen: z.array(facharztEmpfehlungSchema),
  verhaltenshinweise: z.array(text),
  therapieplan: z.array(z.object({ massnahme: text, details: text.nullable() })),
  medikation: z.array(
    z.object({
      wirkstoff: text,
      staerke: text.nullable(),
      darreichungsform: text.nullable(),
      dosierung: text.nullable(),
      dauer: text.nullable(),
      hinweise: text.nullable(),
    }),
  ),
  laborwerte: z.array(z.object({ parameter: text, wert: text, einheit: text.nullable() })),
});
export type Bewertungsergebnis = z.infer<typeof bewertungsergebnisSchema>;

/** Bewertungsergebnis aus der Regelprüfung (noch ohne Diagnosen – folgen mit Meilenstein 6/7). */
export function ergebnisAusPruefung(p: Pruefergebnis): Bewertungsergebnis {
  const rf = p.redFlagDringlichkeit;
  const zr = p.redFlagZeitrahmen === "HEUTE" && rf === "DRINGEND" ? "HEUTE" : "SOFORT";
  return bewertungsergebnisSchema.parse({
    regelwerkVersion: p.regelwerkVersion,
    status: p.status,
    dringlichkeit: p.hoechsteDringlichkeit,
    ablaufBeenden: p.ablaufBeenden,
    krisenhinweis: p.kriseGrund ? { grund: p.kriseGrund } : null,
    notfallhinweis: rf === "NOTFALL" || rf === "DRINGEND" ? { dringlichkeit: rf, zeitrahmen: zr } : null,
    ausgeloesteRegeln: [...p.krisenRegeln, ...p.redFlags],
    moeglicheUrsachen: [],
    arbeitsdiagnose: null,
    differentialdiagnosen: [],
    diagnostischeGrundlage: [],
    facharztEmpfehlungen: [],
    verhaltenshinweise: [],
    therapieplan: [],
    medikation: [],
    laborwerte: [],
  });
}
