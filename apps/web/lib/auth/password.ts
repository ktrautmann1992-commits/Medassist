import { hash, verify } from "@node-rs/argon2";

/**
 * REQ-012: Argon2id (Standard von @node-rs/argon2) mit OWASP-Mindestparametern
 * (19 MiB Speicher, 2 Iterationen, Parallelität 1).
 */
const OPTIONEN = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPasswort(passwort: string): Promise<string> {
  return hash(passwort, OPTIONEN);
}

export async function pruefePasswort(passwortHash: string, passwort: string): Promise<boolean> {
  try {
    return await verify(passwortHash, passwort);
  } catch {
    return false;
  }
}

/**
 * Für unbekannte E-Mail-Adressen wird gegen diesen Hash geprüft, damit die
 * Antwortzeit keine Auskunft über registrierte Adressen gibt (REQ-019).
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswortHash(): Promise<string> {
  dummyHash ??= hashPasswort("dummy-passwort-fuer-gleiche-laufzeit");
  return dummyHash;
}
