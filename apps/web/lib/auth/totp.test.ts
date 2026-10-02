import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { TOTP_PERIODE_S, neuesTotpSecret, pruefeTotp, totpUri } from "./totp";

describe("REQ-015 TOTP", () => {
  const secret = neuesTotpSecret();
  const jetzt = new Date("2026-10-01T12:00:10Z");
  const epoch = Math.floor(jetzt.getTime() / 1000);
  const schritt = Math.floor(epoch / TOTP_PERIODE_S);

  it("akzeptiert den aktuellen Code und liefert den Zeitschritt", async () => {
    const code = await generate({ secret, epoch });
    expect(await pruefeTotp(secret, code, null, jetzt)).toEqual({ gueltig: true, zeitschritt: schritt });
  });

  it("toleriert einen Zeitschritt Uhrabweichung, aber nicht mehr", async () => {
    const vorher = await generate({ secret, epoch: epoch - TOTP_PERIODE_S });
    expect((await pruefeTotp(secret, vorher, null, jetzt)).gueltig).toBe(true);
    const viel = await generate({ secret, epoch: epoch - 3 * TOTP_PERIODE_S });
    expect((await pruefeTotp(secret, viel, null, jetzt)).gueltig).toBe(false);
  });

  it("verhindert Wiederverwendung (Replay)", async () => {
    const code = await generate({ secret, epoch });
    expect((await pruefeTotp(secret, code, schritt, jetzt)).gueltig).toBe(false);
  });

  it("lehnt falsche Codes ab", async () => {
    const code = await generate({ secret, epoch });
    const falsch = code === "000000" ? "111111" : "000000";
    expect((await pruefeTotp(secret, falsch, null, jetzt)).gueltig).toBe(false);
    expect((await pruefeTotp(secret, "abc", null, jetzt)).gueltig).toBe(false);
  });

  it("erzeugt otpauth-URI für Authenticator-Apps", () => {
    const uri = totpUri(secret, "test@example.org");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
  });
});
