import { z } from "zod";

/** REQ-011: Mindestlänge und Zeichenklassen für Passwörter. */
export const PASSWORT_MIN_LAENGE = 12;

export const passwortSchema = z
  .string()
  .min(PASSWORT_MIN_LAENGE, `Mindestens ${PASSWORT_MIN_LAENGE} Zeichen.`)
  .max(256, "Höchstens 256 Zeichen.")
  .refine((pw) => zeichenklassen(pw) >= 2, {
    message: "Bitte Buchstaben mit Ziffern oder Sonderzeichen kombinieren.",
  });

function zeichenklassen(pw: string): number {
  return [/[a-zäöüß]/, /[A-ZÄÖÜ]/, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(pw)).length;
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Bitte eine gültige E-Mail-Adresse eingeben."));

const pflichtBestaetigung = (meldung: string) =>
  z.literal(true, { error: () => meldung });

const basis = {
  email: emailSchema,
  passwort: passwortSchema,
  /** REQ-011: Nutzungsbedingungen und Einwilligung DSGVO Art. 9. */
  einwilligungDatenschutz: pflichtBestaetigung("Bitte der Datenverarbeitung zustimmen."),
  /** REQ-002: Prototyp nur mit Testdaten. */
  nurTestdaten: pflichtBestaetigung("Bitte bestätigen, dass nur Testdaten eingegeben werden."),
};

/**
 * REQ-014: Approbationsnachweis. Im Prototyp wird die Prüfung simuliert;
 * gespeichert wird der Status `SIMULIERT`.
 */
export const approbationSchema = z.object({
  approbationsbehoerde: z.string().trim().min(2, "Bitte die ausstellende Behörde angeben.").max(200),
  approbationsdatum: z.coerce
    .date({ error: () => "Bitte ein gültiges Datum angeben." })
    .refine((d) => d.getTime() <= Date.now(), "Das Datum darf nicht in der Zukunft liegen."),
});

/** REQ-010: Rolle wird bei der Registrierung gewählt – Patient oder Arzt. */
export const registrierungSchema = z.discriminatedUnion("rolle", [
  z.object({ rolle: z.literal("PATIENT"), ...basis }),
  z.object({ rolle: z.literal("ARZT"), ...basis, ...approbationSchema.shape }),
]);
export type RegistrierungEingabe = z.infer<typeof registrierungSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  passwort: z.string().min(1, "Bitte Passwort eingeben.").max(256),
});

/** REQ-015: TOTP-Code, 6 Ziffern (Leerzeichen werden toleriert). */
export const totpCodeSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Bitte den 6-stelligen Code eingeben."));
