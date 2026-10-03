import { z } from "zod";
import { katalogIdSchema, kopfFelder, pruefeStatus, schnellcheckSchema } from "../eingrenzung/schema";

/**
 * REQ-320: zod-Schema des Entwicklungskatalogs `content/fragen/entwicklung.json`.
 * Alle Objekte sind strikt – unbekannte Felder werden abgewiesen. Es gibt keine
 * Bedingungen als Zeichenkette und keine Normwerte: Fragen haben nur einen (breiten,
 * ungeprüften) Altersbereich und Antwortoptionen mit einer Einstufung.
 */

/** Einstufung je Antwortoption bzw. Bereich – aufsteigend nach Vorsicht. */
export const EINSTUFUNGEN = ["ALTERSGERECHT", "BEOBACHTEN", "ABKLAERUNG"] as const;
export type Einstufung = (typeof EINSTUFUNGEN)[number];

/** `kern` = Kernbeobachtung, `weitere` = weitere Beobachtung, `sorge` = Sorge der Eltern. */
export const FRAGE_ROLLEN = ["kern", "weitere", "sorge"] as const;
export type FrageRolle = (typeof FRAGE_ROLLEN)[number];

/** Obergrenze des Entwicklungs-Checks: unter 18 Jahren (REQ-322). */
export const MAX_ALTER_MONATE = 216;

/** Pflicht-ID der Option „unsicher“ jeder Bereichsfrage (REQ-321). */
export const OPTION_UNSICHER = "unsicher";

const id = katalogIdSchema;
const text = z.string().trim().min(1);
const einstufung = z.enum(EINSTUFUNGEN);

export const monatsBereichSchema = z
  .strictObject({
    minMonate: z.number().int().min(0).max(MAX_ALTER_MONATE),
    unterMonate: z.number().int().min(1).max(MAX_ALTER_MONATE),
  })
  .refine((a) => a.minMonate < a.unterMonate, "Altersbereich: minMonate muss kleiner als unterMonate sein.");

const bereichsOption = z.strictObject({ id, bezeichnung: text, einstufung });

export const entwicklungsFrageSchema = z.strictObject({
  id,
  rolle: z.enum(FRAGE_ROLLEN),
  /** Kurzbezeichnung für Zusammenfassung und ärztliche Übersicht. */
  kurz: text,
  /** An Sorgeberechtigte. */
  textKind: text,
  /** Ärztliche Fremdanamnese (REQ-221). */
  textFremd: text,
  hilfe: text.optional(),
  alter: monatsBereichSchema,
  optionen: z.array(bereichsOption).min(2).max(6),
});
export type EntwicklungsFrageDaten = z.infer<typeof entwicklungsFrageSchema>;

export const entwicklungsBereichSchema = z.strictObject({
  id,
  bezeichnung: text,
  beschreibung: text,
  alter: monatsBereichSchema,
  /** IDs aus `anlaufstellen`; die erste muss `kinderarzt` sein (REQ-321). */
  anlaufstellen: z.array(id).min(1),
  /** Allgemeine, alltagstaugliche Ideen – kein Therapieersatz, ungeprüft (REQ-326). */
  foerderideen: z.array(text).max(5),
  fragen: z.array(entwicklungsFrageSchema).min(2),
});

const ergebnisText = z.strictObject({ titel: text, textPatient: text, textArzt: text });

export const entwicklungskatalogDateiSchema = z
  .strictObject({
    art: z.literal("entwicklungskatalog"),
    ...kopfFelder,
    /** Altersbereich (Entwicklungsalter), für den der Demo-Katalog Fragen hat. */
    alter: monatsBereichSchema,
    schnellcheck: schnellcheckSchema,
    /** Symptom-ID des Engine-Vokabulars für den Verlust erworbener Fähigkeiten (REQ-321, REQ-324). */
    regressionSymptom: id,
    /** Pflichtfrage Regression – Mehrfachauswahl mit Verweis auf das Engine-Vokabular. */
    pflichtfrage: z.strictObject({
      id,
      kurz: text,
      textKind: text,
      textFremd: text,
      hilfe: text.optional(),
      optionen: z
        .array(
          z.union([
            z.strictObject({ symptom: id, einstufung }),
            // Eigene Option, die zusätzlich das Symptom setzt (z. B. „Ich bin mir nicht sicher“ ⇒ konservativ Warnzeichen, QA E1).
            z.strictObject({ id, bezeichnung: text, symptom: id, einstufung }),
          ]),
        )
        .min(1),
      keineOption: text,
    }),
    anlaufstellen: z.array(z.strictObject({ id, bezeichnung: text, hinweis: text.nullable() })).min(1),
    anlaufstellenQuelle: text,
    ergebnisse: z.strictObject({ ALTERSGERECHT: ergebnisText, BEOBACHTEN: ergebnisText, ABKLAERUNG: ergebnisText }),
    bereiche: z.array(entwicklungsBereichSchema).min(1),
  })
  .superRefine(pruefeStatus);
export type EntwicklungskatalogDatei = z.infer<typeof entwicklungskatalogDateiSchema>;
