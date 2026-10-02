import { describe, expect, it } from "vitest";
import { istIcd10GmFormat, normalisiereIcd10 } from "./icd";

describe("REQ-102 ICD-10-GM-Formatprüfung (kein Katalog)", () => {
  it.each(["J45.0", "E11.90", "I10", "U07.1", "G63.2*", "E14.40†", "Z92.1!", "C50.9+"])("%s → gültiges Format", (c) => {
    expect(istIcd10GmFormat(c)).toBe(true);
  });

  it.each(["", "J4", "J450", "J45.", "J45.123", "45.0", "JJ45", "J45.0**", "J45.-", "Asthma"])("%s → ungültig", (c) => {
    expect(istIcd10GmFormat(c)).toBe(false);
  });

  it("normalisiert Klein- und Leerzeichen", () => {
    expect(normalisiereIcd10(" j45.0 ")).toBe("J45.0");
    expect(istIcd10GmFormat("j45.0")).toBe(true);
  });
});
