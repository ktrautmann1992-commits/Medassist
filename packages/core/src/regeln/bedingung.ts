import type { AlterAngabe, Befundlage } from "./befundlage";
import { MAX_TIEFE, type Altersbereich, type Bedingung, type Vergleich } from "./schema";

/**
 * REQ-202: Auswertung deklarativer Bedingungen als reine Funktion. Es gibt keine
 * Möglichkeit, Code aus Regeldateien auszuführen – nur die hier ausprogrammierten
 * Operatoren (RISK-022).
 */

function vergleiche(ist: number, op: "<" | "<=" | ">" | ">=", soll: number): boolean {
  switch (op) {
    case "<":
      return ist < soll;
    case "<=":
      return ist <= soll;
    case ">":
      return ist > soll;
    case ">=":
      return ist >= soll;
  }
}

function erfuelltVergleich(ist: number, v: Vergleich): boolean {
  return (["<", "<=", ">", ">="] as const).every((op) => v[op] === undefined || vergleiche(ist, op, v[op]));
}

export function werteAus(b: Bedingung, befund: Befundlage): boolean {
  if ("alle" in b) return b.alle.every((x) => werteAus(x, befund));
  if ("eines" in b) return b.eines.some((x) => werteAus(x, befund));
  if ("symptom" in b) return befund.symptome.includes(b.symptom);
  if ("messwert" in b) {
    const werte = Object.hasOwn(befund.messwerte, b.messwert) ? befund.messwerte[b.messwert] : undefined;
    // Fehlender Messwert erfüllt keine Messwert-Bedingung (REQ-202); bei mehreren Werten
    // genügt einer (konservativ, B2).
    return Array.isArray(werte) && werte.some((w) => typeof w === "number" && Number.isFinite(w) && vergleiche(w, b.op, b.wert));
  }
  // Unbekanntes Alter: Bedingung gilt als erfüllt (konservativ, REQ-204).
  if ("alter_tage" in b) return befund.alter === null || erfuelltVergleich(befund.alter.tage, b.alter_tage);
  if ("alter_monate" in b) return befund.alter === null || erfuelltVergleich(befund.alter.monate, b.alter_monate);
  if ("antwort" in b) return Object.hasOwn(befund.antworten, b.antwort) && befund.antworten[b.antwort] === b.gleich;
  if ("schwangerschaft" in b) return befund.schwangerschaft === b.schwangerschaft;
  // Unerreichbar bei validierten Regeln; defensiv kein stilles „wahr“.
  throw new Error("Unbekannter Bedingungsoperator.");
}

/**
 * H-2/REQ-218: Symptome, die im **erfüllten** Zweig einer Bedingung tatsächlich verwendet
 * wurden. Nur diese gelten als von der Regel „abgedeckt“ (Sicherheitsnetz).
 */
export function genutzteSymptome(b: Bedingung, befund: Befundlage): string[] {
  if (!werteAus(b, befund)) return [];
  if ("alle" in b) return b.alle.flatMap((x) => genutzteSymptome(x, befund));
  if ("eines" in b) return b.eines.flatMap((x) => genutzteSymptome(x, befund));
  if ("symptom" in b) return [b.symptom];
  return [];
}

function imBereich(a: AlterAngabe, b: Altersbereich): boolean {
  if (b.minTage !== undefined && a.tage < b.minTage) return false;
  if (b.unterTage !== undefined && a.tage >= b.unterTage) return false;
  if (b.minMonate !== undefined && a.monate < b.minMonate) return false;
  if (b.unterMonate !== undefined && a.monate >= b.unterMonate) return false;
  return true;
}

/** REQ-204: Regel gilt im Altersbereich; unbekanntes Alter → konservativ ja. */
export function imAltersbereich(bereich: Altersbereich | null, befund: Befundlage): boolean {
  if (!bereich || befund.alter === null) return true;
  if (imBereich(befund.alter, bereich)) return true;
  return bereich.bezug === "chronologisch_oder_korrigiert" && befund.korrigiertesAlter !== null
    ? imBereich(befund.korrigiertesAlter, bereich)
    : false;
}

export interface Referenzen {
  symptome: string[];
  messwerte: string[];
  antworten: string[];
  tiefe: number;
}

/** Sammelt referenzierte IDs und die Verschachtelungstiefe (für die Validierung beim Laden). */
export function referenzen(b: Bedingung, tiefe = 1, ziel: Referenzen = { symptome: [], messwerte: [], antworten: [], tiefe: 0 }): Referenzen {
  ziel.tiefe = Math.max(ziel.tiefe, tiefe);
  if (tiefe > MAX_TIEFE) return ziel;
  if ("alle" in b) b.alle.forEach((x) => referenzen(x, tiefe + 1, ziel));
  else if ("eines" in b) b.eines.forEach((x) => referenzen(x, tiefe + 1, ziel));
  else if ("symptom" in b) ziel.symptome.push(b.symptom);
  else if ("messwert" in b) ziel.messwerte.push(b.messwert);
  else if ("antwort" in b) ziel.antworten.push(b.antwort);
  return ziel;
}
