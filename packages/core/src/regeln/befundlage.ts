import { berechneAlter, berechneKorrigiertesAlter } from "../profile/age";
import type { Antwort } from "./schema";

/**
 * REQ-204: Strukturierte Eingabe der Regel-Engine. Das Alter wird immer aus dem
 * Geburtsdatum berechnet (REQ-032) – nie vom Client übernommen.
 */
export interface AlterAngabe {
  tage: number;
  monate: number;
}

export type SchwangerschaftAngabe = "NEIN" | "SCHWANGER" | "STILLEND" | "UNBEKANNT";

export interface Befundlage {
  /** Chronologisches Alter; `null` = unbekannt (altersbeschränkte Regeln greifen dann konservativ). */
  alter: AlterAngabe | null;
  /** Nur bei Frühgeburt (REQ-036); vor dem errechneten Termin 0 Tage/0 Monate. */
  korrigiertesAlter: AlterAngabe | null;
  /** IDs aus dem kontrollierten Vokabular. */
  symptome: readonly string[];
  /** Messwert-ID → Werte (mehrere Werte möglich; eine Bedingung gilt, wenn **ein** Wert sie erfüllt – konservativ). */
  messwerte: Readonly<Record<string, readonly number[]>>;
  /**
   * Antworten auf Fragen (Frage-ID → Antwort). Die Engine wertet im Krisenpfad jeden
   * Wert außer exakt „ja“/„nein“ als „keine_angabe“ (REQ-209, B5).
   */
  antworten: Readonly<Record<string, Antwort | unknown>>;
  schwangerschaft: SchwangerschaftAngabe;
  /** Seelische/psychische Beschwerden angegeben → Krisenpfad ist Pflicht (REQ-208). */
  psychisch: boolean;
}

export interface ProfilFuerRegeln {
  geburtsdatum: Date;
  sswBeiGeburtWochen: number | null;
  sswBeiGeburtTage: number | null;
  schwangerschaft: SchwangerschaftAngabe;
}

export interface Beobachtungen {
  symptome: readonly string[];
  /** Ein Wert oder mehrere Werte je Messwert. */
  messwerte: Readonly<Record<string, number | readonly number[]>>;
  antworten: Readonly<Record<string, Antwort | unknown>>;
  psychisch: boolean;
}

/** Messwerte immer als Liste (mehrere Angaben werden alle geprüft). */
export function messwertListen(m: Beobachtungen["messwerte"]): Record<string, readonly number[]> {
  return Object.fromEntries(Object.entries(m).map(([id, w]) => [id, typeof w === "number" ? [w] : [...w]]));
}

function alterAus(geburtsdatum: Date, stichtag: Date): AlterAngabe | null {
  try {
    const a = berechneAlter(geburtsdatum, stichtag);
    return { tage: a.gesamtTage, monate: a.gesamtMonate };
  } catch {
    // Geburtsdatum in der Zukunft/ungültig → unbekannt (konservativ, REQ-204).
    return null;
  }
}

function korrigiertAus(p: ProfilFuerRegeln, stichtag: Date): AlterAngabe | null {
  if (p.sswBeiGeburtWochen == null) return null;
  try {
    const k = berechneKorrigiertesAlter(
      p.geburtsdatum,
      { wochen: p.sswBeiGeburtWochen, tage: p.sswBeiGeburtTage ?? 0 },
      stichtag,
    );
    if (!k) return null;
    // Vor dem errechneten Termin: korrigiertes Alter „unter 0“ – für Obergrenzen als 0 gewertet.
    return k.alter ? { tage: k.alter.gesamtTage, monate: k.alter.gesamtMonate } : { tage: 0, monate: 0 };
  } catch {
    return null;
  }
}

/** Baut die Befundlage aus Profil-Stammdaten (serverseitig geladen) und den Beobachtungen. */
export function befundlageFuerProfil(profil: ProfilFuerRegeln, beobachtungen: Beobachtungen, stichtag: Date): Befundlage {
  return {
    alter: alterAus(profil.geburtsdatum, stichtag),
    korrigiertesAlter: korrigiertAus(profil, stichtag),
    schwangerschaft: profil.schwangerschaft,
    symptome: [...new Set(beobachtungen.symptome)],
    messwerte: messwertListen(beobachtungen.messwerte),
    antworten: { ...beobachtungen.antworten },
    psychisch: beobachtungen.psychisch,
  };
}
