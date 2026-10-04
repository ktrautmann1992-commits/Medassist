import { standardFragenkataloge } from "@medassist/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuswahlFrage, DauerFrage, DringlichkeitKurz, Koerperkarte, Schrittanzeige, SkalaFrage } from "./index";

const karte = standardFragenkataloge().koerperkarte;
const props = { regionen: karte.regionen, viewBox: karte.viewBox, name: "region" } as const;

describe("REQ-309 Körperkarte", () => {
  it("jede Region der Ansicht ist ein benanntes, fokussierbares Bedienelement", () => {
    const html = renderToStaticMarkup(<Koerperkarte {...props} ansicht="vorne" ausgewaehlt={null} />);
    const vorne = karte.regionen.filter((r) => r.formen.vorne.length);
    expect(html.match(/role="button"/g)?.length).toBe(vorne.length);
    expect(html).toContain('aria-label="Brust (Thorax)"');
    expect(html).toContain('aria-label="Rechter Arm und Schulter"');
    expect(html).toMatch(/<g class="body-region" role="button" tabindex="0" aria-label="Kopf und Gesicht" aria-pressed="false" data-region="kopf">/);
    // Rücken nur hinten
    expect(html).not.toContain('data-region="unterer_ruecken"');
    expect(html).toContain('aria-label="Körperkarte, Vorderseite"');
    // Vorderansicht: rechte Körperseite links im Bild
    expect(html.indexOf(">rechts</text>")).toBeLessThan(html.indexOf(">links</text>"));
  });

  it("Rückseite zeigt Rückenregionen; Umschalter mit aria-pressed", () => {
    const html = renderToStaticMarkup(<Koerperkarte {...props} ansicht="hinten" ausgewaehlt={null} />);
    expect(html).toContain('aria-label="Unterer Rücken (Lumbalregion)"');
    expect(html).not.toContain('data-region="brust"');
    expect(html).toContain('<button type="button" class="btn btn-secondary" aria-pressed="true">Rückseite</button>');
    expect(html).toContain('<button type="button" class="btn btn-secondary" aria-pressed="false">Vorderseite</button>');
    expect(html.indexOf(">links</text>")).toBeLessThan(html.indexOf(">rechts</text>"));
  });

  it("Listen-Alternative: alle Regionen als Optionsfelder, auch reine Listen-Regionen", () => {
    const html = renderToStaticMarkup(<Koerperkarte {...props} ansicht="vorne" ausgewaehlt={null} />);
    expect(html.match(/type="radio"/g)?.length).toBe(karte.regionen.length);
    expect(html).toContain('<input type="radio" id="region-allgemein" name="region" value="allgemein"/>');
    expect(html).toContain('<label class="check-row" for="region-unterer_ruecken">');
    expect(html).toContain('<span class="term">Lumbalregion</span>');
  });

  it("Auswahlzustand: Karte (aria-pressed) und Liste (checked) sind synchron", () => {
    const html = renderToStaticMarkup(<Koerperkarte {...props} ansicht="vorne" ausgewaehlt="brust" />);
    expect(html).toContain('aria-label="Brust (Thorax)" aria-pressed="true"');
    expect(html.match(/aria-pressed="true" data-region/g)?.length).toBe(1);
    expect(html).toContain('id="region-brust" name="region" checked="" value="brust"');
    expect(html.match(/checked=""/g)?.length).toBe(1);
  });

  it("Fehler wird zugänglich verknüpft", () => {
    const html = renderToStaticMarkup(<Koerperkarte {...props} ansicht="vorne" ausgewaehlt={null} fehler="Bitte eine Körperregion wählen." />);
    expect(html).toContain('aria-describedby="region-fehler"');
    expect(html).toContain('<p class="error" id="region-fehler">Bitte eine Körperregion wählen.</p>');
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("REQ-310 Assistenten-Schritte", () => {
  it("Einfachauswahl mit Fachbegriff, Hilfe und Fehler", () => {
    const html = renderToStaticMarkup(
      <AuswahlFrage
        id="f"
        name="wert"
        typ="einfach"
        legende="Wie fühlt sich der Schmerz an?"
        optionen={[
          { wert: "stechend", bezeichnung: "Stechend" },
          { wert: "krampfartig", bezeichnung: "Krampfartig", fachbegriff: "Kolikartig" },
        ]}
        gewaehlt={["krampfartig"]}
        hilfe="Eine Antwort"
        fehler="Bitte eine Antwort wählen."
        required
      />,
    );
    expect(html).toContain("<legend>Wie fühlt sich der Schmerz an?</legend>");
    expect(html).toContain('aria-describedby="f-hilfe f-fehler"');
    expect(html).toContain('aria-invalid="true"');
    expect(html.match(/type="radio"/g)?.length).toBe(2);
    expect(html).toContain('<span class="term">Kolikartig</span>');
    expect(html).toContain('name="wert" checked="" value="krampfartig"');
    expect(html).toContain('required=""');
  });

  it("Mehrfachauswahl mit ausschließender Option „Nichts davon“ und Warnzeichen-Zusatz als Text", () => {
    const html = renderToStaticMarkup(
      <AuswahlFrage
        id="b"
        name="wert"
        typ="mehrfach"
        legende="Weitere Beschwerden"
        optionen={[{ wert: "atemnot", bezeichnung: "Atemnot", fachbegriff: "Dyspnoe", zusatz: "Warnzeichen" }]}
        keineOption={{ name: "keine", bezeichnung: "Nichts davon" }}
        keineGewaehlt
      />,
    );
    expect(html).toContain('type="checkbox" id="b-atemnot" name="wert" value="atemnot"');
    expect(html).toContain("· Warnzeichen");
    expect(html).toContain('<input type="checkbox" id="b-keine" name="keine" checked=""/>');
  });

  it("Skala 0–10: 11 Optionsfelder mit Endbeschriftung", () => {
    const html = renderToStaticMarkup(<SkalaFrage id="s" name="wert" legende="Stärke" min={0} max={10} minText="0 = keine" maxText="10 = stärkste" wert={7} />);
    expect(html.match(/type="radio"/g)?.length).toBe(11);
    expect(html).toContain('checked="" value="7"');
    expect(html).toContain('<span class="visually-hidden"> – 0 = keine</span>');
    expect(html).toContain('class="scale-row"');
  });

  it("Dauer: Anzahl und Einheit mit Beschriftung", () => {
    const html = renderToStaticMarkup(
      <DauerFrage id="d" legende="Seit wann?" anzahlName="anzahl" einheitName="einheit" maxAnzahl={99} einheiten={[{ wert: "tage", bezeichnung: "Tage" }]} anzahl={3} einheit="tage" />,
    );
    expect(html).toContain('<label for="d-anzahl">Anzahl (1–99)</label>');
    expect(html).toContain('name="anzahl"');
    expect(html).toContain('<option value="tage" selected="">Tage</option>');
  });

  it("Schrittanzeige als Text und Fortschrittsbalken", () => {
    const html = renderToStaticMarkup(<Schrittanzeige nummer={3} gesamt={12} />);
    expect(html).toContain("Schritt 3 von 12");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain("width:25%");
  });

  it("REQ-317 DringlichkeitKurz: Farbe + Symbol + Text, nie Rosé", () => {
    const html = renderToStaticMarkup(<DringlichkeitKurz stufe="DRINGEND" />);
    expect(html).toContain('class="urgency-tag urgency-urgent"');
    expect(html).toContain('<span aria-hidden="true">!</span> Dringend');
    expect(html).not.toContain("rose");
    // QA B2: ohne Angabe nie „keine Warnzeichen“
    expect(renderToStaticMarkup(<DringlichkeitKurz stufe={null} />)).toContain("Noch nicht geprüft");
    expect(renderToStaticMarkup(<DringlichkeitKurz stufe={null} />)).not.toContain("Warnzeichen");
    expect(renderToStaticMarkup(<DringlichkeitKurz stufe={null} ohneStufe="Keine Warnzeichen erkannt (Demo-Regelsatz)" />)).toContain("Demo-Regelsatz");
  });
});
