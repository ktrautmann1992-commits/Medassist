import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppHeader,
  Avatar,
  Button,
  CheckboxField,
  DEMO_HINWEIS_TEXT,
  Field,
  Hinweis,
  Panel,
  ProfilAuswahl,
  ProfilChip,
  SelectField,
  TextareaField,
  optionenAus,
} from "./index";

describe("REQ-001 Demo-Hinweis", () => {
  it("Kopfzeile enthält den verbindlichen Hinweistext", () => {
    const html = renderToStaticMarkup(<AppHeader />);
    expect(html).toContain("Demo – nicht für den klinischen Einsatz");
    expect(html).toContain(DEMO_HINWEIS_TEXT);
    expect(html).toContain('class="demo-flag"');
  });
});

describe("Komponenten nutzen die Klassen aus style.css (REQ-004)", () => {
  it("Button-Varianten", () => {
    expect(renderToStaticMarkup(<Button>OK</Button>)).toContain('class="btn btn-primary"');
    expect(renderToStaticMarkup(<Button variante="secondary">X</Button>)).toContain("btn-secondary");
    expect(renderToStaticMarkup(<Button>OK</Button>)).toContain('type="button"');
  });

  it("Feld verknüpft Fehlermeldung zugänglich", () => {
    const html = renderToStaticMarkup(<Field id="e" label="E-Mail" fehler="Pflichtfeld" />);
    expect(html).toContain('class="field has-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="e-fehler"');
    expect(html).toContain('for="e"');
  });

  it("Kinder-Avatar ist blau markiert", () => {
    expect(renderToStaticMarkup(<Avatar initialen="LM" kind />)).toContain('class="avatar child"');
  });
});

describe("REQ-117 neue Bausteine", () => {
  it("Field: Label mit Fachbegriff und Hinweis-Verknüpfung", () => {
    const html = renderToStaticMarkup(
      <Field id="v" label={<>Vorerkrankungen (<span className="term">Anamnese</span>)</>} hinweis="optional" />,
    );
    expect(html).toContain('<span class="term">Anamnese</span>');
    expect(html).toContain('aria-describedby="v-hinweis"');
    expect(html).not.toContain("aria-invalid");
  });

  it("SelectField: Optionen, leere Option, Fehler", () => {
    const html = renderToStaticMarkup(
      <SelectField
        id="g"
        name="g"
        label="Geschlecht"
        leereOption="Bitte wählen"
        optionen={optionenAus(["A", "B"] as const, { A: "Alpha", B: "Beta" })}
        fehler="Bitte wählen."
      />,
    );
    expect(html).toContain('<label for="g">Geschlecht</label>');
    expect(html).toContain('<option value="">Bitte wählen</option>');
    expect(html).toContain('<option value="B">Beta</option>');
    expect(html).toContain('class="field has-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="g-fehler"');
    expect(html).toContain('role="alert"');
  });

  it("TextareaField: Standard 3 Zeilen, Hinweis und Fehler verknüpft", () => {
    const html = renderToStaticMarkup(<TextareaField id="t" label="Notiz" hinweis="frei" fehler="zu lang" />);
    expect(html).toContain('rows="3"');
    expect(html).toContain('aria-describedby="t-hinweis t-fehler"');
  });

  it("CheckboxField: ganze Zeile ist Label (48-px-Zeile)", () => {
    const html = renderToStaticMarkup(<CheckboxField id="c" name="c" label="Ich bin sorgeberechtigt" fehler="Pflicht" />);
    expect(html).toContain('<label class="check-row" for="c">');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('aria-describedby="c-fehler"');
  });

  it("Panel: Varianten nutzen nur style.css-Klassen", () => {
    expect(renderToStaticMarkup(<Panel titel="Stammdaten">x</Panel>)).toContain('<section class="panel stack"><h2>Stammdaten</h2>');
    expect(renderToStaticMarkup(<Panel variante="data" ebene={3} titel="Labor" />)).toContain(
      '<section class="panel panel-data stack"><h3>Labor</h3>',
    );
  });

  it("Hinweis: Rolle note, Symbol plus Text, kein Rosé", () => {
    const html = renderToStaticMarkup(<Hinweis titel="Perzentilen:">folgen später</Hinweis>);
    expect(html).toContain('role="note"');
    expect(html).toContain('aria-hidden="true">i</span>');
    expect(html).not.toContain("rose");
    expect(renderToStaticMarkup(<Hinweis variante="data">x</Hinweis>)).toContain("panel panel-data note");
  });

  it("ProfilChip als Schaltfläche mit aria-pressed, Kind mit blauem Avatar", () => {
    const html = renderToStaticMarkup(
      <ProfilAuswahl label="Profil wählen">
        <ProfilChip initialen="KM" bezeichnung="Karsten M." name="profil" value="p1" />
        <ProfilChip initialen="LM" bezeichnung="Lena, 4 Jahre" kind ausgewaehlt />
      </ProfilAuswahl>,
    );
    expect(html).toContain('<div class="profile-switch" role="group" aria-label="Profil wählen">');
    expect(html).toContain('<button class="profile-chip" type="submit" aria-pressed="false" value="p1" name="profil">');
    expect(html).toContain('<span class="avatar" aria-hidden="true">KM</span>Karsten M.</button>');
    expect(html).toContain('aria-pressed="true"><span class="avatar child" aria-hidden="true">LM</span>Lena, 4 Jahre</button>');
  });

  it("ProfilChip als Link ohne aria-pressed", () => {
    const html = renderToStaticMarkup(<ProfilChip href="/profile/kind/neu" initialen="+" bezeichnung="Kind hinzufügen" kind />);
    expect(html).toBe(
      '<a class="profile-chip" href="/profile/kind/neu"><span class="avatar child" aria-hidden="true">+</span>Kind hinzufügen</a>',
    );
  });

  it("AppHeader: Navigation nur, wenn übergeben (REQ-118)", () => {
    expect(renderToStaticMarkup(<AppHeader />)).not.toContain("<nav");
    const html = renderToStaticMarkup(<AppHeader navigation={<a href="/start">Übersicht</a>} />);
    expect(html).toContain('<nav class="app-nav" aria-label="Hauptnavigation">');
    expect(html).toContain(DEMO_HINWEIS_TEXT);
  });
});
