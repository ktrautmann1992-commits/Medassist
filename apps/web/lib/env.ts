import { z } from "zod";

/** Leere Werte (wie aus `.env.example`) gelten als nicht gesetzt. */
function leerAlsFehlend<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema);
}

/**
 * Serverseitige Umgebungsvariablen (REQ-005). Werte kommen ausschließlich aus
 * Vercel Environment Variables bzw. lokaler `.env` – nie aus dem Repository.
 */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    /**
     * 32 Byte, Base64 – verschlüsselt TOTP-Secrets (AES-256-GCM). Nur Pflicht bei
     * `ZWEI_FA_AKTIV=true` (Prüfung unten); ist er gesetzt, muss er auch bei
     * abgeschalteter 2FA gültig sein – ein fehlerhafter Wert fällt so schon in der
     * Testphase auf und nicht erst beim Einschalten der 2FA.
     */
    TOTP_ENCRYPTION_KEY: z
      .preprocess(
        (v) => (v === "" ? undefined : v),
        z
          .string()
          .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY muss 32 Byte (Base64) lang sein.")
          .optional(),
      ),
    /**
     * Öffentliche Basis-URL (Bestätigungslinks). Optional – nur in Production
     * nötig; sonst ermittelt `basisUrl()` sie aus den Vercel-Systemvariablen.
     */
    APP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url({ protocol: /^https?$/, error: "APP_URL muss eine http(s)-URL sein." }).optional()),
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

    // --- Meilenstein 5: Objektspeicher und Speech-to-Text (REQ-406, REQ-408, REQ-412) ---
    /** `aus` (Standard): Foto-Upload und Sprachaufnahme deaktiviert. `lokal` nur Entwicklung/Test. */
    STORAGE_ANBIETER: leerAlsFehlend(z.enum(["aus", "lokal", "s3"]).default("aus")),
    /** `aus` (Standard) oder `test` (fester Test-Transkript-Text, nur Entwicklung/E2E). */
    STT_ANBIETER: leerAlsFehlend(z.enum(["aus", "test"]).default("aus")),
    /**
     * Ausdrückliche Freigabe der Test-Adapter (`lokal`, `test`) unter `NODE_ENV=production` –
     * nur für E2E-Tests mit `next start`. Auf Vercel nie zulässig.
     */
    TESTADAPTER_ERLAUBT: leerAlsFehlend(z.enum(["true", "false"]).default("false")).transform((v) => v === "true"),
    /** HMAC-Schlüssel des lokalen Speichers (≥ 32 Byte, Base64). Fehlt er, zufällig je Prozess. */
    STORAGE_LOKAL_SCHLUESSEL: leerAlsFehlend(
      z
        .string()
        .refine((v) => Buffer.from(v, "base64").length >= 32, "STORAGE_LOKAL_SCHLUESSEL muss mindestens 32 Byte (Base64) lang sein.")
        .optional(),
    ),
    /** Ordner des lokalen Speichers (Standard: `.lokaler-speicher` im Arbeitsverzeichnis, gitignoriert). */
    STORAGE_LOKAL_PFAD: leerAlsFehlend(z.string().optional()),
    STORAGE_BUCKET: leerAlsFehlend(z.string().optional()),
    STORAGE_REGION: leerAlsFehlend(z.string().optional()),
    STORAGE_ENDPOINT: leerAlsFehlend(z.url({ protocol: /^https$/, error: "STORAGE_ENDPOINT muss eine https-URL sein." }).optional()),
    STORAGE_ACCESS_KEY_ID: leerAlsFehlend(z.string().optional()),
    STORAGE_SECRET_ACCESS_KEY: leerAlsFehlend(z.string().optional()),
    /** Systemvariablen – nur für die Prüfung der Test-Adapter. */
    NODE_ENV: z.string().optional(),
    VERCEL: leerAlsFehlend(z.string().optional()),
  })
  .superRefine((werte, ctx) => {
    // REQ-412: `s3` nur mit vollständiger Konfiguration.
    if (werte.STORAGE_ANBIETER === "s3") {
      for (const name of ["STORAGE_BUCKET", "STORAGE_REGION", "STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"] as const) {
        if (!werte[name]) ctx.addIssue({ code: "custom", path: [name], message: `${name} ist Pflicht, wenn STORAGE_ANBIETER=s3 gesetzt ist.` });
      }
    }
    // REQ-412/RISK-049: Test-Adapter nie auf Vercel, in Production nur mit ausdrücklicher E2E-Freigabe.
    const testAdapter = [
      werte.STORAGE_ANBIETER === "lokal" ? "STORAGE_ANBIETER" : null,
      werte.STT_ANBIETER === "test" ? "STT_ANBIETER" : null,
    ].filter((x): x is "STORAGE_ANBIETER" | "STT_ANBIETER" => x !== null);
    for (const name of testAdapter) {
      if (werte.VERCEL) {
        ctx.addIssue({ code: "custom", path: [name], message: `${name}: Test-Adapter (lokal/test) sind auf Vercel nicht zulässig.` });
      } else if (werte.NODE_ENV === "production" && !werte.TESTADAPTER_ERLAUBT) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name}: Test-Adapter (lokal/test) sind in Production nicht zulässig (nur mit TESTADAPTER_ERLAUBT=true für E2E-Tests).`,
        });
      }
    }
    if (werte.VERCEL && werte.TESTADAPTER_ERLAUBT) {
      ctx.addIssue({ code: "custom", path: ["TESTADAPTER_ERLAUBT"], message: "TESTADAPTER_ERLAUBT ist auf Vercel nicht zulässig." });
    }
    // REQ-005, REQ-021: Ohne Schlüssel können keine TOTP-Secrets gespeichert werden.
    if (werte.ZWEI_FA_AKTIV && werte.TOTP_ENCRYPTION_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["TOTP_ENCRYPTION_KEY"],
        message: "TOTP_ENCRYPTION_KEY ist Pflicht, wenn ZWEI_FA_AKTIV=true gesetzt ist.",
      });
    }
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

/** Vercel-Systemvariablen, aus denen die Basis-URL abgeleitet wird (ohne Protokoll). */
type VercelUmgebung = Partial<
  Record<"VERCEL_ENV" | "VERCEL_PROJECT_PRODUCTION_URL" | "VERCEL_BRANCH_URL" | "VERCEL_URL", string>
>;

/**
 * Öffentliche Basis-URL ohne abschließenden Schrägstrich, z. B. für Bestätigungslinks.
 * Reihenfolge: `APP_URL` → in Production `VERCEL_PROJECT_PRODUCTION_URL` (Produktions-
 * Domain statt geschützter Branch-URL) → `VERCEL_BRANCH_URL` (Preview, stabile
 * Branch-URL) → `VERCEL_URL` (URL des einzelnen Deployments) → lokal
 * `http://localhost:3000`. Preview-Deployments sind per Vercel Deployment Protection
 * geschützt; der Link funktioniert für angemeldete Vercel-Nutzer.
 */
export function ermittleBasisUrl(appUrl: string | undefined, vercel: VercelUmgebung): string {
  const produktion = vercel.VERCEL_ENV === "production" ? vercel.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined;
  const vercelHost = produktion || vercel.VERCEL_BRANCH_URL?.trim() || vercel.VERCEL_URL?.trim();
  const url = appUrl ?? (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}

/** REQ-013: Basis-URL der laufenden Instanz (siehe `ermittleBasisUrl`). */
export function basisUrl(): string {
  const { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_BRANCH_URL, VERCEL_URL } = process.env;
  return ermittleBasisUrl(env().APP_URL, { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_BRANCH_URL, VERCEL_URL });
}
