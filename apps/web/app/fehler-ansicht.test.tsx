import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FehlerAnsicht } from "./fehler-ansicht";

describe("QA N2 Fehlerseite", () => {
  it("statischer Notfall- und Krisenhinweis mit allen Nummern", () => {
    const html = renderToStaticMarkup(<FehlerAnsicht />);
    expect(html).toContain("Ein Fehler ist aufgetreten – im Notfall Notruf 112");
    for (const href of ["tel:112", "tel:116117", "tel:08001110111", "tel:08001110222"]) expect(html).toContain(`href="${href}"`);
    expect(html.match(/role="alert"/g)?.length).toBe(2);
  });
});
