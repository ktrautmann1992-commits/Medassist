import { z } from "zod";

/**
 * Serverseitige Umgebungsvariablen (REQ-005). Werte kommen ausschließlich aus
 * Vercel Environment Variables bzw. lokaler `.env` – nie aus dem Repository.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** 32 Byte, Base64 – verschlüsselt TOTP-Secrets (AES-256-GCM). */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY muss 32 Byte (Base64) lang sein."),
  APP_URL: z.url().default("http://localhost:3000"),
  /**
   * REQ-015, REQ-021: Schalter für die Zwei-Faktor-Anmeldung. Standard in der
   * Testphase: aus (auch bei leerem Wert wie in `.env.example`). Andere Werte als
   * "true"/"false" lassen den Serverstart scheitern (Prüfung in `instrumentation.ts`)
   * – ein Tippfehler darf nicht still „aus“ bedeuten.
   * Vor Verarbeitung echter Daten muss er auf "true" stehen.
   */
  ZWEI_FA_AKTIV: z
    .preprocess((v) => (v === "" ? undefined : v), z.enum(["true", "false"]).default("false"))
    .transform((v) => v === "true"),
});

export type Env = z.output<typeof envSchema>;

let cache: Env | undefined;

export function env(): Env {
  if (!cache) {
    const ergebnis = envSchema.safeParse(process.env);
    if (!ergebnis.success) {
      // Nur Variablennamen und Meldungen ausgeben – nie die Werte (könnten Secrets sein).
      const details = ergebnis.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Ungültige Umgebungsvariablen: ${details}`);
    }
    cache = ergebnis.data;
  }
  return cache;
}

/** REQ-015, REQ-021: Ist die Zwei-Faktor-Anmeldung aktuell Pflicht? */
export function zweiFaAktiv(): boolean {
  return env().ZWEI_FA_AKTIV;
}
