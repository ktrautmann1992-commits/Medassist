/**
 * REQ-032: Alter wird immer aus dem Geburtsdatum berechnet (nie gespeichert),
 * auch für Neugeborene. REQ-036: korrigiertes Alter bei Frühgeburt.
 *
 * Gerechnet wird auf Kalendertagen in UTC, damit Zeitzonen und Uhrzeiten
 * das Ergebnis nicht verfälschen.
 */

const TAG_MS = 24 * 60 * 60 * 1000;

export interface Alter {
  jahre: number;
  monate: number; // 0–11, zusätzlich zu `jahre`
  tage: number; // Resttage nach vollen Monaten
  gesamtMonate: number;
  gesamtTage: number;
  /** Lesbare Darstellung, z. B. „5 Tage“, „6 Wochen“, „10 Monate“, „4 Jahre“. */
  anzeige: string;
}

function utcTag(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
}

export function berechneAlter(geburtsdatum: Date, stichtag: Date = new Date()): Alter {
  const g = utcTag(geburtsdatum);
  const s = utcTag(stichtag);
  if (Number.isNaN(g) || Number.isNaN(s)) throw new RangeError("Ungültiges Datum.");
  if (s < g) throw new RangeError("Stichtag liegt vor dem Geburtsdatum.");

  const gd = new Date(g);
  const sd = new Date(s);
  // Volle Monate: Ankertag = Geburtstag + n Monate, am Monatsende geklemmt
  // (31.01. + 1 Monat = 28./29.02.; 29.02. + 12 Monate = 28.02.).
  const anker = (n: number) => {
    const jahr = gd.getUTCFullYear();
    const monat = gd.getUTCMonth() + n;
    const tag = Math.min(gd.getUTCDate(), tageImMonat(jahr, monat)); // Date.UTC normalisiert Monat > 11
    return Date.UTC(jahr, monat, tag);
  };
  let gesamtMonate =
    (sd.getUTCFullYear() - gd.getUTCFullYear()) * 12 + (sd.getUTCMonth() - gd.getUTCMonth());
  if (anker(gesamtMonate) > s) gesamtMonate -= 1;
  const tage = Math.round((s - anker(gesamtMonate)) / TAG_MS);

  const gesamtTage = Math.round((s - g) / TAG_MS);
  const jahre = Math.floor(gesamtMonate / 12);
  const monate = gesamtMonate % 12;

  return { jahre, monate, tage, gesamtMonate, gesamtTage, anzeige: anzeige(gesamtTage, gesamtMonate, jahre) };
}

function anzeige(gesamtTage: number, gesamtMonate: number, jahre: number): string {
  const plural = (n: number, ein: string, mehr: string) => `${n} ${n === 1 ? ein : mehr}`;
  if (gesamtTage < 14) return plural(gesamtTage, "Tag", "Tage");
  if (gesamtMonate < 3) return plural(Math.floor(gesamtTage / 7), "Woche", "Wochen");
  if (gesamtMonate < 24) return plural(gesamtMonate, "Monat", "Monate");
  return plural(jahre, "Jahr", "Jahre");
}

/** Gestationsalter bei Geburt, z. B. 32+4 SSW → { wochen: 32, tage: 4 }. */
export interface Gestationsalter {
  wochen: number;
  tage: number;
}

/** Termingeburt: 40+0 SSW = 280 Tage. Frühgeburt: < 37+0 SSW. */
export const TERMIN_TAGE = 280;
export const FRUEHGEBURT_GRENZE_TAGE = 37 * 7;
/**
 * Bis zu welchem chronologischen Alter die Korrektur üblicherweise angewendet wird.
 * Status: ungeprüft – Quelle (z. B. AWMF-Leitlinie zur Nachsorge Frühgeborener) vor
 * klinischer Nutzung verifizieren (CLAUDE.md §12).
 */
export const KORREKTUR_UEBLICH_BIS_MONATE = 24;

export function gestationsTage(ga: Gestationsalter): number {
  if (!Number.isInteger(ga.wochen) || !Number.isInteger(ga.tage) || ga.tage < 0 || ga.tage > 6) {
    throw new RangeError("Gestationsalter ungültig (Tage 0–6).");
  }
  if (ga.wochen < 20 || ga.wochen > 44) throw new RangeError("Schwangerschaftswoche außerhalb 20–44.");
  return ga.wochen * 7 + ga.tage;
}

export function istFruehgeboren(ga: Gestationsalter): boolean {
  return gestationsTage(ga) < FRUEHGEBURT_GRENZE_TAGE;
}

export interface KorrigiertesAlter {
  korrekturTage: number;
  /** `null`, wenn der errechnete Geburtstermin noch nicht erreicht ist. */
  alter: Alter | null;
  /** Ob die Korrektur im aktuellen chronologischen Alter üblicherweise angewendet wird. */
  korrekturUeblich: boolean;
}

/**
 * REQ-036: Korrigiertes Alter = chronologisches Alter − (40+0 SSW − Gestationsalter).
 * Gibt `null` zurück, wenn keine Frühgeburt vorliegt.
 */
export function berechneKorrigiertesAlter(
  geburtsdatum: Date,
  ga: Gestationsalter,
  stichtag: Date = new Date(),
): KorrigiertesAlter | null {
  if (!istFruehgeboren(ga)) return null;
  const korrekturTage = TERMIN_TAGE - gestationsTage(ga);
  const errechneterTermin = new Date(utcTag(geburtsdatum) + korrekturTage * TAG_MS);
  const chronologisch = berechneAlter(geburtsdatum, stichtag);
  return {
    korrekturTage,
    alter: utcTag(stichtag) < utcTag(errechneterTermin) ? null : berechneAlter(errechneterTermin, stichtag),
    korrekturUeblich: chronologisch.gesamtMonate < KORREKTUR_UEBLICH_BIS_MONATE,
  };
}
