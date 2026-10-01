import { z } from "zod";

/**
 * Serverseitige Umgebungsvariablen (REQ-005). Werte kommen ausschließlich aus
 * Vercel Environment Variables bzw. lokaler `.env` – nie aus dem Repository.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** 32 Byte, Base64 – verschlüsselt TOTP-Secrets (AES-256-GCM). */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOTP_ENCRYPTION_KEY muss 32 Byte (Base64) lang sein."),
  APP_URL: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cache: Env | undefined;

export function env(): Env {
  cache ??= schema.parse(process.env);
  return cache;
}
