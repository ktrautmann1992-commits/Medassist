import type { MonatsBereich } from "../eingrenzung/schema";
import { berechneAlter, berechneKorrigiertesAlter } from "../profile/age";
import { MAX_ALTER_MONATE } from "./schema";
import type { EntwicklungsBereich, EntwicklungsKatalog } from "./typen";

/**
 * REQ-322: Zulässigkeit und Entwicklungsalter des Entwicklungs-Checks – rein, serverseitig
 * aus dem Profil berechnet (nie vom Client übernommen).
 */

/** `minMonate` inklusiv, `unterMonate` exklusiv; `null` (Bereich oder Alter) = gilt. */
export function imMonatsBereich(b: MonatsBereich | null, monate: number | null): boolean {
  if (!b || monate === null) return true;
  return monate >= b.minMonate && monate < b.unterMonate;
}

export interface EntwicklungsAlter {
  /** Maßgebliches Alter in vollen Kalendermonaten (bei Frühgeburt korrigiert). */
  monate: number;
  korrigiert: boolean;
  chronologischMonate: number;
  /** z. B. „2 Jahre“ oder „10 Monate (korrigiert)“. */
  anzeige: string;
}

export interface ProfilFuerEntwicklung {
  istKinderprofil: boolean;
  geburtsdatum: Date;
  sswBeiGeburtWochen: number | null;
  sswBeiGeburtTage: number | null;
}

/**
 * Entwicklungsalter: chronologisch; bei Frühgeburt (< 37+0 SSW) das korrigierte Alter, solange
 * die Korrektur üblich ist (chronologisch < 24 Monate, `KORREKTUR_UEBLICH_BIS_MONATE`, ungeprüft).
 * Vor dem errechneten Termin: 0 Monate. `null` = Alter unbekannt (ungültiges Datum).
 */
export function entwicklungsAlter(p: Omit<ProfilFuerEntwicklung, "istKinderprofil">, stichtag: Date): EntwicklungsAlter | null {
  let chrono;
  try {
    chrono = berechneAlter(p.geburtsdatum, stichtag);
  } catch {
    return null;
  }
  const basis = { monate: chrono.gesamtMonate, korrigiert: false, chronologischMonate: chrono.gesamtMonate, anzeige: chrono.anzeige };
  if (p.sswBeiGeburtWochen === null) return basis;
  let korr;
  try {
    korr = berechneKorrigiertesAlter(p.geburtsdatum, { wochen: p.sswBeiGeburtWochen, tage: p.sswBeiGeburtTage ?? 0 }, stichtag);
  } catch {
    return basis;
  }
  if (!korr || !korr.korrekturUeblich) return basis;
  if (!korr.alter) return { ...basis, monate: 0, korrigiert: true, anzeige: "vor dem errechneten Geburtstermin (korrigiert)" };
  return { ...basis, monate: korr.alter.gesamtMonate, korrigiert: true, anzeige: `${korr.alter.anzeige} (korrigiert)` };
}

export type Zulaessigkeit =
  | { ok: true; alter: EntwicklungsAlter }
  | { ok: false; grund: "kein_kinderprofil" | "volljaehrig" | "alter_unbekannt" | "ausserhalb_katalog"; alter: EntwicklungsAlter | null };

/**
 * REQ-322: Nur Kinderprofile (`istKinderprofil`) mit chronologischem Alter unter 18 Jahren;
 * zusätzlich muss das Entwicklungsalter im Altersbereich des Demo-Katalogs liegen.
 */
export function pruefeEntwicklungsZulaessigkeit(p: ProfilFuerEntwicklung, katalog: EntwicklungsKatalog, stichtag: Date): Zulaessigkeit {
  if (!p.istKinderprofil) return { ok: false, grund: "kein_kinderprofil", alter: null };
  const alter = entwicklungsAlter(p, stichtag);
  if (!alter) return { ok: false, grund: "alter_unbekannt", alter: null };
  if (alter.chronologischMonate >= MAX_ALTER_MONATE) return { ok: false, grund: "volljaehrig", alter };
  if (!imMonatsBereich(katalog.alter, alter.monate) || verfuegbareBereiche(katalog, alter.monate).length === 0) {
    return { ok: false, grund: "ausserhalb_katalog", alter };
  }
  return { ok: true, alter };
}

/** Bereiche mit mindestens einer Beobachtungsfrage (nicht nur der Sorge-Frage) für dieses Alter. */
export function verfuegbareBereiche(katalog: EntwicklungsKatalog, monate: number | null): EntwicklungsBereich[] {
  return katalog.bereiche.filter(
    (b) =>
      imMonatsBereich(b.alter, monate) &&
      b.fragen.some((fid) => {
        const m = katalog.meta.get(fid);
        return m !== undefined && m.rolle !== "sorge" && imMonatsBereich(m.alter, monate);
      }),
  );
}

/** Text des Altersbereichs, z. B. „12 Monaten bis unter 18 Jahren“. */
export function altersbereichText(a: MonatsBereich): string {
  const t = (m: number) => (m % 12 === 0 && m >= 24 ? `${m / 12} Jahren` : `${m} Monaten`);
  return `${t(a.minMonate)} bis unter ${t(a.unterMonate)}`;
}

/**
 * REQ-323: Bereichsauswahl serverseitig prüfen – nur angebotene Bereiche, mindestens einer;
 * „Alle Bereiche prüfen“ übernimmt alle angebotenen. Reihenfolge wie im Katalog.
 */
export function pruefeBereiche(
  katalog: EntwicklungsKatalog,
  monate: number | null,
  werte: readonly unknown[],
  alle: boolean,
): { ok: true; bereiche: string[] } | { ok: false; fehler: string } {
  const angeboten = verfuegbareBereiche(katalog, monate);
  if (alle) return angeboten.length ? { ok: true, bereiche: angeboten.map((b) => b.id) } : { ok: false, fehler: "Für dieses Alter gibt es keine Bereiche." };
  const texte: string[] = [];
  for (const w of werte) {
    if (w === null || w === undefined || w === "") continue;
    if (typeof w !== "string") return { ok: false, fehler: "Unbekannter Bereich – bitte erneut auswählen." };
    if (!texte.includes(w)) texte.push(w);
  }
  if (texte.length === 0) return { ok: false, fehler: "Bitte mindestens einen Bereich wählen oder „Alle Bereiche prüfen“." };
  if (texte.some((t) => !angeboten.some((b) => b.id === t))) return { ok: false, fehler: "Unbekannter Bereich – bitte erneut auswählen." };
  return { ok: true, bereiche: angeboten.filter((b) => texte.includes(b.id)).map((b) => b.id) };
}
