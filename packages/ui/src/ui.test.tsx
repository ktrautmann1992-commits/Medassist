import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppHeader, Avatar, Button, DEMO_HINWEIS_TEXT, Field } from "./index";

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
