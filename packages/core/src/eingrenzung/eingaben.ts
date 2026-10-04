import type { RegelEingabeRoh } from "../regeln/eingabe";
import type { Regelwerk } from "../regeln/laden";
import type { Antwort } from "../regeln/schema";
import { normalisiereAntwort } from "../regeln/engine";
import { begrenzeMesswerte, gespeicherteEingabeSchema, type AntwortWert } from "./antwort";
import type { Bereich } from "./schema";
import type { Fragenkataloge } from "./typen";
import type { AblaufStand } from "./ablauf";

/**
 * REQ-313: Zusammenführen der gespeicherten Eingaben eines Falls (chronologisch).
 *
 * - **Regel-Engine (konservativ):** alle Eingaben zählen – Symptome als Vereinigung
 *   (ein angegebenes Warnzeichen kann im selben Fall nicht zurückgenommen werden),
 *   alle Messwerte, alle Krisenantworten („ja“ vor „keine Angabe“ vor „nein“).
 * - **Ablauf und Zusammenfassung:** jeweils die letzte vollständige Antwort.
 * - Nicht lesbare Eingaben werden verworfen und gezählt (⇒ „Prüfung unvollständig“);
 *   eine nicht lesbare Krisen-Eingabe ergibt KRISE (RISK-035).
 */
export interface GespeicherteEingabeRoh {
  frageId: string | null;
  strukturiert: unknown;
}

export interface Gesammelt {
  kriseErledigt: boolean;
  schnellcheckErledigt: boolean;
  notfallBestaetigt: boolean;
  region: string | null;
  /**
   * REQ-323: zuletzt gewählte Bereiche des Entwicklungs-Checks – immer ergänzt um Bereiche mit
   * bereits beantworteten Fragen (QA E3: beantwortete Bereiche können nicht abgewählt werden).
   */
  bereiche: string[] | null;
  /** QA E2: Entwicklungsalter, festgehalten bei der ersten Bereichsauswahl. */
  entwicklungsAlter: { monate: number; korrigiert: boolean } | null;
  antworten: Record<string, AntwortWert>;
  /** Alle Symptome (Vereinigung) – Reihenfolge der ersten Angabe. */
  symptome: string[];
  messwerte: Record<string, number[]>;
  /** „Nichts davon“ im Schnellcheck ausdrücklich bestätigt. */
  schnellcheckKeine: boolean;
  /** Konservativ zusammengeführte Krisenantworten oder `null` (noch nicht beantwortet). */
  krisenAntworten: Record<string, Antwort> | null;
  /** Eingabe für `werteWarnzeichenAus` (Teilauswertung der Regel-Engine, REQ-219). */
  regelEingabe: RegelEingabeRoh;
  /** Nicht lesbare gespeicherte Eingaben. */
  ungueltig: number;
  /** QA R3-B1: Eine einzelne Abgabe enthielt verschiedene Werte für denselben Messwert (mehrdeutig). */
  uneindeutig: boolean;
  /** Regelprüfung sinnvoll: körperlich nach der ersten Eingabe, seelisch erst nach dem Krisen-Screening. */
  bewertbar: boolean;
}

export function sammleEingaben(
  k: Fragenkataloge,
  regelwerk: Regelwerk,
  bereich: Bereich,
  eingaben: readonly GespeicherteEingabeRoh[],
): Gesammelt {
  const katalog = k.kataloge[bereich];
  const g: Gesammelt = {
    kriseErledigt: false,
    schnellcheckErledigt: false,
    notfallBestaetigt: false,
    region: null,
    bereiche: null,
    entwicklungsAlter: null,
    antworten: {},
    symptome: [],
    messwerte: {},
    schnellcheckKeine: false,
    krisenAntworten: null,
    regelEingabe: { symptome: [], messwerte: [], antworten: [], psychisch: bereich === "PSYCHISCH" },
    ungueltig: 0,
    uneindeutig: false,
    bewertbar: false,
  };
  const krisenPaare: [string, unknown][] = [];
  const symptomHinzu = (ids: readonly string[]) => {
    for (const s of ids) if (!g.symptome.includes(s)) g.symptome.push(s);
  };
  /**
   * QA R3-B1: Identische Werte werden zusammengefasst; verschiedene Werte aus verschiedenen
   * Abgaben bleiben alle erhalten (jede Schwelle wird geprüft). Nur verschiedene Werte
   * **innerhalb einer** Abgabe gelten als mehrdeutig (⇒ „Prüfung unvollständig“).
   */
  const messwerteHinzu = (m: Readonly<Record<string, readonly number[]>>) => {
    for (const [mid, werte] of Object.entries(m)) {
      if (new Set(werte).size > 1) g.uneindeutig = true;
      const liste = (g.messwerte[mid] ??= []);
      for (const w of werte) if (!liste.includes(w)) liste.push(w);
    }
  };

  for (const e of eingaben) {
    const r = gespeicherteEingabeSchema.safeParse(e.strukturiert);
    // Spalte `frageId` und Inhalt müssen übereinstimmen – sonst gilt die Eingabe als nicht lesbar.
    if (!r.success || r.data.schritt !== e.frageId) {
      g.ungueltig++;
      // QA N1: Gültige Symptom-IDs und Messwerte aus einer nicht vollständig lesbaren Eingabe
      // retten – ein Warnzeichen darf nie mit der übrigen Eingabe verworfen werden.
      const rettung = rette(regelwerk, e.strukturiert);
      symptomHinzu(rettung.symptome);
      messwerteHinzu(rettung.messwerte);
      if (e.frageId === "krise") {
        // RISK-035: Nicht lesbare Krisen-Eingabe ⇒ jede Krisenfrage ungültig ⇒ KRISE.
        for (const f of regelwerk.fragen) krisenPaare.push([f.id, "ungültig"]);
        g.kriseErledigt = true;
      }
      continue;
    }
    const { schritt, teilweise, wert } = r.data;
    switch (wert.typ) {
      case "schnellcheck":
        if (schritt !== "schnellcheck") {
          g.ungueltig++;
          break;
        }
        symptomHinzu(wert.symptome);
        messwerteHinzu(wert.messwerte);
        if (!teilweise) {
          g.schnellcheckErledigt = true;
          if (wert.keine) g.schnellcheckKeine = true;
        }
        break;
      case "krise":
        if (schritt !== "krise") {
          g.ungueltig++;
          break;
        }
        for (const [fid, a] of Object.entries(wert.antworten)) krisenPaare.push([fid, a]);
        g.kriseErledigt = true;
        break;
      case "notfall_bestaetigung":
        if (schritt === "notfall_weiter") g.notfallBestaetigt = true;
        else g.ungueltig++;
        break;
      case "region":
        if (schritt === "region" && !teilweise) g.region = wert.region;
        else g.ungueltig++;
        break;
      case "bereiche":
        // REQ-323: nur im Entwicklungs-Check und nur bekannte Bereiche – sonst nicht lesbar.
        if (schritt === "bereiche" && !teilweise && bereich === "ENTWICKLUNG" && wert.bereiche.every((b) => k.entwicklung.bereicheById.has(b))) {
          g.bereiche = [...wert.bereiche];
          g.entwicklungsAlter ??= { monate: wert.alterMonate, korrigiert: wert.korrigiert };
        } else g.ungueltig++;
        break;
      default: {
        // Antwort auf eine Frage. Symptome zählen immer (auch Teil-Eingaben, andere Katalogversion).
        if (wert.typ === "mehrfach") symptomHinzu(wert.symptome);
        const frage = katalog.fragenById.get(schritt);
        if (teilweise || !frage) break;
        const passt = wert.typ === "keine_angabe" || wert.typ === frage.typ;
        if (passt) g.antworten[schritt] = wert;
        else g.ungueltig++;
      }
    }
  }

  if (bereich === "ENTWICKLUNG" && g.bereiche) {
    // QA E3: Bereiche mit beantworteten Fragen bleiben gewählt (Reihenfolge wie im Katalog).
    const beantwortet = new Set(Object.keys(g.antworten).flatMap((fid) => k.entwicklung.meta.get(fid)?.bereich ?? []));
    const gewaehlt = new Set([...g.bereiche, ...beantwortet]);
    g.bereiche = k.entwicklung.bereiche.filter((b) => gewaehlt.has(b.id)).map((b) => b.id);
  }

  if (g.kriseErledigt) {
    const antworten: Record<string, Antwort> = {};
    for (const f of regelwerk.fragen) {
      const werte = krisenPaare.filter(([fid]) => fid === f.id).map(([, w]) => w);
      antworten[f.id] = normalisiereAntwort(werte);
    }
    g.krisenAntworten = antworten;
  }
  g.regelEingabe = {
    symptome: [...g.symptome],
    // Zahlen mit höchstens einer Nachkommastelle (geprüft beim Speichern) – Engine liest sie erneut.
    messwerte: Object.entries(g.messwerte).flatMap(([mid, werte]) => werte.map((w) => [mid, String(w)] as const)),
    antworten: krisenPaare,
    mehrereAbgaben: true,
    // QA N3: Vor dem Krisen-Screening werden im seelischen Weg nur die Red Flags ausgewertet
    // (sonst ergäbe das noch unbeantwortete Screening KRISE). Das Screening bleibt Pflicht und zuerst.
    psychisch: bereich === "PSYCHISCH" && g.kriseErledigt,
  };
  const angaben = g.symptome.length > 0 || Object.keys(g.messwerte).length > 0;
  g.bewertbar = bereich === "PSYCHISCH" ? g.kriseErledigt || angaben : eingaben.length > 0;
  return g;
}

/** Ablaufstand aus den gesammelten Eingaben und dem (serverseitigen) Ergebnis der Regel-Engine. */
export function ablaufStandAus(
  bereich: Bereich,
  g: Gesammelt,
  bewertung: { krise: boolean; notfallAktiv: boolean; kinderprofil: boolean; alterMonate: number | null },
): AblaufStand {
  return {
    bereich,
    kriseErledigt: g.kriseErledigt,
    krise: bewertung.krise,
    schnellcheckErledigt: g.schnellcheckErledigt,
    notfallAktiv: bewertung.notfallAktiv,
    notfallBestaetigt: g.notfallBestaetigt,
    region: g.region,
    bereiche: g.bereiche,
    antworten: g.antworten,
    kinderprofil: bewertung.kinderprofil,
    // QA E2: im Entwicklungs-Check gilt ab der Bereichsauswahl das festgehaltene Entwicklungsalter.
    alterMonate: bereich === "ENTWICKLUNG" && g.entwicklungsAlter ? g.entwicklungsAlter.monate : bewertung.alterMonate,
  };
}

/**
 * QA N1: Teilweises Lesen einer nicht schemagültigen Eingabe. Übernommen werden nur
 * Symptom-IDs des Vokabulars und endliche Zahlen bekannter Messwerte (innerhalb des
 * Plausibilitätsbereichs prüft die Engine erneut). Alles andere wird ignoriert.
 */
function rette(regelwerk: Regelwerk, roh: unknown): { symptome: string[]; messwerte: Record<string, number[]> } {
  const ergebnis = { symptome: [] as string[], messwerte: {} as Record<string, number[]> };
  const wert = roh && typeof roh === "object" ? (roh as { wert?: unknown }).wert : undefined;
  if (!wert || typeof wert !== "object") return ergebnis;
  const { symptome, messwerte } = wert as { symptome?: unknown; messwerte?: unknown };
  if (Array.isArray(symptome)) {
    for (const s of symptome.slice(0, 1000)) if (typeof s === "string" && regelwerk.symptome.has(s) && !ergebnis.symptome.includes(s)) ergebnis.symptome.push(s);
  }
  if (messwerte && typeof messwerte === "object" && !Array.isArray(messwerte)) {
    for (const [mid, werte] of Object.entries(messwerte as Record<string, unknown>)) {
      if (!regelwerk.messwerte.has(mid) || !Array.isArray(werte)) continue;
      const zahlen = werte.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      if (zahlen.length) ergebnis.messwerte[mid] = begrenzeMesswerte(zahlen);
    }
  }
  return ergebnis;
}
