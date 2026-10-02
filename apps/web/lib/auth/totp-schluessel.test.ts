import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** REQ-015, REQ-021: Verhalten von `totp-schluessel.ts` mit und ohne TOTP_ENCRYPTION_KEY. */
describe("TOTP-Schlüssel", () => {
  const vorher = { ...process.env };

  beforeEach(() => {
    vi.resetModules(); // `env()` cached – je Test frisch laden
    process.env.DATABASE_URL = "postgresql://test@localhost/test";
    process.env.ZWEI_FA_AKTIV = "false";
  });

  afterEach(() => {
    process.env = { ...vorher };
  });

  it("wirft bei fehlendem Schlüssel einen verständlichen Fehler (ohne Werte)", async () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    const { verschluesseleTotpSecret } = await import("./totp-schluessel");
    expect(() => verschluesseleTotpSecret("JBSWY3DPEHPK3PXP")).toThrow(/TOTP_ENCRYPTION_KEY fehlt/);
  });

  it("ver- und entschlüsselt mit gesetztem Schlüssel", async () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const { entschluesseleTotpSecret, verschluesseleTotpSecret } = await import("./totp-schluessel");
    expect(entschluesseleTotpSecret(verschluesseleTotpSecret("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");
  });
});
