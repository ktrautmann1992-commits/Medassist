import { z } from "zod";
import type { Rolle } from "../roles";
import {
  GESAMTSTATUS,
  REGELBEREICHE,
  bewertungsergebnisSchema,
  krisenhinweisSchema,
  notfallhinweisSchema,
  type Bewertungsergebnis,
} from "./ergebnis";
import { ANLAUFSTELLEN } from "./kontakte";
import { REGEL_STATUS, ZEITRAHMEN, dringlichkeitSchema, quelleSchema } from "./schema";

/**
 * REQ-213: Rollenfilter nach CLAUDE.md §2 – serverseitig, rein, **Whitelist**.
 * Für PATIENT gelangen nur ausdrücklich erlaubte Felder in die Ausgabe; neue Felder
 * (z. B. aus späteren KI-Ausgaben) werden automatisch entfernt (RISK-024).
 * Krisen- und Notfallhinweise gehen immer an beide Rollen.
 */

export const VERDACHT_KENNZEICHNUNG = "Verdacht – ärztlich abzuklären";

/** `true` = Primitivwert übernehmen; Objekt = nur diese Schlüssel; `[spec]` = Liste mit Element-Spezifikation. */
type Whitelist = true | { readonly [feld: string]: Whitelist } | readonly [Whitelist];

const QUELLE: Whitelist = { titel: true, version: true, url: true };

export const PATIENT_WHITELIST = {
  regelwerkVersion: true,
  status: true,
  dringlichkeit: true,
  ablaufBeenden: true,
  krisenhinweis: { grund: true },
  notfallhinweis: { dringlichkeit: true, zeitrahmen: true },
  ausgeloesteRegeln: [
    {
      regelwerk: true,
      id: true,
      version: true,
      titel: true,
      dringlichkeit: true,
      zeitrahmen: true,
      hinweisPatient: true,
      anlaufstelle: true,
      quelle: QUELLE,
      quelleHinweis: true,
      status: true,
      geprueftVon: true,
    },
  ],
  moeglicheUrsachen: [{ bezeichnung: true, fachbegriff: true, begruendung: true }],
  facharztEmpfehlungen: [{ fachrichtung: true, begruendung: true }],
  verhaltenshinweise: [true],
} as const satisfies Whitelist;

function nachWhitelist(wert: unknown, spec: Whitelist): unknown {
  if (wert === null || wert === undefined) return null;
  if (spec === true) {
    // Nur Primitive – verschachtelte Objekte brauchen eine eigene Spezifikation.
    return typeof wert === "object" || typeof wert === "function" ? null : wert;
  }
  if (Array.isArray(spec)) {
    return Array.isArray(wert) ? wert.map((x) => nachWhitelist(x, spec[0] as Whitelist)) : [];
  }
  if (typeof wert !== "object" || Array.isArray(wert)) return null;
  const quelle = wert as Record<string, unknown>;
  const ziel: Record<string, unknown> = {};
  for (const [feld, unterSpec] of Object.entries(spec as Record<string, Whitelist>)) {
    if (Object.hasOwn(quelle, feld)) ziel[feld] = nachWhitelist(quelle[feld], unterSpec);
  }
  return ziel;
}

const text = z.string().trim().min(1);

/** Strikte Patientensicht – zusätzliche Absicherung nach dem Filtern. */
export const patientenErgebnisSchema = z.strictObject({
  rolle: z.literal("PATIENT"),
  regelwerkVersion: text,
  status: z.enum(GESAMTSTATUS),
  dringlichkeit: dringlichkeitSchema.nullable(),
  ablaufBeenden: z.boolean(),
  krisenhinweis: krisenhinweisSchema.strict().nullable(),
  notfallhinweis: notfallhinweisSchema.strict().nullable(),
  ausgeloesteRegeln: z.array(
    z.strictObject({
      regelwerk: z.enum(REGELBEREICHE),
      id: text,
      version: text,
      titel: text,
      dringlichkeit: dringlichkeitSchema,
      zeitrahmen: z.enum(ZEITRAHMEN),
      hinweisPatient: text,
      anlaufstelle: z.enum(ANLAUFSTELLEN),
      quelle: quelleSchema.nullable(),
      quelleHinweis: text.nullable(),
      status: z.enum(REGEL_STATUS),
      geprueftVon: text.nullable(),
    }),
  ),
  moeglicheUrsachen: z.array(
    z.strictObject({
      kennzeichnung: z.literal(VERDACHT_KENNZEICHNUNG),
      bezeichnung: text,
      fachbegriff: text.nullable(),
      begruendung: text,
    }),
  ),
  facharztEmpfehlungen: z.array(z.strictObject({ fachrichtung: text, begruendung: text.nullable() })),
  verhaltenshinweise: z.array(text),
});
export type PatientenErgebnis = z.infer<typeof patientenErgebnisSchema>;
export type ArztErgebnis = Bewertungsergebnis & { rolle: "ARZT" };
export type GefiltertesErgebnis = PatientenErgebnis | ArztErgebnis;

export function filtereNachRolle(ergebnis: Bewertungsergebnis, rolle: Rolle): GefiltertesErgebnis {
  switch (rolle) {
    case "ARZT":
      // Arzt erhält alles (CLAUDE.md §2); Kopie, damit der Aufrufer das Original nicht teilt.
      return { ...bewertungsergebnisSchema.loose().parse(structuredClone(ergebnis)), rolle: "ARZT" };
    case "PATIENT": {
      const gefiltert = nachWhitelist(ergebnis, PATIENT_WHITELIST) as Record<string, unknown>;
      const ursachen = (gefiltert.moeglicheUrsachen as Record<string, unknown>[] | undefined) ?? [];
      return patientenErgebnisSchema.parse({
        ...gefiltert,
        rolle: "PATIENT",
        // Patient sieht mögliche Ursachen nur als Verdacht (CLAUDE.md §2).
        moeglicheUrsachen: ursachen.map((u) => ({ kennzeichnung: VERDACHT_KENNZEICHNUNG, ...u })),
      });
    }
    default:
      throw new Error("Unbekannte Rolle – keine Ausgabe.");
  }
}
