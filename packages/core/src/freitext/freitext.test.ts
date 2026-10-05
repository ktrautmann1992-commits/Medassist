import { describe, expect, it } from "vitest";
import { beschreibungsLaenge, MAX_BESCHREIBUNG, normalisiereBeschreibung, pruefeBeschreibung } from "./beschreibung";
import { EMAIL_PLATZHALTER, NAME_PLATZHALTER, pseudonymisiere } from "./pseudonym";

describe("REQ-402 Freitext-Validierung (nie still kürzen)", () => {
  it("nimmt einen normalen Text an und entfernt nur Rand-Leerzeichen", () => {
    expect(pruefeBeschreibung("  Seit drei Tagen Halsschmerzen.\n")).toEqual({ ok: true, text: "Seit drei Tagen Halsschmerzen." });
  });

  it("vereinheitlicht CRLF zu LF – Zähler der Oberfläche und Server zählen gleich", () => {
    expect(normalisiereBeschreibung("a\r\nb\rc")).toBe("a\nb\nc");
    expect(beschreibungsLaenge("ab\r\ncd")).toBe(5);
  });

  it.each([undefined, null, "", "   \n  "])("leer (%j) ⇒ Pflichtmeldung", (roh) => {
    const r = pruefeBeschreibung(roh);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toContain("eigenen Worten");
  });

  it("genau 2000 Zeichen werden angenommen, 2001 abgelehnt – ohne Kürzung", () => {
    expect(pruefeBeschreibung("x".repeat(MAX_BESCHREIBUNG))).toEqual({ ok: true, text: "x".repeat(MAX_BESCHREIBUNG) });
    const r = pruefeBeschreibung("x".repeat(MAX_BESCHREIBUNG + 1));
    expect(r).toEqual({ ok: false, fehler: expect.stringContaining("2001 von höchstens 2000") });
    if (!r.ok) expect(r.fehler).toContain("nichts automatisch abgeschnitten");
  });

  it("2000 Zeichen mit CRLF-Umbrüchen aus dem Formular zählen wie im Browser (LF)", () => {
    const zeile = "x".repeat(99);
    const browser = Array.from({ length: 20 }, () => zeile).join("\n"); // 20·99 + 19 = 1999
    const formular = browser.replace(/\n/g, "\r\n");
    expect(beschreibungsLaenge(browser)).toBe(1999);
    expect(pruefeBeschreibung(formular).ok).toBe(true);
  });

  it("Steuerzeichen werden abgelehnt, Tab und Zeilenumbruch nicht", () => {
    expect(pruefeBeschreibung("a\u0000b").ok).toBe(false);
    expect(pruefeBeschreibung("a\u001bb").ok).toBe(false);
    expect(pruefeBeschreibung("a\tb\nc").ok).toBe(true);
  });

  it.each([
    ["C1-Steuerzeichen U+0085", "a\u0085b"],
    ["C1-Steuerzeichen U+009F", "a\u009fb"],
    ["Bidi-Override U+202E", "Fieber \u202Eniek\u202C"],
    ["Bidi-Isolat U+2066", "a\u2066b\u2069"],
    ["Zero-Width-Space U+200B", "Hals\u200Bschmerzen"],
    ["Zero-Width-Non-Joiner U+200C", "a\u200Cb"],
    ["Zero-Width-Joiner zwischen Buchstaben", "a\u200Db"],
    ["BOM im Text U+FEFF", "a\uFEFFb"],
    ["Zeilentrenner U+2028", "a\u2028b"],
    ["Absatztrenner U+2029", "a\u2029b"],
  ])("QA M5: %s wird abgelehnt", (_name, text) => {
    expect(pruefeBeschreibung(text).ok).toBe(false);
  });

  it("QA M5: ein Text nur aus unsichtbaren Zeichen gilt als leer (Pflichtmeldung)", () => {
    for (const t of ["\u200B\u200B", "\uFEFF", " \u200D \u2066\u2069 ", "\u2028\u2029"]) {
      expect(pruefeBeschreibung(t)).toEqual({ ok: false, fehler: "Bitte beschreiben Sie Ihre Beschwerden in eigenen Worten." });
    }
  });

  it("QA M5: Emoji-Sequenzen mit Zero-Width-Joiner und Umlaute bleiben erlaubt", () => {
    expect(pruefeBeschreibung("Ärztin 👩‍⚕️ sagte: Übelkeit 👨‍👩‍👧").ok).toBe(true);
    expect(pruefeBeschreibung("😀".repeat(10)).ok).toBe(true);
  });

  it("Nicht-Text (z. B. Datei) wird abgelehnt", () => {
    expect(pruefeBeschreibung(42).ok).toBe(false);
    expect(pruefeBeschreibung({}).ok).toBe(false);
  });
});

describe("REQ-404 pseudonymisiere – nur bekannte Namen und E-Mail-Adressen", () => {
  it("ersetzt Vor- und Nachname als ganze Wörter, unabhängig von Groß-/Kleinschreibung", () => {
    const r = pseudonymisiere("Anna Müller hat Fieber. MÜLLER ist besorgt, anna auch.", { namen: ["Anna", "Müller"] });
    expect(r.text).toBe(`${NAME_PLATZHALTER} ${NAME_PLATZHALTER} hat Fieber. ${NAME_PLATZHALTER} ist besorgt, ${NAME_PLATZHALTER} auch.`);
    expect(r.ersetzungen).toBe(4);
  });

  it("ersetzt keine Wortteile – medizinische Begriffe bleiben erhalten", () => {
    // „Ben“ in „Benommenheit“, „Ute“ in „akute“, „Hals“ ist kein bekannter Name
    const text = "Benommenheit, akute Halsschmerzen, Anämie.";
    expect(pseudonymisiere(text, { namen: ["Ben", "Ute", "Ana"] })).toEqual({ text, ersetzungen: 0 });
  });

  it("Namen mit Bindestrich und Umlauten; längster Name zuerst", () => {
    const r = pseudonymisiere("Anna-Lena war bei Anna.", { namen: ["Anna", "Anna-Lena"] });
    expect(r.text).toBe(`${NAME_PLATZHALTER} war bei ${NAME_PLATZHALTER}.`);
  });

  it("QA M5: Namensteile mit Bindestrich werden auch einzeln ersetzt („Lena“ aus „Anna-Lena“)", () => {
    const r = pseudonymisiere("Anna-Lena hat Fieber. Lena schläft schlecht, Anna auch. Magdalena nicht.", { namen: ["Anna-Lena"] });
    expect(r.text).toBe(`${NAME_PLATZHALTER} hat Fieber. ${NAME_PLATZHALTER} schläft schlecht, ${NAME_PLATZHALTER} auch. Magdalena nicht.`);
    expect(r.ersetzungen).toBe(3);
    // Nachname mit Bindestrich, Teile unter 2 Zeichen werden ignoriert
    expect(pseudonymisiere("Frau Müller und Herr Lüdenscheidt, X.", { namen: ["Müller-Lüdenscheidt", "X-Y"] }).text).toBe(
      `Frau ${NAME_PLATZHALTER} und Herr ${NAME_PLATZHALTER}, X.`,
    );
  });

  it("ersetzt bekannte E-Mail-Adressen vollständig (vor den Namen)", () => {
    const r = pseudonymisiere("Kontakt: anna.mueller@example.org oder ANNA.MUELLER@EXAMPLE.ORG.", {
      namen: ["Anna"],
      emails: ["anna.mueller@example.org"],
    });
    expect(r.text).toBe(`Kontakt: ${EMAIL_PLATZHALTER} oder ${EMAIL_PLATZHALTER}.`);
    expect(r.ersetzungen).toBe(2);
  });

  it("ignoriert leere und einbuchstabige Namen; Platzhalter werden nicht erneut ersetzt", () => {
    expect(pseudonymisiere("A. hat Husten", { namen: ["A", "", null, undefined] })).toEqual({ text: "A. hat Husten", ersetzungen: 0 });
    expect(pseudonymisiere("Name: Anna", { namen: ["Anna", "Name"] }).text).toBe(`${NAME_PLATZHALTER}: ${NAME_PLATZHALTER}`);
  });

  it("Sonderzeichen in Namen werden nicht als Regex interpretiert", () => {
    expect(pseudonymisiere("Herr O'Brien (Test) kam", { namen: ["O'Brien", "T.st"] }).text).toBe(`Herr ${NAME_PLATZHALTER} (Test) kam`);
    expect(pseudonymisiere("a.b", { namen: ["a.b", ".*"] }).text).toBe(NAME_PLATZHALTER);
  });

  it("ohne bekannte Namen bleibt der Text unverändert", () => {
    expect(pseudonymisiere("Kopfschmerzen seit gestern", {})).toEqual({ text: "Kopfschmerzen seit gestern", ersetzungen: 0 });
  });
});
