import { z } from "zod";

/** REQ-217: Schema der klinischen Testfälle (`content/regeln/testfaelle.json`); nur für Tests. */
export const testfallDateiSchema = z.strictObject({
  art: z.literal("testfaelle"),
  regelwerkVersion: z.string(),
  stichtag: z.iso.date(),
  hinweis: z.string(),
  faelle: z
    .array(
      z.strictObject({
        id: z.string().regex(/^TF-\d{3}$/),
        beschreibung: z.string().min(1),
        profil: z.strictObject({
          geburtsdatum: z.iso.date(),
          sswBeiGeburtWochen: z.number().int().nullable(),
          sswBeiGeburtTage: z.number().int().nullable(),
          schwangerschaft: z.enum(["NEIN", "SCHWANGER", "STILLEND", "UNBEKANNT"]),
        }),
        /** Abweichender Stichtag (z. B. Grenzfälle am Monatsende). */
        stichtag: z.iso.date().optional(),
        eingabe: z.strictObject({
          symptome: z.array(z.string()),
          messwerte: z.record(z.string(), z.union([z.number(), z.array(z.number())])),
          // Auch ungültige Werte (z. B. „JA“), um die konservative Normalisierung zu testen.
          antworten: z.record(z.string(), z.unknown()),
          psychisch: z.boolean(),
        }),
        erwartet: z.strictObject({
          status: z.enum(["KRISE", "NOTFALL", "DRINGEND", "ROUTINE", "BEOBACHTEN", "KEINE_WARNZEICHEN"]),
          regelIds: z.array(z.string()),
          ablaufBeenden: z.boolean(),
          befundlageFehler: z.number().int().nonnegative(),
        }),
      }),
    )
    .min(1),
});
