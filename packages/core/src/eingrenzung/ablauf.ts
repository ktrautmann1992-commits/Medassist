import type { AntwortWert } from "./antwort";
import { bedingungErfuellt, type FrageKontext } from "./bedingung";
import type { Bereich } from "./schema";
import type { Frage, Fragenkataloge } from "./typen";

/**
 * REQ-305, REQ-308, REQ-311: Schrittfolge der geführten Eingrenzung als reine Funktion.
 * Der Server bestimmt den Schritt ausschließlich aus dem gespeicherten Stand – der Client
 * hält keinen sicherheitsrelevanten Zustand (REQ-315).
 *
 * seelisch:   Krisen-Screening → Schnellcheck → [Notfall-Bestätigung] → Fragen → Zusammenfassung
 * körperlich: Schnellcheck → [Notfall-Bestätigung] → Körperregion → Fragen → Zusammenfassung
 * KRISE beendet den Ablauf sofort (kein weiterer Diagnose-Ablauf, REQ-208).
 */

export type Schritt =
  | { art: "krise" }
  | { art: "schnellcheck" }
  | { art: "notfall_weiter" }
  | { art: "region" }
  | { art: "frage"; frage: Frage }
  | { art: "zusammenfassung" }
  | { art: "beendet" };

export interface AblaufStand {
  bereich: Bereich;
  kriseErledigt: boolean;
  /** Regel-Engine meldet KRISE ⇒ Ablauf beendet. */
  krise: boolean;
  schnellcheckErledigt: boolean;
  /** Aktueller Red-Flag-Hinweis ist NOTFALL (Regel-Engine). */
  notfallAktiv: boolean;
  notfallBestaetigt: boolean;
  region: string | null;
  /** Letzte vollständige Antwort je Frage. */
  antworten: Readonly<Record<string, AntwortWert>>;
  kinderprofil: boolean;
  alterMonate: number | null;
}

export function schrittId(s: Schritt): string {
  return s.art === "frage" ? s.frage.id : s.art;
}

export function frageKontext(k: Fragenkataloge, stand: AblaufStand): FrageKontext {
  const region = stand.region ? k.koerperkarte.regionenById.get(stand.region) : undefined;
  return {
    region: region ? region.id : null,
    organsysteme: region?.organsysteme ?? [],
    kinderprofil: stand.kinderprofil,
    alterMonate: stand.alterMonate,
    antworten: stand.antworten,
  };
}

/** Fragen, deren Bedingung beim aktuellen Stand erfüllt ist – in Katalogreihenfolge. */
export function anwendbareFragen(k: Fragenkataloge, stand: AblaufStand): Frage[] {
  const kontext = frageKontext(k, stand);
  return k.kataloge[stand.bereich].fragen.filter((f) => f.bedingung === null || bedingungErfuellt(f.bedingung, kontext));
}

function beantwortet(stand: AblaufStand, id: string): boolean {
  return Object.hasOwn(stand.antworten, id);
}

export function naechsterSchritt(k: Fragenkataloge, stand: AblaufStand): Schritt {
  if (stand.bereich === "PSYCHISCH" && !stand.kriseErledigt) return { art: "krise" };
  if (stand.krise) return { art: "beendet" };
  if (!stand.schnellcheckErledigt) return { art: "schnellcheck" };
  // REQ-308: Bei NOTFALL vor jeder weiteren Frage ausdrücklich bestätigen lassen.
  if (stand.notfallAktiv && !stand.notfallBestaetigt) return { art: "notfall_weiter" };
  if (stand.bereich === "KOERPERLICH" && !(stand.region && k.koerperkarte.regionenById.has(stand.region))) return { art: "region" };
  const offen = anwendbareFragen(k, stand).find((f) => !beantwortet(stand, f.id));
  return offen ? { art: "frage", frage: offen } : { art: "zusammenfassung" };
}

/**
 * Pfad der Schritte bis einschließlich zum nächsten offenen Schritt (für Fortschritt und
 * „Zurück“). Die Notfall-Bestätigung ist kein Teil des Pfads.
 */
export function pfad(k: Fragenkataloge, stand: AblaufStand): string[] {
  const schritte: string[] = [];
  if (stand.bereich === "PSYCHISCH") schritte.push("krise");
  schritte.push("schnellcheck");
  if (stand.bereich === "KOERPERLICH") schritte.push("region");
  schritte.push(...anwendbareFragen(k, stand).map((f) => f.id));
  return schritte;
}

/**
 * REQ-305: Bearbeitbar sind nur die Körperregion und bereits beantwortete, anwendbare
 * Fragen – nie Krisen-Screening, Schnellcheck oder Notfall-Bestätigung (RISK-030).
 */
export function bearbeitbareSchritte(k: Fragenkataloge, stand: AblaufStand): string[] {
  if (stand.krise || (stand.bereich === "PSYCHISCH" && !stand.kriseErledigt) || !stand.schnellcheckErledigt) return [];
  const ids: string[] = [];
  if (stand.bereich === "KOERPERLICH" && stand.region) ids.push("region");
  ids.push(...anwendbareFragen(k, stand).filter((f) => beantwortet(stand, f.id)).map((f) => f.id));
  return ids;
}

/**
 * Schritt zu einer übermittelten bzw. angefragten Schritt-ID – nur, wenn er der nächste
 * offene Schritt oder ein bearbeitbarer früherer Schritt ist; sonst `null`.
 */
export function erlaubterSchritt(k: Fragenkataloge, stand: AblaufStand, id: string): Schritt | null {
  const naechster = naechsterSchritt(k, stand);
  if (naechster.art === "beendet" || naechster.art === "zusammenfassung") return null;
  if (schrittId(naechster) === id) return naechster;
  // Solange ein Pflichtschritt (Krise, Schnellcheck, Notfall-Bestätigung) offen ist, gibt es kein „Zurück“.
  if (naechster.art === "krise" || naechster.art === "schnellcheck" || naechster.art === "notfall_weiter") return null;
  if (!bearbeitbareSchritte(k, stand).includes(id)) return null;
  if (id === "region") return { art: "region" };
  const frage = k.kataloge[stand.bereich].fragenById.get(id);
  return frage ? { art: "frage", frage } : null;
}

/** Vorheriger bearbeitbarer Schritt im Pfad (für „Zurück“) oder `null`. */
export function vorherigerSchritt(k: Fragenkataloge, stand: AblaufStand, aktuell: string): string | null {
  const p = pfad(k, stand);
  const i = p.indexOf(aktuell);
  if (i <= 0) return null;
  const bearbeitbar = bearbeitbareSchritte(k, stand);
  for (let j = i - 1; j >= 0; j--) if (bearbeitbar.includes(p[j]!)) return p[j]!;
  return null;
}

/** „Schritt x von y“ – y kann sich durch Bedingungen ändern. */
export function fortschritt(k: Fragenkataloge, stand: AblaufStand, aktuell: string): { nummer: number; gesamt: number } | null {
  const p = pfad(k, stand);
  const i = p.indexOf(aktuell);
  return i < 0 ? null : { nummer: i + 1, gesamt: p.length };
}
