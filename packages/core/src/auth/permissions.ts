import type { Rolle } from "../roles";

/**
 * REQ-018: Berechtigungen je Rolle. Wird serverseitig ausgewertet
 * (apps/web/lib/auth/guards.ts) – die Oberfläche darf sich nicht allein darauf verlassen.
 */
export const BERECHTIGUNGEN = {
  "profil:eigenes:verwalten": ["PATIENT"],
  "profil:kinder:verwalten": ["PATIENT"],
  "patienten:verwalten": ["ARZT"],
  "fall:teilen": ["PATIENT"],
  "fall:geteilte:einsehen": ["ARZT"],
  "diagnose:differential": ["ARZT"],
  "diagnose:verdacht": ["PATIENT", "ARZT"],
  "therapieplan:voll": ["ARZT"],
  "medikation:empfehlen": ["ARZT"],
  "bericht:arzt": ["ARZT"],
  "bericht:patient": ["PATIENT"],
} as const satisfies Record<string, readonly Rolle[]>;

export type Berechtigung = keyof typeof BERECHTIGUNGEN;

export function hatBerechtigung(rolle: Rolle, berechtigung: Berechtigung): boolean {
  return (BERECHTIGUNGEN[berechtigung] as readonly Rolle[]).includes(rolle);
}

export interface KontoStatus {
  emailVerifiziertAm: Date | null;
  totpAktiviertAm: Date | null;
}

export interface SitzungStatus {
  /** Zeitpunkt, zu dem der zweite Faktor bestätigt wurde. */
  zweiterFaktorAm: Date | null;
}

export type ZugangsEntscheidung =
  | { erlaubt: true }
  | { erlaubt: false; grund: "EMAIL_NICHT_VERIFIZIERT" | "ZWEI_FA_NICHT_EINGERICHTET" | "ZWEI_FA_AUSSTEHEND" };

/**
 * REQ-013, REQ-015, REQ-016: Zugang zu geschützten Bereichen nur mit verifizierter
 * E-Mail, eingerichteter 2FA und in dieser Sitzung bestätigtem zweitem Faktor.
 */
export function pruefeZugang(konto: KontoStatus, sitzung: SitzungStatus): ZugangsEntscheidung {
  if (!konto.emailVerifiziertAm) return { erlaubt: false, grund: "EMAIL_NICHT_VERIFIZIERT" };
  if (!konto.totpAktiviertAm) return { erlaubt: false, grund: "ZWEI_FA_NICHT_EINGERICHTET" };
  if (!sitzung.zweiterFaktorAm) return { erlaubt: false, grund: "ZWEI_FA_AUSSTEHEND" };
  return { erlaubt: true };
}
