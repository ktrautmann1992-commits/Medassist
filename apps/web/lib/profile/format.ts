import { heuteIso } from "@medassist/core";

/** Anzeigeformate (deutsch). Rein, ohne Datenbank. */

/** "2026-01-31" → "31.01.2026" */
export function datumDe(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return j && m && t ? `${t}.${m}.${j}` : "–";
}

/** "61.5" → "61,5"; null → "–" */
export function zahlDe(wert: string | number | null | undefined): string {
  if (wert == null || wert === "") return "–";
  return String(wert).replace(".", ",");
}

/** Wert für ein Eingabefeld (Dezimalkomma, leer statt null). */
export function eingabeZahl(wert: string | number | null | undefined): string {
  return wert == null ? "" : String(wert).replace(".", ",");
}

/** Date (UTC-Mitternacht) oder ISO-String → "YYYY-MM-DD". */
export function isoDatum(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Stichtag „heute“ (Kalendertag in Europe/Berlin, als UTC-Mitternacht) für Altersberechnungen. */
export function stichtagHeute(jetzt: Date = new Date()): Date {
  return new Date(`${heuteIso(jetzt)}T00:00:00Z`);
}


/** "YYYY-MM-DD" → Date (UTC-Mitternacht). */
export function datumAus(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
