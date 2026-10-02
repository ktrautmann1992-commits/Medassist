import { describe, expect, it } from "vitest";
import { hashToken, neuesToken } from "./tokens";

describe("REQ-013/REQ-017 Tokens", () => {
  it("erzeugt 256-Bit-Tokens, die sich unterscheiden", () => {
    const a = neuesToken();
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(neuesToken()).not.toBe(a);
  });

  it("speichert nur den SHA-256-Hash", () => {
    const t = neuesToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});
