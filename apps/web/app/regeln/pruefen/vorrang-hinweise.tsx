import type { Rolle } from "@medassist/core";
import { Krisenhinweis, Notfallhinweis } from "@medassist/ui";
import type { RegelPruefState } from "@/lib/regeln/form";

/**
 * REQ-210, REQ-220: Krisen- und Notfallhinweise ganz oben – aus dem Ergebnis oder, bei
 * einem internen Fehler, aus dem statischen Fallback. Rein darstellend (ohne Hooks),
 * damit per Render-Test prüfbar.
 */
export function VorrangHinweise({ state, rolle }: { state: RegelPruefState; rolle: Rolle }) {
  const e = state.ergebnis;
  const fb = state.fallback;
  const istArzt = rolle === "ARZT";
  const krisenRegeln = e?.ausgeloesteRegeln.filter((r) => r.regelwerk === "krisenpfad") ?? [];
  const redFlags = e?.ausgeloesteRegeln.filter((r) => r.regelwerk !== "krisenpfad") ?? [];
  /** Hinweistext je Rolle (Arzt: an Ärztin/Arzt gerichtet, S6). */
  const text = (r: { hinweisPatient: string } & Partial<{ hinweisArzt: string }>) =>
    istArzt && r.hinweisArzt ? r.hinweisArzt : r.hinweisPatient;
  const krise = Boolean(e?.krisenhinweis || fb?.krise);
  const notfall = e?.notfallhinweis ?? fb?.notfall ?? null;
  return (
    <>
      {krise && (
        <Krisenhinweis id="krisenhinweis" adressat={istArzt ? "arzt" : "patient"}>
          {/* Text der ranghöchsten Krisenregel (bei positiver Antwort nicht zusätzlich „unvollständig“, H2). */}
          {krisenRegeln[0] && <p>{text(krisenRegeln[0])}</p>}
        </Krisenhinweis>
      )}
      {notfall && (
        <Notfallhinweis stufe={notfall.dringlichkeit} zeitrahmen={notfall.zeitrahmen} titel={fb?.notfall?.titel} id="notfallhinweis">
          {redFlags.length > 0 && <p>Erkannte Warnzeichen: {redFlags.map((r) => r.titel).join("; ")}.</p>}
          {redFlags[0] && <p>{text(redFlags[0])}</p>}
        </Notfallhinweis>
      )}
    </>
  );
}

export function hatVorrangHinweis(state: RegelPruefState): boolean {
  return Boolean(state.ergebnis?.krisenhinweis || state.ergebnis?.notfallhinweis || state.fallback?.krise || state.fallback?.notfall);
}
