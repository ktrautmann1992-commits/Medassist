import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { entschluessele, verschluessele } from "./verschluesselung";

describe("REQ-015 Verschlüsselung des TOTP-Secrets", () => {
  const key = randomBytes(32);

  it("verschlüsselt und entschlüsselt (Roundtrip)", () => {
    const c = verschluessele("JBSWY3DPEHPK3PXP", key);
    expect(c).not.toContain("JBSWY3DPEHPK3PXP");
    expect(entschluessele(c, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("nutzt zufällige IVs", () => {
    expect(verschluessele("x", key)).not.toBe(verschluessele("x", key));
  });

  it("erkennt Manipulation und falschen Schlüssel", () => {
    const c = verschluessele("geheim", key);
    const teile = c.split(".");
    teile[3] = Buffer.from("anders").toString("base64url");
    expect(() => entschluessele(teile.join("."), key)).toThrow();
    expect(() => entschluessele(c, randomBytes(32))).toThrow();
  });

  it("verlangt 32-Byte-Schlüssel", () => {
    expect(() => verschluessele("x", randomBytes(16))).toThrow(/32 Byte/);
  });
});
