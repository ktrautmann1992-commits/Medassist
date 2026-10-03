import type { Vergleich } from "../regeln/schema";
import type { AntwortWert } from "./antwort";
import type { FrageBedingung } from "./schema";

/**
 * REQ-302: Auswertung der deklarativen Fragebedingungen als reine Funktion. Nur die hier
 * ausprogrammierten Operatoren sind möglich – kein Code aus Datendateien (RISK-022).
 */
export interface FrageKontext {
  region: string | null;
  /** Organsysteme der gewählten Region. */
  organsysteme: readonly string[];
  kinderprofil: boolean;
  /** Serverseitig aus dem Geburtsdatum berechnet; `null` = unbekannt (Frage wird gestellt). */
  alterMonate: number | null;
  /** Letzte vollständige Antwort je Frage. */
  antworten: Readonly<Record<string, AntwortWert>>;
}

function erfuelltVergleich(ist: number, v: Vergleich): boolean {
  if (v["<"] !== undefined && !(ist < v["<"])) return false;
  if (v["<="] !== undefined && !(ist <= v["<="])) return false;
  if (v[">"] !== undefined && !(ist > v[">"])) return false;
  if (v[">="] !== undefined && !(ist >= v[">="])) return false;
  return true;
}

export function bedingungErfuellt(b: FrageBedingung, k: FrageKontext): boolean {
  if ("alle" in b) return b.alle.every((x) => bedingungErfuellt(x, k));
  if ("eines" in b) return b.eines.some((x) => bedingungErfuellt(x, k));
  if ("nicht" in b) return !bedingungErfuellt(b.nicht, k);
  if ("ist" in b) {
    const a = Object.hasOwn(k.antworten, b.antwort) ? k.antworten[b.antwort] : undefined;
    return a?.typ === "einfach" && a.option === b.ist;
  }
  if ("enthaelt" in b) {
    const a = Object.hasOwn(k.antworten, b.antwort) ? k.antworten[b.antwort] : undefined;
    return a?.typ === "mehrfach" && a.optionen.includes(b.enthaelt);
  }
  if ("beantwortet" in b) {
    const a = Object.hasOwn(k.antworten, b.beantwortet) ? k.antworten[b.beantwortet] : undefined;
    return a !== undefined && a.typ !== "keine_angabe";
  }
  if ("region" in b) return k.region !== null && b.region.includes(k.region);
  if ("organsystem" in b) return k.organsysteme.includes(b.organsystem);
  if ("kinderprofil" in b) return k.kinderprofil === b.kinderprofil;
  // Unbekanntes Alter: Frage wird gestellt (lieber eine Frage zu viel).
  if ("alter_monate" in b) return k.alterMonate === null || erfuelltVergleich(k.alterMonate, b.alter_monate);
  throw new Error("Unbekannter Bedingungsoperator.");
}

export interface BedingungReferenzen {
  /** Paare (Frage-ID, Option-ID oder null) mit Art des Verweises. */
  antworten: { frage: string; option: string | null; art: "ist" | "enthaelt" | "beantwortet" }[];
  regionen: string[];
  organsysteme: string[];
  tiefe: number;
}

/** Sammelt Verweise und Verschachtelungstiefe (für die Prüfung beim Laden). */
export function bedingungReferenzen(
  b: FrageBedingung,
  tiefe = 1,
  ziel: BedingungReferenzen = { antworten: [], regionen: [], organsysteme: [], tiefe: 0 },
): BedingungReferenzen {
  ziel.tiefe = Math.max(ziel.tiefe, tiefe);
  if (tiefe > 20) return ziel;
  if ("alle" in b) b.alle.forEach((x) => bedingungReferenzen(x, tiefe + 1, ziel));
  else if ("eines" in b) b.eines.forEach((x) => bedingungReferenzen(x, tiefe + 1, ziel));
  else if ("nicht" in b) bedingungReferenzen(b.nicht, tiefe + 1, ziel);
  else if ("ist" in b) ziel.antworten.push({ frage: b.antwort, option: b.ist, art: "ist" });
  else if ("enthaelt" in b) ziel.antworten.push({ frage: b.antwort, option: b.enthaelt, art: "enthaelt" });
  else if ("beantwortet" in b) ziel.antworten.push({ frage: b.beantwortet, option: null, art: "beantwortet" });
  else if ("region" in b) ziel.regionen.push(...b.region);
  else if ("organsystem" in b) ziel.organsysteme.push(b.organsystem);
  return ziel;
}
