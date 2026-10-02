import { berechneAlter, berechneKorrigiertesAlter, type Alter, type KorrigiertesAlter } from "./age";
import { berechneBmi } from "./bmi";

/** Anzeigehilfen für Profile (REQ-105, REQ-108, REQ-112). Rein, ohne Datenbank. */

export function initialen(vorname: string, nachname: string): string {
  const erster = (s: string) => Array.from(s.trim())[0] ?? "";
  return (erster(vorname) + erster(nachname)).toUpperCase() || "?";
}

export interface ProfilKern {
  vorname: string;
  nachname: string;
  geburtsdatum: Date;
  istKinderprofil: boolean;
}

/**
 * Kurzname für Profil-Chips wie in `docs/design-vorschau.html`:
 * Erwachsene „Karsten M.“, Kinder „Lena, 4 Jahre“.
 */
export function profilKurzname(p: ProfilKern, stichtag: Date = new Date()): string {
  if (p.istKinderprofil) return `${p.vorname}, ${sicheresAlter(p.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt"}`;
  const n = Array.from(p.nachname.trim())[0];
  return n ? `${p.vorname} ${n}.` : p.vorname;
}

/** Alter oder `null`, falls das Geburtsdatum (fehlerhaft) in der Zukunft liegt. */
export function sicheresAlter(geburtsdatum: Date, stichtag: Date = new Date()): Alter | null {
  try {
    return berechneAlter(geburtsdatum, stichtag);
  } catch {
    return null;
  }
}

/** BMI oder `null`, wenn Größe/Gewicht fehlen oder unplausibel sind (REQ-033). */
export function sichererBmi(groesseCm: number | null, gewichtKg: number | null): number | null {
  if (groesseCm == null || gewichtKg == null) return null;
  try {
    return berechneBmi(groesseCm, gewichtKg);
  } catch {
    return null;
  }
}

export type KorrigiertesAlterAnzeige =
  | { art: "keine" }
  | { art: "vor-termin"; korrektur: string; text: string }
  | { art: "korrigiert"; korrektur: string; alter: string; ueblich: boolean; text: string };

/** Tage als „Wochen+Tage“, z. B. 67 → „9+4 Wochen“ (Schreibweise wie das Gestationsalter). */
export function wochenUndTage(tage: number): string {
  return `${Math.floor(tage / 7)}+${tage % 7} Wochen`;
}

/**
 * REQ-108: Text für das korrigierte Alter bei Frühgeburt. `keine`, wenn keine
 * Frühgeburt vorliegt oder das Gestationsalter fehlt/ungültig ist.
 */
export function korrigiertesAlterAnzeige(
  geburtsdatum: Date,
  sswWochen: number | null,
  sswTage: number | null,
  stichtag: Date = new Date(),
): KorrigiertesAlterAnzeige {
  if (sswWochen == null) return { art: "keine" };
  let k: KorrigiertesAlter | null;
  try {
    k = berechneKorrigiertesAlter(geburtsdatum, { wochen: sswWochen, tage: sswTage ?? 0 }, stichtag);
  } catch {
    return { art: "keine" };
  }
  if (!k) return { art: "keine" };
  const korrektur = wochenUndTage(k.korrekturTage);
  if (!k.alter) {
    return {
      art: "vor-termin",
      korrektur,
      text: `Errechneter Geburtstermin noch nicht erreicht (Korrektur ${korrektur}).`,
    };
  }
  return {
    art: "korrigiert",
    korrektur,
    alter: k.alter.anzeige,
    ueblich: k.korrekturUeblich,
    text: k.korrekturUeblich
      ? `Korrigiertes Alter: ${k.alter.anzeige} (Korrektur ${korrektur})`
      : `Korrigiertes Alter: ${k.alter.anzeige} – ab 24 Monaten wird üblicherweise nicht mehr korrigiert (Grenze ungeprüft).`,
  };
}
