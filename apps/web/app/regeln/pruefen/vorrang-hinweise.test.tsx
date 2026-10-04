import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fehlgeschlagenState } from "@/lib/regeln/form";
import { VorrangHinweise, hatVorrangHinweis } from "./vorrang-hinweise";

/** REQ-220 (S-2): Der statische Fallback zeigt Krisen- bzw. Notfallhinweis. */
describe("VorrangHinweise – Fallback", () => {
  it("Krise + Notfall aus dem Fallback nach festgestellter Krise", () => {
    const html = renderToStaticMarkup(
      <VorrangHinweise state={{ fallback: { krise: true, notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT" } } }} rolle="PATIENT" />,
    );
    expect(html).toContain('id="krisenhinweis"');
    expect(html).toContain('href="tel:08001110111"');
    expect(html).toContain('href="tel:08001110222"');
    expect(html).toContain('id="notfallhinweis"');
    expect(html).toContain("Sofort Notruf 112");
  });

  it("DRINGEND/HEUTE aus dem Fallback ohne Krise", () => {
    const html = renderToStaticMarkup(
      <VorrangHinweise state={{ fallback: { krise: false, notfall: { dringlichkeit: "DRINGEND", zeitrahmen: "HEUTE" } } }} rolle="ARZT" />,
    );
    expect(html).not.toContain("krisenhinweis");
    expect(html).toContain("Heute ärztlich abklären lassen");
    expect(html).toContain('href="tel:116117"');
  });

  it("Prüfung fehlgeschlagen: eigener Titel, Krisenhinweis an Arzt gerichtet", () => {
    const state = fehlgeschlagenState(true);
    const html = renderToStaticMarkup(<VorrangHinweise state={state} rolle="ARZT" />);
    expect(html).toContain("Prüfung fehlgeschlagen – im Notfall Notruf 112");
    expect(html).toContain("Akutvorstellung veranlassen");
    expect(hatVorrangHinweis(state)).toBe(true);
  });

  it("ohne Ergebnis und ohne Fallback: nichts", () => {
    expect(renderToStaticMarkup(<VorrangHinweise state={{}} rolle="PATIENT" />)).toBe("");
    expect(hatVorrangHinweis({})).toBe(false);
  });
});
