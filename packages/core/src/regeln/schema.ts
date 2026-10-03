import { z } from "zod";
import { ANLAUFSTELLEN } from "./kontakte";

/**
 * REQ-200, REQ-202: zod-Schemas der Regeldateien unter `/content/regeln/`.
 * Alle Objekte sind strikt – unbekannte Felder (z. B. „ausdruck“, „code“) werden
 * abgewiesen. Bedingungen sind rein deklarativ; es gibt keinen Operator, der
 * Zeichenketten als Code ausführt (RISK-022).
 */

/** Rangfolge: Index 0 = höchste Dringlichkeit (REQ-205). */
export const DRINGLICHKEITEN = ["NOTFALL", "DRINGEND", "ROUTINE", "BEOBACHTEN"] as const;
export type DringlichkeitStufe = (typeof DRINGLICHKEITEN)[number];
export const dringlichkeitSchema = z.enum(DRINGLICHKEITEN);

export const ANTWORTEN = ["ja", "nein", "keine_angabe"] as const;
export type Antwort = (typeof ANTWORTEN)[number];

export const REGEL_STATUS = ["geprüft", "ungeprüft"] as const;
export type RegelStatus = (typeof REGEL_STATUS)[number];

/** Maximale Verschachtelungstiefe von `alle`/`eines` (REQ-202). */
export const MAX_TIEFE = 6;

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Version muss SemVer sein (z. B. 1.0.0).");
const vokabularId = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "ID: Kleinbuchstaben, Ziffern, Unterstrich.");
const regelId = z.string().regex(/^[A-Z]{2,}(-[A-Z0-9]+)+$/, "Regel-ID z. B. RF-KIND-001.");
const text = z.string().trim().min(1);

const vergleichSchema = z
  .strictObject({
    "<": z.number().finite().optional(),
    "<=": z.number().finite().optional(),
    ">": z.number().finite().optional(),
    ">=": z.number().finite().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Mindestens ein Vergleich (<, <=, >, >=).");
export type Vergleich = z.infer<typeof vergleichSchema>;

export type Bedingung =
  | { alle: Bedingung[] }
  | { eines: Bedingung[] }
  | { symptom: string }
  | { messwert: string; op: "<" | "<=" | ">" | ">="; wert: number }
  | { alter_tage: Vergleich }
  | { alter_monate: Vergleich }
  | { antwort: string; gleich: Antwort }
  | { schwangerschaft: "SCHWANGER" | "STILLEND" };

export const bedingungSchema: z.ZodType<Bedingung> = z.lazy(() =>
  z.union([
    z.strictObject({ alle: z.array(bedingungSchema).min(1) }),
    z.strictObject({ eines: z.array(bedingungSchema).min(1) }),
    z.strictObject({ symptom: vokabularId }),
    z.strictObject({ messwert: vokabularId, op: z.enum(["<", "<=", ">", ">="]), wert: z.number().finite() }),
    z.strictObject({ alter_tage: vergleichSchema }),
    z.strictObject({ alter_monate: vergleichSchema }),
    z.strictObject({ antwort: vokabularId, gleich: z.enum(ANTWORTEN) }),
    z.strictObject({ schwangerschaft: z.enum(["SCHWANGER", "STILLEND"]) }),
  ]),
);

export const ALTERSBEZUG = ["chronologisch", "chronologisch_oder_korrigiert"] as const;

const ganzzahl = z.number().int().nonnegative();
export const altersbereichSchema = z
  .strictObject({
    minTage: ganzzahl.optional(),
    unterTage: ganzzahl.optional(),
    minMonate: ganzzahl.optional(),
    unterMonate: ganzzahl.optional(),
    bezug: z.enum(ALTERSBEZUG),
  })
  .superRefine((b, ctx) => {
    if (b.minTage === undefined && b.unterTage === undefined && b.minMonate === undefined && b.unterMonate === undefined) {
      ctx.addIssue({ code: "custom", message: "Altersbereich ohne Grenze – stattdessen null verwenden." });
    }
    if (b.minTage !== undefined && b.unterTage !== undefined && b.minTage >= b.unterTage) {
      ctx.addIssue({ code: "custom", message: "minTage muss kleiner als unterTage sein." });
    }
    if (b.minMonate !== undefined && b.unterMonate !== undefined && b.minMonate >= b.unterMonate) {
      ctx.addIssue({ code: "custom", message: "minMonate muss kleiner als unterMonate sein." });
    }
  });
export type Altersbereich = z.infer<typeof altersbereichSchema>;

export const quelleSchema = z.strictObject({
  titel: text,
  /** Version bzw. Stand, z. B. „Version 3.0, Stand 2024-05“. */
  version: text,
  url: z.url().nullable(),
});
export type Quelle = z.infer<typeof quelleSchema>;

/**
 * S2/REQ-205: Zeitrahmen, damit Überschrift und Hinweistext übereinstimmen
 * (z. B. DRINGEND + SOFORT → „Sofort ärztlich abklären lassen“).
 */
export const ZEITRAHMEN = ["SOFORT", "HEUTE", "IN_TAGEN", "BEOBACHTEN"] as const;
export type Zeitrahmen = (typeof ZEITRAHMEN)[number];
const ERLAUBTER_ZEITRAHMEN: Record<DringlichkeitStufe, readonly Zeitrahmen[]> = {
  NOTFALL: ["SOFORT"],
  DRINGEND: ["SOFORT", "HEUTE"],
  ROUTINE: ["IN_TAGEN"],
  BEOBACHTEN: ["BEOBACHTEN"],
};

const regelErgebnisBasis = z.strictObject({
  dringlichkeit: dringlichkeitSchema,
  zeitrahmen: z.enum(ZEITRAHMEN),
  /** Nur Krisenpfad: Ergebnis KRISE. */
  krise: z.boolean().optional(),
  /** Kein weiterer Diagnose-Ablauf (REQ-208). */
  ablaufBeenden: z.boolean().optional(),
  hinweisPatient: text,
  hinweisArzt: text,
  anlaufstelle: z.enum(ANLAUFSTELLEN),
});

export const regelErgebnisSchema = regelErgebnisBasis.refine(
  (e) => ERLAUBTER_ZEITRAHMEN[e.dringlichkeit].includes(e.zeitrahmen),
  "Zeitrahmen passt nicht zur Dringlichkeit (NOTFALL → SOFORT; DRINGEND → SOFORT/HEUTE).",
);

export const regelSchema = z
  .strictObject({
    id: regelId,
    version: semver,
    titel: text,
    bedingung: bedingungSchema,
    altersbereich: altersbereichSchema.nullable(),
    ergebnis: regelErgebnisSchema,
    quelle: quelleSchema.nullable(),
    /** Pflicht, solange keine Quelle angegeben ist (z. B. „Quelle vor klinischer Nutzung ergänzen“). */
    quelleHinweis: text.nullable(),
    status: z.enum(REGEL_STATUS),
    geprueftVon: text.nullable(),
  })
  .superRefine((r, ctx) => {
    // REQ-200, RISK-025: „geprüft“ nur mit Quelle und Prüfer.
    if (r.status === "geprüft" && (!r.quelle || !r.geprueftVon)) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "Status „geprüft“ verlangt Quelle und geprueftVon." });
    }
    if (!r.quelle && !r.quelleHinweis) {
      ctx.addIssue({ code: "custom", path: ["quelleHinweis"], message: "Ohne Quelle ist ein quelleHinweis Pflicht." });
    }
  });
export type Regel = z.infer<typeof regelSchema>;

const kopf = {
  regelwerkVersion: semver,
  stand: z.iso.date(),
  hinweis: text,
};

export const vokabularDateiSchema = z.strictObject({
  art: z.literal("vokabular"),
  ...kopf,
  symptome: z
    .array(
      z.strictObject({
        id: vokabularId,
        bezeichnung: text,
        fachbegriff: text.nullable(),
        /** REQ-218: Für sich ein Warnzeichen → Sicherheitsnetz, wenn keine Regel greift. */
        warnzeichen: z.boolean(),
        /**
         * REQ-222: Mindest-Dringlichkeit dieses Warnzeichens in jedem Alter (Selbsttest beim
         * Laden). Ohne Angabe gilt für Warnzeichen DRINGEND (Sicherheitsnetz). Ungeprüft.
         */
        mindestens: z.enum(["NOTFALL", "DRINGEND"]).optional(),
      })
      .refine((s) => s.mindestens === undefined || s.warnzeichen, "„mindestens“ nur für Warnzeichen."),
    )
    .min(1),
  messwerte: z.array(
    z
      .strictObject({
        id: vokabularId,
        bezeichnung: text,
        einheit: text,
        plausibel: z.strictObject({ min: z.number().finite(), max: z.number().finite() }),
        plausibelStatus: z.enum(REGEL_STATUS),
      })
      .refine((m) => m.plausibel.min < m.plausibel.max, "plausibel.min muss kleiner als max sein."),
  ),
});
export type VokabularDatei = z.infer<typeof vokabularDateiSchema>;

/**
 * REQ-218: Sicherheitsnetz – greift, wenn ein angegebenes Warnzeichen-Symptom keine
 * Regel auslöst (z. B. außerhalb des Altersbereichs). Mindestens DRINGEND.
 */
export const sicherheitsnetzSchema = z
  .strictObject({
    id: regelId,
    version: semver,
    titel: text,
    ergebnis: regelErgebnisSchema,
    quelle: quelleSchema.nullable(),
    quelleHinweis: text.nullable(),
    status: z.enum(REGEL_STATUS),
    geprueftVon: text.nullable(),
  })
  .refine((s) => s.ergebnis.dringlichkeit === "NOTFALL" || s.ergebnis.dringlichkeit === "DRINGEND", "Sicherheitsnetz muss mindestens DRINGEND sein.")
  .refine((s) => !s.ergebnis.krise && !s.ergebnis.ablaufBeenden, "Sicherheitsnetz setzt keine Krise.")
  .refine((s) => s.status !== "geprüft" || (s.quelle !== null && s.geprueftVon !== null), "Status „geprüft“ verlangt Quelle und geprueftVon.");
export type Sicherheitsnetz = z.infer<typeof sicherheitsnetzSchema>;

/** N-2/REQ-222: Laufzeit-Absicherung der Mindest-Dringlichkeit NOTFALL je Warnzeichen. */
export const mindestDringlichkeitSchema = sicherheitsnetzSchema.refine(
  (s) => s.ergebnis.dringlichkeit === "NOTFALL" && s.ergebnis.anlaufstelle === "NOTRUF_112",
  "Mindest-Dringlichkeit muss NOTFALL mit Notruf 112 sein.",
);

export const redFlagsDateiSchema = z.strictObject({
  art: z.literal("red-flags"),
  ...kopf,
  sicherheitsnetz: sicherheitsnetzSchema,
  mindestDringlichkeit: mindestDringlichkeitSchema,
  regeln: z
    .array(regelSchema)
    .min(1)
    .refine((r) => r.every((x) => !x.ergebnis.krise), "Red-Flag-Regeln dürfen nicht „krise“ setzen (Krisenpfad)."),
});

/** `text` an Betroffene, `textKind` an Sorgeberechtigte, `textFremd` für die ärztliche Fremdanamnese (S6). */
export const krisenFrageSchema = z.strictObject({ id: vokabularId, text, textKind: text, textFremd: text });
export type KrisenFrage = z.infer<typeof krisenFrageSchema>;

export const krisenpfadDateiSchema = z.strictObject({
  art: z.literal("krisenpfad"),
  ...kopf,
  fragenStatus: z.enum(REGEL_STATUS),
  fragenHinweis: text,
  fragen: z.array(krisenFrageSchema).min(1),
  regeln: z
    .array(regelSchema)
    .min(1)
    .refine(
      (r) => r.every((x) => x.ergebnis.krise === true && x.ergebnis.ablaufBeenden === true && x.altersbereich === null),
      "Krisenpfad-Regeln müssen krise und ablaufBeenden setzen und für alle Alter gelten.",
    ),
});
