import { z } from "zod";
import { REGEL_STATUS, quelleSchema, vergleichSchema, type Vergleich } from "../regeln/schema";

/**
 * REQ-300 – REQ-303: zod-Schemas der Fragenkataloge und der Körperkarte unter
 * `/content/fragen/`. Alle Objekte sind strikt – unbekannte Felder werden abgewiesen.
 * Bedingungen sind rein deklarativ (kein `eval`, keine Ausdrücke als Zeichenkette, RISK-022).
 */

export const FRAGE_TYPEN = ["einfach", "mehrfach", "skala", "freitext", "dauer"] as const;
export type FrageTyp = (typeof FRAGE_TYPEN)[number];

export const DAUER_EINHEITEN = ["minuten", "stunden", "tage", "wochen", "monate", "jahre"] as const;
export type DauerEinheit = (typeof DAUER_EINHEITEN)[number];
/** `mehr` für die Auswahl („Tage“), `seit` für die Zusammenfassung im Dativ („seit 3 Tagen“). */
export const DAUER_EINHEIT_TEXT: Record<DauerEinheit, { eins: string; mehr: string; seit: string }> = {
  minuten: { eins: "Minute", mehr: "Minuten", seit: "Minuten" },
  stunden: { eins: "Stunde", mehr: "Stunden", seit: "Stunden" },
  tage: { eins: "Tag", mehr: "Tage", seit: "Tagen" },
  wochen: { eins: "Woche", mehr: "Wochen", seit: "Wochen" },
  monate: { eins: "Monat", mehr: "Monate", seit: "Monaten" },
  jahre: { eins: "Jahr", mehr: "Jahre", seit: "Jahren" },
};

export const ANSICHTEN = ["vorne", "hinten"] as const;
export type Ansicht = (typeof ANSICHTEN)[number];

/** REQ-304/REQ-323: Weg 2 (körperlich, seelisch) und Weg 3 (Entwicklungs-Check). */
export const BEREICHE = ["KOERPERLICH", "PSYCHISCH", "ENTWICKLUNG"] as const;
export type Bereich = (typeof BEREICHE)[number];
/** Bereiche mit einer Datei vom Typ `fragenkatalog` (Weg 2). */
export const GEFUEHRTE_BEREICHE = ["KOERPERLICH", "PSYCHISCH"] as const;

/** REQ-301/REQ-323: Diese Schritt-IDs sind für den Ablauf reserviert und keine Frage-IDs. */
export const RESERVIERTE_SCHRITTE = ["krise", "schnellcheck", "notfall_weiter", "region", "bereiche", "zusammenfassung"] as const;

/** REQ-320: Altersbereich in vollen Monaten (`minMonate` inklusiv, `unterMonate` exklusiv). */
export interface MonatsBereich {
  minMonate: number;
  unterMonate: number;
}

/** REQ-302: maximale Verschachtelungstiefe von Bedingungen. */
export const MAX_BEDINGUNG_TIEFE = 4;

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Version muss SemVer sein (z. B. 1.0.0).");
export const katalogIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "ID: Kleinbuchstaben, Ziffern, Unterstrich.");
const id = katalogIdSchema;
const text = z.string().trim().min(1);

/** Kopf jeder Datei: Version, Stand, Status, Quelle (wie REQ-200: „geprüft“ nur mit Quelle und Prüfer). */
export const kopfFelder = {
  katalogVersion: semver,
  stand: z.iso.date(),
  hinweis: text,
  status: z.enum(REGEL_STATUS),
  quelle: quelleSchema.nullable(),
  quelleHinweis: text.nullable(),
  geprueftVon: text.nullable(),
};

export function pruefeStatus(d: { status: string; quelle: unknown; quelleHinweis: string | null; geprueftVon: string | null }, ctx: z.RefinementCtx) {
  if (d.status === "geprüft" && (!d.quelle || !d.geprueftVon)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Status „geprüft“ verlangt Quelle und geprueftVon." });
  }
  if (!d.quelle && !d.quelleHinweis) {
    ctx.addIssue({ code: "custom", path: ["quelleHinweis"], message: "Ohne Quelle ist ein quelleHinweis Pflicht." });
  }
}

// --- Bedingungen (REQ-302) -------------------------------------------------

export type FrageBedingung =
  | { alle: FrageBedingung[] }
  | { eines: FrageBedingung[] }
  | { nicht: FrageBedingung }
  | { antwort: string; ist: string }
  | { antwort: string; enthaelt: string }
  | { beantwortet: string }
  | { region: string[] }
  | { organsystem: string }
  | { kinderprofil: boolean }
  | { alter_monate: Vergleich };

export const frageBedingungSchema: z.ZodType<FrageBedingung> = z.lazy(() =>
  z.union([
    z.strictObject({ alle: z.array(frageBedingungSchema).min(1) }),
    z.strictObject({ eines: z.array(frageBedingungSchema).min(1) }),
    z.strictObject({ nicht: frageBedingungSchema }),
    z.strictObject({ antwort: id, ist: id }),
    z.strictObject({ antwort: id, enthaelt: id }),
    z.strictObject({ beantwortet: id }),
    z.strictObject({ region: z.array(id).min(1) }),
    z.strictObject({ organsystem: id }),
    z.strictObject({ kinderprofil: z.boolean() }),
    z.strictObject({ alter_monate: vergleichSchema }),
  ]),
);

// --- Fragen (REQ-301) -------------------------------------------------------

export const eigeneOptionSchema = z.strictObject({ id, bezeichnung: text, fachbegriff: text.nullable() });
/** Verweis auf ein Symptom des Engine-Vokabulars (`content/regeln/vokabular.json`). */
export const symptomOptionSchema = z.strictObject({ symptom: id });

const frageBasis = {
  id,
  /** Kurzbezeichnung für die Zusammenfassung (Patientensprache). */
  kurz: text,
  /** Eigene Person. */
  text,
  /** Sorgeberechtigte über ihr Kind. */
  textKind: text,
  /** Ärztliche Fremdanamnese (REQ-221). */
  textFremd: text,
  hilfe: text.optional(),
  /** Pflicht: kein „Überspringen“. */
  pflicht: z.boolean(),
  bedingung: frageBedingungSchema.nullable(),
};

export const frageSchema = z.discriminatedUnion("typ", [
  z.strictObject({ ...frageBasis, typ: z.literal("einfach"), optionen: z.array(eigeneOptionSchema).min(2) }),
  z.strictObject({
    ...frageBasis,
    typ: z.literal("mehrfach"),
    optionen: z.array(z.union([eigeneOptionSchema, symptomOptionSchema])).min(1),
    /** Ausschließende Option „Nichts davon“ (optional). */
    keineOption: text.optional(),
  }),
  z
    .strictObject({
      ...frageBasis,
      typ: z.literal("skala"),
      min: z.number().int().min(0),
      max: z.number().int().max(10),
      minText: text,
      maxText: text,
    })
    .refine((f) => f.min < f.max, "Skala: min muss kleiner als max sein."),
  z.strictObject({ ...frageBasis, typ: z.literal("freitext"), maxLaenge: z.number().int().min(1).max(500) }),
  z.strictObject({
    ...frageBasis,
    typ: z.literal("dauer"),
    einheiten: z.array(z.enum(DAUER_EINHEITEN)).min(1),
    maxAnzahl: z.number().int().min(1).max(999),
  }),
]);
export type FrageDaten = z.infer<typeof frageSchema>;

/** REQ-306: Warnzeichen-Schnellcheck – Symptome und Messwerte aus dem Engine-Vokabular. */
export const schnellcheckSchema = z.strictObject({
  titel: text,
  text,
  textKind: text,
  textFremd: text,
  hilfe: text,
  symptome: z.array(id).min(1),
  messwerte: z.array(id),
  keineText: text,
});

export const fragenkatalogDateiSchema = z
  .strictObject({
    art: z.literal("fragenkatalog"),
    bereich: z.enum(GEFUEHRTE_BEREICHE),
    ...kopfFelder,
    schnellcheck: schnellcheckSchema,
    fragen: z.array(frageSchema).min(1),
  })
  .superRefine(pruefeStatus);
export type FragenkatalogDatei = z.infer<typeof fragenkatalogDateiSchema>;

// --- Körperkarte (REQ-303) --------------------------------------------------

const koordinate = z.number().finite().min(0).max(2000);
const laenge = z.number().finite().positive().max(2000);

export const formSchema = z.union([
  z.strictObject({ ellipse: z.strictObject({ cx: koordinate, cy: koordinate, rx: laenge, ry: laenge }) }),
  z.strictObject({
    rechteck: z.strictObject({ x: koordinate, y: koordinate, breite: laenge, hoehe: laenge, radius: z.number().finite().min(0).max(100) }),
  }),
  z.strictObject({ polygon: z.array(z.tuple([koordinate, koordinate])).min(3).max(40) }),
]);
export type Form = z.infer<typeof formSchema>;

export const koerperkarteDateiSchema = z
  .strictObject({
    art: z.literal("koerperkarte"),
    ...kopfFelder,
    viewBox: z.strictObject({ breite: laenge, hoehe: laenge }),
    organsysteme: z.array(z.strictObject({ id, bezeichnung: text, fachbegriff: text.nullable() })).min(1),
    regionen: z
      .array(
        z.strictObject({
          id,
          bezeichnung: text,
          fachbegriff: text.nullable(),
          organsysteme: z.array(id).min(1),
          formen: z.strictObject({ vorne: z.array(formSchema), hinten: z.array(formSchema) }),
        }),
      )
      .min(1),
  })
  .superRefine(pruefeStatus);
export type KoerperkarteDatei = z.infer<typeof koerperkarteDateiSchema>;
