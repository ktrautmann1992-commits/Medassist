import { describe, expect, it } from "vitest";
import { standardRegelwerk } from "../regeln/standard";
import { bearbeitbareSchritte, erlaubterSchritt, medienErlaubt, naechsterSchritt, pfad, schrittId, type AblaufStand } from "./ablauf";
import { gespeicherteEingabeSchema } from "./antwort";
import { ablaufStandAus, sammleEingaben, type GespeicherteEingabeRoh } from "./eingaben";
import { standardFragenkataloge } from "./standard";
import { erstelleZusammenfassung } from "./zusammenfassung";

const k = standardFragenkataloge();
const w = standardRegelwerk();

function stand(teil: Partial<AblaufStand> = {}): AblaufStand {
  return {
    bereich: "KOERPERLICH",
    kriseErledigt: false,
    krise: false,
    schnellcheckErledigt: false,
    notfallAktiv: false,
    notfallBestaetigt: false,
    region: null,
    antworten: {},
    kinderprofil: false,
    alterMonate: 400,
    mitBeschreibung: true,
    beschreibungErledigt: false,
    ...teil,
  };
}
const id = (s: AblaufStand) => schrittId(naechsterSchritt(k, s));
const e = (schritt: string, wert: unknown, teilweise = false): GespeicherteEingabeRoh => ({
  frageId: schritt,
  strukturiert: { v: 1, katalogVersion: "0.2.0", schritt, teilweise, wert },
});
const text = (t: string, quelle: "text" | "sprache" = "text", korrigiert = false) => ({ typ: "beschreibung", quelle, text: t, korrigiert });

describe("REQ-401 Ablauf Weg 1 – Red Flags und Krise vor der Beschreibung", () => {
  it("körperlich: Schnellcheck → Beschreibung → Region → Fragen", () => {
    expect(id(stand())).toBe("schnellcheck");
    expect(id(stand({ schnellcheckErledigt: true }))).toBe("beschreibung");
    expect(id(stand({ schnellcheckErledigt: true, beschreibungErledigt: true }))).toBe("region");
    expect(id(stand({ schnellcheckErledigt: true, beschreibungErledigt: true, region: "brust" }))).toBe("k_art");
    expect(pfad(k, stand({ schnellcheckErledigt: true })).slice(0, 3)).toEqual(["schnellcheck", "beschreibung", "region"]);
  });

  it("seelisch: Krisen-Screening → Schnellcheck → Beschreibung → Fragen (ohne Region)", () => {
    const s = (t: Partial<AblaufStand>) => stand({ bereich: "PSYCHISCH", ...t });
    expect(id(s({}))).toBe("krise");
    expect(id(s({ kriseErledigt: true }))).toBe("schnellcheck");
    expect(id(s({ kriseErledigt: true, schnellcheckErledigt: true }))).toBe("beschreibung");
    expect(id(s({ kriseErledigt: true, schnellcheckErledigt: true, beschreibungErledigt: true }))).toBe("s_stimmung");
    // KRISE beendet den Ablauf – auch ohne Beschreibung
    expect(id(s({ kriseErledigt: true, krise: true }))).toBe("beendet");
  });

  it("NOTFALL: zuerst die Bestätigung „Zuerst Notruf 112“, dann die Beschreibung", () => {
    expect(id(stand({ schnellcheckErledigt: true, notfallAktiv: true }))).toBe("notfall_weiter");
    expect(id(stand({ schnellcheckErledigt: true, notfallAktiv: true, notfallBestaetigt: true }))).toBe("beschreibung");
  });

  it("Beschreibung kann nicht vor dem Schnellcheck angefordert werden; danach bearbeitbar", () => {
    expect(erlaubterSchritt(k, stand(), "beschreibung")).toBeNull();
    const nachher = stand({ schnellcheckErledigt: true, beschreibungErledigt: true, region: "brust" });
    expect(bearbeitbareSchritte(k, nachher)).toContain("beschreibung");
    expect(erlaubterSchritt(k, nachher, "beschreibung")).toEqual({ art: "beschreibung" });
    expect(erlaubterSchritt(k, nachher, "schnellcheck")).toBeNull();
  });

  it("ohne `mitBeschreibung` (Weg 2/3) gibt es den Schritt nicht", () => {
    expect(id(stand({ mitBeschreibung: false, schnellcheckErledigt: true }))).toBe("region");
    expect(erlaubterSchritt(k, stand({ mitBeschreibung: false, schnellcheckErledigt: true, region: "brust" }), "beschreibung")).toBeNull();
  });

  it("medienErlaubt: erst nach Schnellcheck/Krisen-Screening, nie bei KRISE oder unbestätigtem NOTFALL", () => {
    expect(medienErlaubt(stand())).toBe(false);
    expect(medienErlaubt(stand({ schnellcheckErledigt: true }))).toBe(true);
    expect(medienErlaubt(stand({ schnellcheckErledigt: true, notfallAktiv: true }))).toBe(false);
    expect(medienErlaubt(stand({ schnellcheckErledigt: true, notfallAktiv: true, notfallBestaetigt: true }))).toBe(true);
    expect(medienErlaubt(stand({ bereich: "PSYCHISCH", schnellcheckErledigt: true }))).toBe(false);
    expect(medienErlaubt(stand({ bereich: "PSYCHISCH", kriseErledigt: true, schnellcheckErledigt: true }))).toBe(true);
    expect(medienErlaubt(stand({ bereich: "PSYCHISCH", kriseErledigt: true, krise: true, schnellcheckErledigt: true }))).toBe(false);
    expect(medienErlaubt(stand({ mitBeschreibung: false, schnellcheckErledigt: true }))).toBe(false);
  });
});

describe("REQ-402 Speicherung und Lesen der Beschreibung", () => {
  it("Schema: 2000 Zeichen gültig, 2001 ungültig; strikt", () => {
    const h = (wert: unknown) => ({ v: 1, katalogVersion: "0.2.0", schritt: "beschreibung", teilweise: false, wert });
    expect(gespeicherteEingabeSchema.safeParse(h(text("x".repeat(2000)))).success).toBe(true);
    expect(gespeicherteEingabeSchema.safeParse(h(text("x".repeat(2001)))).success).toBe(false);
    expect(gespeicherteEingabeSchema.safeParse(h({ ...text("a"), name: "Anna" })).success).toBe(false);
    expect(gespeicherteEingabeSchema.safeParse(h({ ...text("a"), quelle: "ki" })).success).toBe(false);
  });

  it("letzte Beschreibung gilt; Stand erledigt; Zusammenfassung zeigt sie", () => {
    const g = sammleEingaben(k, w, "KOERPERLICH", [
      e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }),
      e("beschreibung", text("erste Fassung")),
      e("beschreibung", text("Halsschmerzen seit gestern", "sprache", true)),
    ]);
    expect(g.ungueltig).toBe(0);
    expect(g.beschreibung).toEqual(text("Halsschmerzen seit gestern", "sprache", true));
    const s = ablaufStandAus("KOERPERLICH", g, { krise: false, notfallAktiv: false, kinderprofil: false, alterMonate: 400, mitBeschreibung: true });
    expect(s.beschreibungErledigt).toBe(true);
    expect(naechsterSchritt(k, s)).toEqual({ art: "region" });
    const z = erstelleZusammenfassung(k, w, g, s).find((a) => a.id === "beschreibung");
    expect(z?.eintraege[0]).toMatchObject({ bezeichnung: expect.stringContaining("korrigiert"), werte: [{ text: "Halsschmerzen seit gestern" }] });
  });

  it("Beschreibung unter falscher Schritt-ID oder als Teil-Eingabe ist nicht lesbar (⇒ Prüfung unvollständig)", () => {
    const g = sammleEingaben(k, w, "KOERPERLICH", [e("region", text("x")), e("beschreibung", text("y"), true)]);
    expect(g.beschreibung).toBeNull();
    expect(g.ungueltig).toBe(2);
  });
});
