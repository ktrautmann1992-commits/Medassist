import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * REQ-408: Signierte Datei-URLs des lokalen Speichers (`/api/dateien/<token>`), nur
 * Entwicklung/Test. Das Token ist `base64url(JSON) + "." + base64url(HMAC-SHA-256)` und bindet
 * Methode, Schlüssel, Nutzer, Content-Type, (exakte) Größe und Ablauf. Rein und ohne
 * Next.js-Abhängigkeit – wird auch in den E2E-Tests genutzt (abgelaufene URL erzeugen).
 */

/** Längste zulässige Gültigkeit einer signierten URL (CLAUDE.md §8: kurzlebig). */
export const MAX_GUELTIGKEIT_S = 300;

export const SCHLUESSEL_MUSTER = /^(?:eingang\/[a-f0-9]{32}|fotos\/[a-f0-9]{32}\.jpg)$/;

const tokenSchema = z.strictObject({
  /** Methode */
  m: z.enum(["PUT", "GET"]),
  /** Objektschlüssel */
  k: z.string().regex(SCHLUESSEL_MUSTER),
  /** Nutzer-ID, an die die URL gebunden ist */
  u: z.string().min(1).max(64),
  /** Ablauf (Unix-Sekunden) */
  e: z.number().int().positive(),
  /** Content-Type */
  t: z.string().min(1).max(100),
  /** PUT: exakte Größe in Byte; GET: 0 */
  n: z.number().int().min(0).max(50 * 1024 * 1024),
});
export type DateiToken = z.infer<typeof tokenSchema>;

function mac(daten: string, schluessel: Buffer): Buffer {
  return createHmac("sha256", schluessel).update(daten, "utf8").digest();
}

export function signiereToken(token: DateiToken, schluessel: Buffer): string {
  const daten = Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
  return `${daten}.${mac(daten, schluessel).toString("base64url")}`;
}

export type TokenPruefung = { ok: true; token: DateiToken } | { ok: false; grund: "format" | "signatur" | "abgelaufen" };

/** Prüft Format, Signatur (zeitkonstanter Vergleich) und Ablauf – Reihenfolge: erst Signatur, dann Inhalt. */
export function pruefeToken(roh: string, schluessel: Buffer, jetztS: number): TokenPruefung {
  if (typeof roh !== "string" || roh.length > 2048) return { ok: false, grund: "format" };
  const teile = roh.split(".");
  if (teile.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(teile[0]!) || !/^[A-Za-z0-9_-]+$/.test(teile[1]!)) return { ok: false, grund: "format" };
  const erwartet = mac(teile[0]!, schluessel);
  const gegeben = Buffer.from(teile[1]!, "base64url");
  if (gegeben.length !== erwartet.length || !timingSafeEqual(gegeben, erwartet)) return { ok: false, grund: "signatur" };
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(teile[0]!, "base64url").toString("utf8"));
  } catch {
    return { ok: false, grund: "format" };
  }
  const p = tokenSchema.safeParse(json);
  if (!p.success) return { ok: false, grund: "format" };
  if (p.data.e <= jetztS) return { ok: false, grund: "abgelaufen" };
  // Auch mit gültigem Schlüssel nie länger als MAX_GUELTIGKEIT_S gültig.
  if (p.data.e - jetztS > MAX_GUELTIGKEIT_S) return { ok: false, grund: "format" };
  return { ok: true, token: p.data };
}
