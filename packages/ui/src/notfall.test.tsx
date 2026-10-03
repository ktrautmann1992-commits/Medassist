import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dringlichkeit, Krisenhinweis, Notfallhinweis, UngeprueftKennzeichen } from "./index";

/** REQ-207, REQ-208, REQ-214: Dringlichkeits-, Notfall- und Krisenkomponenten. */

describe("REQ-214 Dringlichkeit: Farbe + Symbol + Text", () => {
  it.each([
    ["NOTFALL", "urgency-emergency", "⚠", "Notfall", "Sofort Notruf 112"],
    ["DRINGEND", "urgency-urgent", "!", "Dringend", "Heute ärztlich abklären"],
    ["ROUTINE", "urgency-routine", "i", "Routine", "In den nächsten Tagen"],
    ["BEOBACHTEN", "urgency-ok", "✓", "Beobachten", "Beobachten"],
  ] as const)("%s", (stufe, klasse, symbol, label, titel) => {
    const html = renderToStaticMarkup(<Dringlichkeit stufe={stufe} />);
    expect(html).toContain(`class="urgency ${klasse}"`);
    expect(html).toContain(`<span class="icon" aria-hidden="true">${symbol}</span>`);
    expect(html).toContain(`Dringlichkeit: ${label}`);
    expect(html).toContain(`<strong>${titel}</strong>`);
    expect(html).not.toContain("rose");
  });

  it("QA B6: eigener Titel und ID (z. B. direkt am Freitextfeld)", async () => {
    const { KrisenKontakte } = await import("./index");
    const html = renderToStaticMarkup(<KrisenKontakte titel="Wenn Sie an Suizid denken:" id="x-krise" />);
    expect(html).toContain('id="x-krise"');
    expect(html).toContain("<strong>Wenn Sie an Suizid denken: </strong>");
    expect(html).toContain('href="tel:112"');
  });
});

describe("REQ-207 Notfallhinweis", () => {
  it("NOTFALL: 112 als tel:-Link (Schaltfläche), 116117 als tel:-Link, role=alert", () => {
    const html = renderToStaticMarkup(<Notfallhinweis stufe="NOTFALL">Atemnot mit bläulichen Lippen.</Notfallhinweis>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('<a class="btn btn-emergency" href="tel:112">Notruf 112 anrufen</a>');
    expect(html).toContain('href="tel:116117"');
    expect(html).toContain("Atemnot mit bläulichen Lippen.");
    expect(html).toContain("urgency-emergency");
  });

  it("DRINGEND: 116117 als tel:-Link, 112 für Lebensgefahr", () => {
    const html = renderToStaticMarkup(<Notfallhinweis stufe="DRINGEND" />);
    expect(html).toContain("urgency-urgent");
    expect(html).toContain('<a class="tel-link" href="tel:116117">116117</a>');
    expect(html).toContain('<a class="tel-link" href="tel:112">112</a>');
    expect(html).toContain("Dringlichkeit: Dringend");
    expect(html).toContain("<strong>Sofort ärztlich abklären lassen</strong>");
  });

  it("S2: Überschrift folgt dem Zeitrahmen der Regel", () => {
    expect(renderToStaticMarkup(<Notfallhinweis stufe="DRINGEND" zeitrahmen="HEUTE" />)).toContain("<strong>Heute ärztlich abklären lassen</strong>");
    expect(renderToStaticMarkup(<Notfallhinweis stufe="NOTFALL" titel="Prüfung fehlgeschlagen" />)).toContain("<strong>Prüfung fehlgeschlagen</strong>");
  });
});

describe("REQ-208 Krisenhinweis", () => {
  it("112 und beide Nummern der Telefonseelsorge als tel:-Links, Empfehlung Akutvorstellung", () => {
    const html = renderToStaticMarkup(<Krisenhinweis />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('<a class="tel-link" href="tel:112">112</a>');
    expect(html).toContain('<a class="tel-link" href="tel:08001110111">0800 111 0 111</a>');
    expect(html).toContain('<a class="tel-link" href="tel:08001110222">0800 111 0 222</a>');
    expect(html).toContain("ärztliche Akutvorstellung");
    expect(html).toContain('<span class="icon" aria-hidden="true">⚠</span>');
    expect(html).toContain("Dringlichkeit: Notfall");
  });

  it("S6: an Ärztinnen und Ärzte gerichtet – Nummern bleiben", () => {
    const html = renderToStaticMarkup(<Krisenhinweis adressat="arzt" />);
    expect(html).toContain("Akutvorstellung veranlassen");
    expect(html).toContain('href="tel:08001110111"');
    expect(html).toContain('href="tel:08001110222"');
    expect(html).toContain('href="tel:112"');
  });
});

describe("RISK-025 Kennzeichnung ungeprüft", () => {
  it("Symbol und Text, neutrale Klasse", () => {
    const html = renderToStaticMarkup(<UngeprueftKennzeichen />);
    expect(html).toBe('<span class="badge badge-ungeprueft"><span aria-hidden="true">?</span> Regel ungeprüft</span>');
    expect(renderToStaticMarkup(<UngeprueftKennzeichen text="Fragen ungeprüft" />)).toContain("Fragen ungeprüft");
  });
});

describe("REQ-311 KrisenKontakte", () => {
  it("neutraler Hinweis mit 112 und beiden Nummern der Telefonseelsorge als tel:-Links", async () => {
    const { KrisenKontakte } = await import("./index");
    const html = renderToStaticMarkup(<KrisenKontakte />);
    expect(html).toContain('role="note"');
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("urgency");
    expect(html).not.toContain("rose");
  });
});
