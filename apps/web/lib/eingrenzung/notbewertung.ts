import { erlaubterSchritt, type GespeicherteEingabeRoh } from "@medassist/core";
import { fehlgeschlagenState, type RegelPruefState } from "../regeln/form";
import { bewerteFall, type FallKontext } from "./auswertung";
import { krisenPaare, kriseSignal, verarbeiteSchritt, warnSignal } from "./schritt";

/**
 * QA N2/REQ-220: Speichern endgültig fehlgeschlagen (Transaktionsabbruch, Datenbankfehler).
 * Die Abgabe wird **im Speicher** zusammen mit den zuvor geladenen Eingaben bewertet, damit
 * Krisen- und Notfallhinweise trotzdem erscheinen. Scheitert auch das: statischer Hinweis –
 * Krisenhinweis bei seelischem Weg oder Krisenantwort ≠ „nein“, sonst „Speichern
 * fehlgeschlagen – im Notfall Notruf 112“. Rein und testbar; wirft nie.
 */
export const SPEICHERN_FEHLGESCHLAGEN =
  "Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut. Im Notfall wählen Sie den Notruf 112.";
const TITEL = "Speichern fehlgeschlagen – im Notfall Notruf 112";

export function statischerNotfallZustand(kontext: Pick<FallKontext, "bereich" | "regelwerk">, formData: FormData): RegelPruefState {
  let krise = kontext.bereich === "PSYCHISCH";
  try {
    krise ||= krisenPaare(kontext.regelwerk, formData).some(([, w]) => w !== "nein");
  } catch {
    krise = true;
  }
  const s = fehlgeschlagenState(krise);
  return { ...s, fallback: { krise, notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT", titel: TITEL } } };
}

export function notBewertung(kontext: Omit<FallKontext, "eingaben">, eingabenVorher: readonly GespeicherteEingabeRoh[], formData: FormData): RegelPruefState {
  try {
    const vorher = bewerteFall({ ...kontext, eingaben: eingabenVorher });
    const schrittId = formData.get("schritt");
    const schritt = typeof schrittId === "string" ? erlaubterSchritt(kontext.kataloge, vorher.stand, schrittId) : null;
    const neue = schritt
      ? verarbeiteSchritt(
          kontext.kataloge,
          kontext.regelwerk,
          kontext.bereich,
          schritt,
          formData,
          vorher.gesammelt.entwicklungsAlter ?? (kontext.alterMonate === null ? null : { monate: kontext.alterMonate, korrigiert: false }),
        ).eingaben
      : [kriseSignal(kontext.kataloge, kontext.regelwerk, formData), warnSignal(kontext.kataloge, kontext.regelwerk, kontext.bereich, schrittId, formData)].filter(
          (x) => x !== null,
        );
    const nachher = bewerteFall({ ...kontext, eingaben: [...eingabenVorher, ...neue.map((e) => ({ frageId: e.frageId, strukturiert: e.strukturiert }))] });
    // Ohne Bewertung (z. B. seelisch vor dem Screening) bzw. bei fehlgeschlagener Prüfung: statisch.
    if (!nachher.state || nachher.fehlgeschlagen) return statischerNotfallZustand(kontext, formData);
    return nachher.state;
  } catch {
    return statischerNotfallZustand(kontext, formData);
  }
}
