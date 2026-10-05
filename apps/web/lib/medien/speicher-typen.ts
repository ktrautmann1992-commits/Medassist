import { randomBytes } from "node:crypto";

/**
 * REQ-408, REQ-411: Anbieterneutrale Schnittstelle zum privaten Objektspeicher. Uploads und
 * Downloads laufen ausschließlich über kurzlebige signierte URLs; die API erhält nur Referenzen.
 */

/** Gültigkeit signierter Upload-URLs (≤ 5 min). */
export const UPLOAD_GUELTIG_S = 300;
/** Gültigkeit signierter Download-URLs (≤ 5 min; je Seitenaufruf neu erzeugt). */
export const DOWNLOAD_GUELTIG_S = 120;
/** REQ-409: Höchstgröße eines (neu kodierten) Fotos. */
export const MAX_FOTO_BYTES = 4 * 1024 * 1024;
/** REQ-407: Höchstgröße einer Sprachaufnahme. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** Zufälliger, nicht erratbarer Schlüssel ohne Personen- oder Fall-IDs (128 Bit). */
export function neuerEingangsSchluessel(): string {
  return `eingang/${randomBytes(16).toString("hex")}`;
}

export function neuerFotoSchluessel(): string {
  return `fotos/${randomBytes(16).toString("hex")}.jpg`;
}

export interface HochladeZiel {
  url: string;
  methode: "PUT";
  /** Header, die der Client exakt so senden muss (signiert). */
  header: Record<string, string>;
}

export type LeseErgebnis = { art: "ok"; daten: Uint8Array } | { art: "fehlt" } | { art: "zu_gross" };

export interface ObjektSpeicher {
  readonly art: "lokal" | "s3";
  hochladeUrl(p: { schluessel: string; mimeType: string; groesseBytes: number; nutzerId: string; gueltigS: number }): Promise<HochladeZiel>;
  ladeUrl(p: { schluessel: string; mimeType: string; nutzerId: string; gueltigS: number }): Promise<string>;
  lese(schluessel: string, maxBytes: number): Promise<LeseErgebnis>;
  schreibe(schluessel: string, daten: Uint8Array, mimeType: string): Promise<void>;
  /** Löscht ein Objekt; ein fehlendes Objekt ist kein Fehler. */
  loesche(schluessel: string): Promise<void>;
}
