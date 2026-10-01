import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM für Geheimnisse, die wieder lesbar sein müssen (TOTP-Secret, REQ-015).
 * Format: v1.<iv>.<tag>.<chiffre> (Base64url).
 */
export function verschluessele(klartext: string, schluessel: Buffer): string {
  pruefeSchluessel(schluessel);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", schluessel, iv);
  const chiffre = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), chiffre].map((t) => (typeof t === "string" ? t : t.toString("base64url"))).join(".");
}

export function entschluessele(wert: string, schluessel: Buffer): string {
  pruefeSchluessel(schluessel);
  const [version, iv, tag, chiffre] = wert.split(".");
  if (version !== "v1" || !iv || !tag || !chiffre) throw new Error("Unbekanntes Verschlüsselungsformat.");
  const decipher = createDecipheriv("aes-256-gcm", schluessel, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(chiffre, "base64url")), decipher.final()]).toString("utf8");
}

function pruefeSchluessel(schluessel: Buffer) {
  if (schluessel.length !== 32) throw new Error("Schlüssel muss 32 Byte lang sein.");
}
