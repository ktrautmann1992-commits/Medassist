import { imMonatsBereich } from "../entwicklung/alter";
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
 * Entwicklung (REQ-323): Schnellcheck → [Notfall-Bestätigung] → Pflichtfrage Regression →
 *             Bereichsauswahl → Fragen der gewählten Bereiche (Entwicklungsalter) → Ergebnis
 * Weg 1 „Freie Beschreibung“ (REQ-401, `mitBeschreibung`): wie Weg 2, nach Schnellcheck und
 *             Notfall-Bestätigung zusätzlich der Schritt Beschreibung (vor Körperregion/Fragen).
 * KRISE beendet den Ablauf sofort (kein weiterer Diagnose-Ablauf, REQ-208).
 */

export type Schritt =
  | { art: "krise" }
  | { art: "schnellcheck" }
  | { art: "notfall_weiter" }
  | { art: "beschreibung" }
  | { art: "region" }
  | { art: "bereiche" }
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
  /** Serverseitig aus dem Profil; im Entwicklungs-Check das Entwicklungsalter (REQ-322). */
  alterMonate: number | null;
  /** REQ-323: gewählte Bereiche des Entwicklungs-Checks (`null` = noch nicht gewählt). */
  bereiche?: readonly string[] | null;
  /** REQ-401: Weg 1 – Schritt „Beschreibung“ nach dem Schnellcheck. */
  mitBeschreibung?: boolean;
  /** REQ-401: Beschreibung (Text oder korrigiertes Transkript) gespeichert. */
  beschreibungErledigt?: boolean;
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

/**
 * Fragen, deren Bedingung beim aktuellen Stand erfüllt ist – in Katalogreihenfolge. Im
 * Entwicklungs-Check nur Fragen gewählter Bereiche und im Altersbereich (REQ-322, REQ-323).
 */
export function anwendbareFragen(k: Fragenkataloge, stand: AblaufStand): Frage[] {
  const kontext = frageKontext(k, stand);
  const gewaehlt = stand.bereiche ?? [];
  return k.kataloge[stand.bereich].fragen.filter(
    (f) =>
      (f.gruppe === null || gewaehlt.includes(f.gruppe)) &&
      imMonatsBereich(f.alter, stand.alterMonate) &&
      (f.bedingung === null || bedingungErfuellt(f.bedingung, kontext)),
  );
}

function mitBeschreibung(stand: AblaufStand): boolean {
  return Boolean(stand.mitBeschreibung) && stand.bereich !== "ENTWICKLUNG";
}

/**
 * REQ-401: Sind Beschreibung, Sprachaufnahme und Fotos (Weg 1) jetzt zulässig? Erst nach dem
 * Schnellcheck (seelisch nach dem Krisen-Screening), nicht bei KRISE und nicht vor der
 * Bestätigung eines NOTFALL-Hinweises. Serverseitig für Schritte, Upload und Transkription genutzt.
 */
export function medienErlaubt(stand: AblaufStand): boolean {
  if (!mitBeschreibung(stand)) return false;
  if (stand.krise || (stand.bereich === "PSYCHISCH" && !stand.kriseErledigt) || !stand.schnellcheckErledigt) return false;
  return !(stand.notfallAktiv && !stand.notfallBestaetigt);
}

function bereicheGewaehlt(stand: AblaufStand): boolean {
  return Boolean(stand.bereiche && stand.bereiche.length > 0);
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
  // REQ-401: Beschreibung erst nach Schnellcheck (und Krisen-Screening) – Red Flags haben Vorrang.
  if (mitBeschreibung(stand) && !stand.beschreibungErledigt) return { art: "beschreibung" };
  if (stand.bereich === "KOERPERLICH" && !(stand.region && k.koerperkarte.regionenById.has(stand.region))) return { art: "region" };
  const anwendbar = anwendbareFragen(k, stand);
  if (stand.bereich === "ENTWICKLUNG") {
    // REQ-323: zuerst die Pflichtfrage(n) ohne Bereich, dann die Bereichsauswahl.
    const allgemein = anwendbar.find((f) => f.gruppe === null && !beantwortet(stand, f.id));
    if (allgemein) return { art: "frage", frage: allgemein };
    if (!bereicheGewaehlt(stand)) return { art: "bereiche" };
  }
  const offen = anwendbar.find((f) => !beantwortet(stand, f.id));
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
  if (mitBeschreibung(stand)) schritte.push("beschreibung");
  if (stand.bereich === "KOERPERLICH") schritte.push("region");
  const anwendbar = anwendbareFragen(k, stand);
  if (stand.bereich === "ENTWICKLUNG") {
    schritte.push(...anwendbar.filter((f) => f.gruppe === null).map((f) => f.id), "bereiche");
    schritte.push(...anwendbar.filter((f) => f.gruppe !== null).map((f) => f.id));
    return schritte;
  }
  schritte.push(...anwendbar.map((f) => f.id));
  return schritte;
}

/**
 * REQ-305/REQ-323/REQ-401: Bearbeitbar sind nur Beschreibung, Körperregion, Bereichsauswahl und bereits beantwortete, anwendbare
 * Fragen – nie Krisen-Screening, Schnellcheck oder Notfall-Bestätigung (RISK-030).
 */
export function bearbeitbareSchritte(k: Fragenkataloge, stand: AblaufStand): string[] {
  if (stand.krise || (stand.bereich === "PSYCHISCH" && !stand.kriseErledigt) || !stand.schnellcheckErledigt) return [];
  const ids: string[] = [];
  if (mitBeschreibung(stand) && stand.beschreibungErledigt) ids.push("beschreibung");
  if (stand.bereich === "KOERPERLICH" && stand.region) ids.push("region");
  if (stand.bereich === "ENTWICKLUNG" && bereicheGewaehlt(stand)) ids.push("bereiche");
  // QA E1: Die Pflichtfrage(n) des Entwicklungs-Checks sind wie der Schnellcheck nicht erneut bearbeitbar.
  ids.push(
    ...anwendbareFragen(k, stand)
      .filter((f) => beantwortet(stand, f.id) && !(stand.bereich === "ENTWICKLUNG" && f.gruppe === null))
      .map((f) => f.id),
  );
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
  if (id === "beschreibung") return { art: "beschreibung" };
  if (id === "region") return { art: "region" };
  if (id === "bereiche") return { art: "bereiche" };
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
