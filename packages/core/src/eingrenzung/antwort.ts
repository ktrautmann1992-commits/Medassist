import { z } from "zod";
import { pruefeRegelEingabe } from "../regeln/eingabe";
import { normalisiereAntwort } from "../regeln/engine";
import type { Regelwerk } from "../regeln/laden";
import { ANTWORTEN, type Antwort } from "../regeln/schema";
import { DAUER_EINHEITEN, type DauerEinheit, katalogIdSchema } from "./schema";
import type { Frage, Katalog, Koerperkarte } from "./typen";

/**
 * REQ-306, REQ-307, REQ-310, REQ-311, REQ-313: Serverseitige Prüfung der Antworten je
 * Schritt und Schema der gespeicherten Eingaben. Leitprinzip wie in Meilenstein 3:
 * Ungültiges wird abgewiesen („im Zweifel ablehnen statt interpretieren“), sicherheits-
 * relevante gültige Teile (angekreuzte Symptome, gültige Messwerte) gehen aber nie
 * verloren – sie werden als Teil-Eingabe gespeichert und ausgewertet (REQ-219).
 */

const id = katalogIdSchema;

/**
 * QA N1: Obergrenzen gespeicherter Eingaben – werden beim **Schreiben** erzwungen
 * (`begrenzeMesswerte`, Validierung vor jedem Speichern) und beim Lesen geprüft.
 */
export const MAX_WERTE_JE_MESSWERT = 20;
export const MAX_SYMPTOME = 100;
export const MAX_FREITEXT = 500;
const symptomListe = z.array(id).max(MAX_SYMPTOME);

export const antwortWertSchema = z.discriminatedUnion("typ", [
  z.strictObject({ typ: z.literal("keine_angabe") }),
  z.strictObject({ typ: z.literal("einfach"), option: id }),
  z.strictObject({ typ: z.literal("mehrfach"), optionen: z.array(id).max(100), keine: z.boolean(), symptome: symptomListe }),
  z.strictObject({ typ: z.literal("skala"), wert: z.number().int().min(0).max(10) }),
  z.strictObject({ typ: z.literal("freitext"), text: z.string().min(1).max(MAX_FREITEXT) }),
  z.strictObject({ typ: z.literal("dauer"), anzahl: z.number().int().min(1).max(999), einheit: z.enum(DAUER_EINHEITEN) }),
]);
export type AntwortWert = z.infer<typeof antwortWertSchema>;

export const schnellcheckWertSchema = z.strictObject({
  typ: z.literal("schnellcheck"),
  symptome: symptomListe,
  keine: z.boolean(),
  messwerte: z.record(id, z.array(z.number().finite()).max(MAX_WERTE_JE_MESSWERT)),
});
export type SchnellcheckWert = z.infer<typeof schnellcheckWertSchema>;

export const kriseWertSchema = z.strictObject({ typ: z.literal("krise"), antworten: z.record(id, z.enum(ANTWORTEN)) });
export type KriseWert = z.infer<typeof kriseWertSchema>;

export const regionWertSchema = z.strictObject({ typ: z.literal("region"), region: id });
export const notfallBestaetigungSchema = z.strictObject({ typ: z.literal("notfall_bestaetigung") });
/** REQ-323: Bereichsauswahl des Entwicklungs-Checks. */
export const bereicheWertSchema = z.strictObject({
  typ: z.literal("bereiche"),
  bereiche: z.array(id).min(1).max(20),
  /** QA E2: Entwicklungsalter bei der (ersten) Bereichsauswahl – gilt für Ablauf und Ergebnis des Falls. */
  alterMonate: z.number().int().min(0).max(216),
  korrigiert: z.boolean(),
});

/** REQ-313: Inhalt von `Eingabe.strukturiert` – wird beim Lesen erneut streng geprüft. */
export const gespeicherteEingabeSchema = z.strictObject({
  v: z.literal(1),
  katalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  schritt: id,
  /** Ungültige Antwort, von der nur sicherheitsrelevante gültige Teile gespeichert wurden. */
  teilweise: z.boolean(),
  wert: z.union([antwortWertSchema, schnellcheckWertSchema, kriseWertSchema, regionWertSchema, notfallBestaetigungSchema, bereicheWertSchema]),
});
export type GespeicherteEingabe = z.infer<typeof gespeicherteEingabeSchema>;

// --- Hilfen -----------------------------------------------------------------

function istGesetzt(w: unknown): boolean {
  return !(w === undefined || w === null || w === false || (typeof w === "string" && w.trim() === ""));
}

function gesetzteTexte(werte: readonly unknown[]): { texte: string[]; ungueltig: boolean } {
  const texte: string[] = [];
  let ungueltig = false;
  for (const w of werte) {
    if (!istGesetzt(w)) continue;
    if (typeof w !== "string") {
      ungueltig = true;
      continue;
    }
    const t = w.trim();
    if (!texte.includes(t)) texte.push(t);
  }
  return { texte, ungueltig };
}

// --- Fragen -----------------------------------------------------------------

export interface AntwortRoh {
  /** Gewählte Option(en) bzw. Wert (Skala, Freitext). */
  werte: readonly unknown[];
  /** Ausschließende Option „Nichts davon“. */
  keine?: unknown;
  /** Dauer: Anzahl und Einheit. */
  anzahl?: unknown;
  einheit?: unknown;
  /** „Überspringen“ ⇒ keine Angabe (nur bei nicht verpflichtenden Fragen). */
  ueberspringen?: boolean;
}

export type AntwortPruefung =
  | { ok: true; wert: AntwortWert }
  /** `symptome`: gültig angekreuzte Symptome, die trotz des Fehlers gespeichert und ausgewertet werden. */
  | { ok: false; fehler: string; symptome: string[] };

const PFLICHT = "Diese Frage ist Pflicht – bitte beantworten.";
const ZAHL_GANZ = /^\d{1,3}$/;
// Steuerzeichen werden abgelehnt statt still entfernt.
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function fehler(text: string, symptome: string[] = []): AntwortPruefung {
  return { ok: false, fehler: text, symptome };
}

export function pruefeAntwort(frage: Frage, roh: AntwortRoh): AntwortPruefung {
  const ueberspringen = roh.ueberspringen === true;

  if (frage.typ === "mehrfach") {
    const { texte, ungueltig } = gesetzteTexte(roh.werte);
    const optionen = new Map(frage.optionen.map((o) => [o.id, o]));
    const gueltig = texte.filter((t) => optionen.has(t));
    // Reihenfolge wie im Katalog (stabil für Anzeige und Tests).
    const gewaehlt = frage.optionen.filter((o) => gueltig.includes(o.id));
    // Mehrere Optionen können dasselbe Symptom setzen (z. B. Regression „ja“/„unsicher“) – einmal zählen.
    const symptome = [...new Set(gewaehlt.flatMap((o) => (o.symptom ? [o.symptom] : [])))];
    const keine = istGesetzt(roh.keine);
    if (ungueltig || gueltig.length !== texte.length) return fehler("Unbekannte Auswahl – bitte erneut auswählen.", symptome);
    if (keine && !frage.keineOption) return fehler("Unbekannte Auswahl – bitte erneut auswählen.", symptome);
    if (keine && gewaehlt.length > 0) {
      return fehler(`Bitte entweder etwas ankreuzen oder „${frage.keineOption}“ – nicht beides.`, symptome);
    }
    // Überspringen ist nicht möglich, wenn bereits Symptome angekreuzt sind (nichts geht verloren).
    if (ueberspringen && symptome.length === 0) return frage.pflicht ? fehler(PFLICHT) : { ok: true, wert: { typ: "keine_angabe" } };
    if (!keine && gewaehlt.length === 0) {
      return fehler(frage.keineOption ? `Bitte etwas ankreuzen oder „${frage.keineOption}“ wählen.` : "Bitte mindestens eine Antwort ankreuzen.");
    }
    return { ok: true, wert: { typ: "mehrfach", optionen: gewaehlt.map((o) => o.id), keine, symptome } };
  }

  if (ueberspringen) return frage.pflicht ? fehler(PFLICHT) : { ok: true, wert: { typ: "keine_angabe" } };

  switch (frage.typ) {
    case "einfach": {
      const { texte, ungueltig } = gesetzteTexte(roh.werte);
      if (ungueltig) return fehler("Unbekannte Antwort – bitte erneut wählen.");
      if (texte.length === 0) return fehler("Bitte eine Antwort wählen.");
      if (texte.length > 1) return fehler("Bitte nur eine Antwort wählen.");
      if (!frage.optionen.some((o) => o.id === texte[0])) return fehler("Unbekannte Antwort – bitte erneut wählen.");
      return { ok: true, wert: { typ: "einfach", option: texte[0]! } };
    }
    case "skala": {
      const { texte, ungueltig } = gesetzteTexte(roh.werte);
      if (ungueltig || texte.length > 1) return fehler("Bitte nur einen Wert wählen.");
      if (texte.length === 0) return fehler(`Bitte einen Wert von ${frage.min} bis ${frage.max} wählen.`);
      const t = texte[0]!;
      const zahl = ZAHL_GANZ.test(t) ? Number(t) : Number.NaN;
      if (!Number.isInteger(zahl) || zahl < frage.min || zahl > frage.max) return fehler(`Bitte einen Wert von ${frage.min} bis ${frage.max} wählen.`);
      return { ok: true, wert: { typ: "skala", wert: zahl } };
    }
    case "freitext": {
      const werte = roh.werte.filter(istGesetzt);
      if (werte.length > 1 || (werte.length === 1 && typeof werte[0] !== "string")) return fehler("Bitte nur einen Text eingeben.");
      const t = typeof werte[0] === "string" ? werte[0].trim() : "";
      if (!t) return fehler("Bitte einen kurzen Text eingeben oder die Frage überspringen.");
      if (t.length > frage.maxLaenge) return fehler(`Bitte höchstens ${frage.maxLaenge} Zeichen eingeben.`);
      if (STEUERZEICHEN.test(t)) return fehler("Der Text enthält unzulässige Zeichen.");
      return { ok: true, wert: { typ: "freitext", text: t } };
    }
    case "dauer": {
      const anzahl = typeof roh.anzahl === "string" ? roh.anzahl.trim() : "";
      const einheit = typeof roh.einheit === "string" ? roh.einheit : "";
      const zahl = ZAHL_GANZ.test(anzahl) ? Number(anzahl) : Number.NaN;
      if (!Number.isInteger(zahl) || zahl < 1 || zahl > frage.maxAnzahl) return fehler(`Bitte eine ganze Zahl von 1 bis ${frage.maxAnzahl} eingeben.`);
      if (!(frage.einheiten as readonly string[]).includes(einheit)) return fehler("Bitte eine Einheit wählen.");
      return { ok: true, wert: { typ: "dauer", anzahl: zahl, einheit: einheit as DauerEinheit } };
    }
  }
}

// --- Schnellcheck (REQ-306) ---------------------------------------------------

export interface SchnellcheckRoh {
  symptome: readonly unknown[];
  keine: unknown;
  /** Paare (Messwert-ID, Text) in Formularreihenfolge. */
  messwerte: ReadonlyArray<readonly [string, unknown]>;
}

export type SchnellcheckPruefung =
  | { ok: true; wert: SchnellcheckWert }
  | { ok: false; feldFehler: Record<string, string[]>; teil: SchnellcheckWert };

/**
 * Nutzt die Eingabeprüfung der Regel-Engine (REQ-219: unbekannte IDs, Zahlen „im Zweifel
 * ablehnen“, Plausibilität). Zusätzlich: ausdrückliche Antwort Pflicht; „Nichts davon“
 * zusammen mit Warnzeichen wird abgewiesen – die Warnzeichen zählen trotzdem.
 */
export function pruefeSchnellcheck(katalog: Katalog, regelwerk: Regelwerk, roh: SchnellcheckRoh): SchnellcheckPruefung {
  // Alle Vokabular-IDs werden angenommen (auch außerhalb des Schnellchecks) – nichts geht verloren.
  const e = pruefeRegelEingabe(regelwerk, { symptome: roh.symptome, messwerte: roh.messwerte, antworten: [], psychisch: false });
  const feldFehler: Record<string, string[]> = { ...e.feldFehler };
  const keine = istGesetzt(roh.keine);
  const symptome = [...e.daten.symptome];
  const messwerte: Record<string, number[]> = {};
  for (const [mid, w] of Object.entries(e.daten.messwerte)) {
    const alle = typeof w === "number" ? [w] : [...w];
    messwerte[mid] = begrenzeMesswerte(alle);
    if (alle.length > MAX_WERTE_JE_MESSWERT) {
      (feldFehler[`messwert.${mid}`] ??= []).push(
        `Zu viele Werte (${alle.length}) – höchstens ${MAX_WERTE_JE_MESSWERT} werden gespeichert (kleinster und größter Wert immer). Bitte nur einen Wert angeben.`,
      );
    }
  }
  const angegeben = symptome.length > 0;
  if (keine && angegeben) {
    feldFehler.keine = [`Bitte entweder Warnzeichen ankreuzen oder „${katalog.schnellcheck.keineText}“ – nicht beides. Die angekreuzten Warnzeichen wurden berücksichtigt.`];
  } else if (!keine && !angegeben && !feldFehler.symptome) {
    feldFehler.keine = [`Bitte ankreuzen, was zutrifft, oder „${katalog.schnellcheck.keineText}“ bestätigen.`];
  }
  const wert: SchnellcheckWert = { typ: "schnellcheck", symptome, keine: keine && !angegeben, messwerte };
  return Object.keys(feldFehler).length ? { ok: false, feldFehler, teil: wert } : { ok: true, wert };
}

// --- Krisen-Screening (REQ-311) ---------------------------------------------

/**
 * REQ-209/REQ-311: Jede Krisenfrage erhält einen Wert; fehlende, mehrfache oder ungültige
 * Antworten werden mit `normalisiereAntwort` (Engine) konservativ gewertet. Immer gültig –
 * die Entscheidung KRISE trifft die Regel-Engine.
 */
export function pruefeKrise(regelwerk: Regelwerk, paare: ReadonlyArray<readonly [string, unknown]>): KriseWert {
  const antworten: Record<string, Antwort> = {};
  for (const f of regelwerk.fragen) {
    antworten[f.id] = normalisiereAntwort(paare.filter(([fid]) => fid === f.id).map(([, w]) => w));
  }
  return { typ: "krise", antworten };
}

// --- Körperregion (REQ-303) --------------------------------------------------

export function pruefeRegion(karte: Koerperkarte, werte: readonly unknown[]): { ok: true; region: string } | { ok: false; fehler: string } {
  const { texte, ungueltig } = gesetzteTexte(werte);
  if (ungueltig || texte.length > 1) return { ok: false, fehler: "Bitte nur eine Körperregion wählen." };
  if (texte.length === 0) return { ok: false, fehler: "Bitte eine Körperregion wählen – in der Karte oder in der Liste." };
  if (!karte.regionenById.has(texte[0]!)) return { ok: false, fehler: "Unbekannte Körperregion – bitte erneut wählen." };
  return { ok: true, region: texte[0]! };
}

/**
 * QA N1: Begrenzt die Werte eines Messwerts auf `MAX_WERTE_JE_MESSWERT`, ohne das Ergebnis der
 * Regel-Engine zu verändern: Jede Messwert-Bedingung vergleicht genau einen Wert mit einer
 * Schwelle (`<`, `<=`, `>`, `>=`) und gilt, wenn **ein** Wert sie erfüllt (REQ-202, B2) – das
 * entscheiden allein der kleinste und der größte Wert. Beide bleiben immer erhalten.
 */
export function begrenzeMesswerte(werte: readonly number[], max = MAX_WERTE_JE_MESSWERT): number[] {
  if (werte.length <= max) return [...werte];
  const min = Math.min(...werte);
  const groesst = Math.max(...werte);
  const rest = werte.filter((w, i) => i !== werte.indexOf(min) && i !== werte.indexOf(groesst));
  return [min, groesst, ...rest].slice(0, max);
}
