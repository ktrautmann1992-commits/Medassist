import { createHash, randomBytes } from "node:crypto";

/** Zufälliges Token (256 Bit), URL-sicher. Wird nur an den Nutzer gegeben. */
export function neuesToken(): string {
  return randomBytes(32).toString("base64url");
}

/** REQ-013, REQ-017: In der Datenbank wird nur der SHA-256-Hash gespeichert. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const EMAIL_TOKEN_GUELTIG_MS = 24 * 60 * 60 * 1000;
