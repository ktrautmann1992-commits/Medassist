import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Anlaufstellen, BereichErgebnis, EINSTUFUNG_DARSTELLUNG, EntwicklungsStatus } from "./index";

const anlaufstellen = [
  { id: "kinderarzt", bezeichnung: "Kinderärztin oder Kinderarzt", hinweis: "Immer zuerst: Heilmittel brauchen eine ärztliche Verordnung." },
  { id: "logopaedie", bezeichnung: "Logopädie", hinweis: "Nach ärztlicher Verordnung." },
  { id: "hno_paedaudiologie", bezeichnung: "HNO-Ärztin/-Arzt oder Pädaudiologie", hinweis: null },
];

const basis = {
  id: "sprache",
  bezeichnung: "Sprache und Sprechen",
  titel: "Abklärung empfohlen",
  text: "Bitte besprechen Sie die Angaben zeitnah mit Ihrer Kinderarztpraxis.",
  gruende: ["Sorge der Eltern: Ja, ich mache mir Sorgen"],
  anlaufstellen,
} as const;

describe("REQ-326 Entwicklungsstatus: Symbol und Text, keine Rosé-Warnfarbe", () => {
  it("jede Einstufung hat Symbol, Text und eine vorhandene Status-Klasse (nie Rosé)", () => {
    for (const [stufe, d] of Object.entries(EINSTUFUNG_DARSTELLUNG)) {
      expect(d.symbol.length, stufe).toBeGreaterThan(0);
      expect(d.text.length, stufe).toBeGreaterThan(3);
      expect(d.klasse).toMatch(/^urgency-(routine|ok|neutral)$/);
      expect(d.klasse).not.toMatch(/rose|emergency/);
    }
    expect(EINSTUFUNG_DARSTELLUNG.ABKLAERUNG.klasse).toBe("urgency-routine");
    expect(EINSTUFUNG_DARSTELLUNG.ALTERSGERECHT.text).toBe("Keine Auffälligkeit in den Demo-Fragen");
  });

  it("Kurzform zeigt Symbol (aria-hidden) und Text", () => {
    const html = renderToStaticMarkup(<EntwicklungsStatus einstufung="BEOBACHTEN" />);
    expect(html).toBe('<span class="urgency-tag urgency-ok" data-einstufung="BEOBACHTEN"><span aria-hidden="true">◐</span> Beobachten</span>');
  });
});

describe("REQ-326 Bereichsergebnis Patient (Eltern)", () => {
  const html = renderToStaticMarkup(
    <BereichErgebnis {...basis} einstufung="ABKLAERUNG" foerderideen={["Gemeinsam Bilderbücher anschauen und Dinge benennen."]} anlaufstellenQuelle="CLAUDE.md §5 (Projektvorgabe), fachlich ungeprüft" />,
  );

  it("Status mit Symbol und Text in Routine-Blau", () => {
    expect(html).toContain('<div class="urgency urgency-routine" data-testid="bereich-status"><span class="icon" aria-hidden="true">→</span>');
    expect(html).toContain("Ergebnis: Abklärung empfohlen");
    expect(html).toContain("<strong>Abklärung empfohlen</strong>");
  });

  it("Anlaufstellen: Kinderarztpraxis zuerst, dann Logopädie und HNO/Pädaudiologie; Quelle ungeprüft", () => {
    expect(html.indexOf('data-anlaufstelle="kinderarzt"')).toBeLessThan(html.indexOf('data-anlaufstelle="logopaedie"'));
    expect(html.indexOf('data-anlaufstelle="logopaedie"')).toBeLessThan(html.indexOf('data-anlaufstelle="hno_paedaudiologie"'));
    expect(html).toContain("<strong>Zuerst: Kinderärztin oder Kinderarzt</strong>");
    expect(html).toContain("ärztliche Verordnung");
    expect(html).toContain("Zuordnung ungeprüft");
  });

  it("Förderideen mit „kein Therapieersatz“ und „ungeprüft“; keine ärztliche Übersicht", () => {
    expect(html).toContain("Ideen für den Alltag – kein Therapieersatz");
    expect(html).toContain("ungeprüft");
    expect(html).not.toContain("entwicklung-uebersicht");
    expect(html).toContain("Was dazu geführt hat");
  });
});

describe("REQ-327 Bereichsergebnis Arzt", () => {
  const html = renderToStaticMarkup(
    <BereichErgebnis
      {...basis}
      einstufung="ABKLAERUNG"
      uebersicht={[
        { frageId: "s_hoeren", frage: "Reagiert auf Ansprache und Geräusche", antwort: "Nein", einstufung: "ABKLAERUNG" },
        { frageId: "s_saetze", frage: "Spricht in kurzen Sätzen", antwort: "Ja", einstufung: "ALTERSGERECHT" },
      ]}
    />,
  );
  it("Übersichtstabelle mit Einstufung je Beobachtung, Anlaufstellen als Überweisung zur Prüfung, keine Förderideen", () => {
    expect(html).toContain('data-testid="entwicklung-uebersicht"');
    expect(html).toContain('<th scope="col">Einstufung</th>');
    expect(html).toContain('data-frage="s_hoeren"');
    expect(html).toContain("Mögliche Anlaufstellen (Überweisung nach ärztlicher Beurteilung)");
    expect(html).not.toContain("kein Therapieersatz");
  });
});

describe("Anlaufstellen", () => {
  it("geordnete Liste", () => {
    const html = renderToStaticMarkup(<Anlaufstellen anlaufstellen={anlaufstellen.slice(0, 1)} titel="Bei Fragen" />);
    expect(html).toContain('<ol class="anlaufstellen">');
    expect(html).not.toContain("Zuordnung ungeprüft");
  });
});
