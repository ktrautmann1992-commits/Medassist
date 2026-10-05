import "server-only";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { env } from "../env";
import { LokalerSpeicher } from "./speicher-lokal";
import { S3Speicher } from "./speicher-s3";
import type { ObjektSpeicher } from "./speicher-typen";

/**
 * REQ-408, REQ-412: Objektspeicher aus der Konfiguration (`STORAGE_ANBIETER`). `aus` ⇒ `null`
 * (Foto-Upload und Sprachaufnahme deaktiviert). Die Startprüfung (`env`) verhindert `lokal`
 * in Production/Vercel und unvollständige `s3`-Konfigurationen.
 */
const globalFuerSchluessel = globalThis as typeof globalThis & { __medassistLokalSchluessel?: Buffer };

let cache: { speicher: ObjektSpeicher | null } | undefined;

export function objektSpeicher(): ObjektSpeicher | null {
  if (cache) return cache.speicher;
  const e = env();
  let speicher: ObjektSpeicher | null = null;
  if (e.STORAGE_ANBIETER === "lokal") {
    // Ohne konfigurierten Schlüssel: zufällig je Prozess (gemeinsam für Server Actions und Route).
    const schluessel = e.STORAGE_LOKAL_SCHLUESSEL
      ? Buffer.from(e.STORAGE_LOKAL_SCHLUESSEL, "base64")
      : (globalFuerSchluessel.__medassistLokalSchluessel ??= randomBytes(32));
    speicher = new LokalerSpeicher({ wurzel: e.STORAGE_LOKAL_PFAD ?? path.join(process.cwd(), ".lokaler-speicher"), hmacSchluessel: schluessel });
  } else if (e.STORAGE_ANBIETER === "s3") {
    speicher = new S3Speicher({
      bucket: e.STORAGE_BUCKET!,
      region: e.STORAGE_REGION!,
      endpoint: e.STORAGE_ENDPOINT!,
      accessKeyId: e.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY!,
    });
  }
  cache = { speicher };
  return speicher;
}

/** Nur für die Route `/api/dateien/…` (lokaler Adapter). */
export function lokalerSpeicher(): LokalerSpeicher | null {
  const s = objektSpeicher();
  return s instanceof LokalerSpeicher ? s : null;
}
