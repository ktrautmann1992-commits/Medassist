import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

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
