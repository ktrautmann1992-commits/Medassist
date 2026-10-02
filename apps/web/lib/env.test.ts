import { describe, expect, it } from "vitest";
import { envSchema, ermittleBasisUrl } from "./env";

const basis = {
  DATABASE_URL: "postgresql://test@localhost/test",
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
};

describe("REQ-015/REQ-021 Schalter ZWEI_FA_AKTIV", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["true", true],
  ])("Wert %j → 2FA aktiv: %s", (wert, erwartet) => {
    expect(envSchema.parse({ ...basis, ZWEI_FA_AKTIV: wert }).ZWEI_FA_AKTIV).toBe(erwartet);
  });

  it.each(["ja", "1", "TRUE", "an"])("lehnt ungültigen Wert %j ab statt still „aus“ anzunehmen", (wert) => {
    expect(envSchema.safeParse({ ...basis, ZWEI_FA_AKTIV: wert }).success).toBe(false);
  });
});

describe("REQ-005/REQ-021 TOTP_ENCRYPTION_KEY nur bei aktiver 2FA Pflicht", () => {
  const ohneSchluessel = { DATABASE_URL: basis.DATABASE_URL };

  it.each([undefined, "", "false"])("2FA aus (%j) ohne Schlüssel ist gültig", (schalter) => {
    const ergebnis = envSchema.safeParse({ ...ohneSchluessel, ZWEI_FA_AKTIV: schalter });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.data?.TOTP_ENCRYPTION_KEY).toBeUndefined();
  });

  it("2FA aus mit leerem Schlüssel (wie aus `.env.example`) ist gültig", () => {
    expect(envSchema.safeParse({ ...ohneSchluessel, TOTP_ENCRYPTION_KEY: "" }).success).toBe(true);
  });

  it.each([undefined, ""])("2FA an ohne Schlüssel (%j) wird abgelehnt", (schluessel) => {
    const ergebnis = envSchema.safeParse({ ...ohneSchluessel, TOTP_ENCRYPTION_KEY: schluessel, ZWEI_FA_AKTIV: "true" });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues.map((i) => i.path.join("."))).toContain("TOTP_ENCRYPTION_KEY");
  });

  it("2FA an mit gültigem Schlüssel ist gültig", () => {
    expect(envSchema.safeParse({ ...basis, ZWEI_FA_AKTIV: "true" }).success).toBe(true);
  });

  it.each([
    ["zu kurz", Buffer.alloc(16).toString("base64")],
    ["zu lang", Buffer.alloc(64).toString("base64")],
    ["kein Base64-Schlüssel", "geheim"],
  ])("ungültiger Schlüssel (%s) wird in beiden Modi abgelehnt", (_fall, schluessel) => {
    for (const schalter of ["false", "true"]) {
      const ergebnis = envSchema.safeParse({ ...ohneSchluessel, TOTP_ENCRYPTION_KEY: schluessel, ZWEI_FA_AKTIV: schalter });
      expect(ergebnis.success).toBe(false);
      expect(ergebnis.error?.issues.map((i) => i.path.join("."))).toContain("TOTP_ENCRYPTION_KEY");
    }
  });
});

describe("REQ-013 Basis-URL für Bestätigungslinks (APP_URL nur in Production nötig)", () => {
  it("APP_URL ist optional, leerer Wert zählt als nicht gesetzt", () => {
    expect(envSchema.parse({ ...basis }).APP_URL).toBeUndefined();
    expect(envSchema.parse({ ...basis, APP_URL: "" }).APP_URL).toBeUndefined();
  });

  it("ungültige APP_URL wird abgelehnt", () => {
    expect(envSchema.safeParse({ ...basis, APP_URL: "keine-url" }).success).toBe(false);
  });

  it("APP_URL hat Vorrang vor den Vercel-Variablen", () => {
    expect(
      ermittleBasisUrl("https://medassist.example/", { VERCEL_BRANCH_URL: "branch.vercel.app", VERCEL_URL: "x.vercel.app" }),
    ).toBe("https://medassist.example");
  });

  it("Preview ohne APP_URL: stabile Branch-URL vor Deployment-URL", () => {
    expect(ermittleBasisUrl(undefined, { VERCEL_BRANCH_URL: "medassist-git-feature.vercel.app", VERCEL_URL: "medassist-abc123.vercel.app" })).toBe(
      "https://medassist-git-feature.vercel.app",
    );
  });

  it("ohne Branch-URL wird die Deployment-URL verwendet", () => {
    expect(ermittleBasisUrl(undefined, { VERCEL_BRANCH_URL: "", VERCEL_URL: "medassist-abc123.vercel.app" })).toBe(
      "https://medassist-abc123.vercel.app",
    );
  });

  it("lokal ohne Variablen: http://localhost:3000", () => {
    expect(ermittleBasisUrl(undefined, {})).toBe("http://localhost:3000");
  });

  it("nutzt in Production die Produktions-Domain statt der Branch-URL", () => {
    const vercel = {
      VERCEL_PROJECT_PRODUCTION_URL: "medassist.vercel.app",
      VERCEL_BRANCH_URL: "medassist-git-main.vercel.app",
      VERCEL_URL: "medassist-abc.vercel.app",
    };
    expect(ermittleBasisUrl(undefined, { ...vercel, VERCEL_ENV: "production" })).toBe("https://medassist.vercel.app");
    expect(ermittleBasisUrl(undefined, { ...vercel, VERCEL_ENV: "preview" })).toBe("https://medassist-git-main.vercel.app");
  });

  it("APP_URL akzeptiert nur http(s)", () => {
    expect(envSchema.safeParse({ ...basis, APP_URL: "javascript:alert(1)" }).success).toBe(false);
    expect(envSchema.safeParse({ ...basis, APP_URL: "ftp://x.example" }).success).toBe(false);
    expect(envSchema.safeParse({ ...basis, APP_URL: "https://x.example" }).success).toBe(true);
    expect(envSchema.safeParse({ ...basis, APP_URL: "http://localhost:3000" }).success).toBe(true);
  });
});
