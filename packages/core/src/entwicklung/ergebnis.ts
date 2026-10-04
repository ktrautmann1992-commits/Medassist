import type { AntwortWert } from "../eingrenzung/antwort";
import type { Frage, Katalog } from "../eingrenzung/typen";
import { antwortText } from "../eingrenzung/zusammenfassung";
import { imMonatsBereich } from "./alter";
import { EINSTUFUNGEN, type Einstufung, type FrageRolle } from "./schema";
import type { EntwicklungsAnlaufstelle, EntwicklungsKatalog } from "./typen";

/**
 * REQ-324, REQ-325: Ergebnis des Entwicklungs-Checks je Bereich – rein, deterministisch,
 * aus deklarativen (ungeprüften) Einstufungen der Antwortoptionen. Konservativ: die höchste
 * Einstufung gewinnt, fehlende/unlesbare Antworten ⇒ „Abklärung empfohlen“. Die Software
 * stellt **keine** Entwicklungsstörung fest.
 */

export const HINWEIS_VORSORGE =
  "Der Entwicklungs-Check ersetzt keine Vorsorgeuntersuchung (U-Untersuchung). Kinder entwickeln sich unterschiedlich schnell – die normale Bandbreite ist groß. Die Software stellt keine Entwicklungsstörung fest.";

/** REQ-327: ärztlicher Hinweis – Diagnosegruppen nach Heilmittelkatalog werden bewusst nicht angegeben. */
export const ARZT_HINWEIS_ENTWICKLUNG =
  "Weitere Diagnostik und ggf. Heilmittelverordnung nach ärztlicher Beurteilung. Diagnosegruppen nach Heilmittelkatalog sind im Prototyp nicht hinterlegt (Quelle/Lizenz offen).";

/** QA E1: „Ich bin mir nicht sicher“ bei der Regressionsfrage wird wie ein Warnzeichen behandelt. */
export const REGRESSION_UNSICHER = "Sie sind unsicher, ob Ihr Kind Fähigkeiten wieder verlernt hat – bitte heute ärztlich abklären lassen (siehe Warnhinweis oben).";

export const EINSTUFUNG_TEXT: Record<Einstufung, string> = {
  ALTERSGERECHT: "Keine Auffälligkeit in den Demo-Fragen",
  BEOBACHTEN: "Beobachten",
  ABKLAERUNG: "Abklärung empfohlen",
};

export function hoechsteEinstufung(...e: Einstufung[]): Einstufung {
  return e.reduce<Einstufung>((a, b) => (EINSTUFUNGEN.indexOf(b) > EINSTUFUNGEN.indexOf(a) ? b : a), "ALTERSGERECHT");
}

export interface BereichAntwort {
  frageId: string;
  frage: string;
  rolle: FrageRolle | "pflicht";
  antwort: string;
  einstufung: Einstufung;
}

export interface BereichErgebnis {
  id: string;
  bezeichnung: string;
  einstufung: Einstufung;
  titel: string;
  textPatient: string;
  textArzt: string;
  /** Auffällige Angaben in Alltagssprache. */
  gruende: string[];
  anlaufstellen: EntwicklungsAnlaufstelle[];
  foerderideen: string[];
  /** Alle gestellten Fragen mit Antwort und Einstufung (ärztliche Übersicht). */
  uebersicht: BereichAntwort[];
  unvollstaendig: boolean;
}

export type RegressionAngabe = "ja" | "unsicher" | "nein" | null;

export interface EntwicklungsErgebnis {
  katalogVersion: string;
  alterMonate: number | null;
  korrigiert: boolean;
  regression: RegressionAngabe;
  hinweis: string;
  arztHinweis: string;
  anlaufstellenQuelle: string;
  bereiche: BereichErgebnis[];
}

export interface EntwicklungsEingaben {
  /** Letzte vollständige Antwort je Frage. */
  antworten: Readonly<Record<string, AntwortWert>>;
  /** Alle angegebenen Symptome (Vereinigung, auch aus dem Schnellcheck). */
  symptome: readonly string[];
  bereiche: readonly string[] | null;
}

interface Bewertet {
  antwort: string;
  einstufung: Einstufung;
  unvollstaendig: boolean;
}

/** Einstufung einer Antwort; unbekannt/fehlend ⇒ ABKLAERUNG (konservativ). */
function bewerteAntwort(frage: Frage | undefined, einstufung: ReadonlyMap<string, Einstufung>, wert: AntwortWert | undefined, keine: Einstufung): Bewertet {
  const fehlt: Bewertet = { antwort: "keine Angabe", einstufung: "ABKLAERUNG", unvollstaendig: true };
  if (!frage || !wert || wert.typ === "keine_angabe") return fehlt;
  const text = antwortText(frage, wert)
    .map((w) => w.text)
    .join(", ");
  if (wert.typ === "einfach" && frage.typ === "einfach") {
    const e = einstufung.get(wert.option);
    return e ? { antwort: text, einstufung: e, unvollstaendig: false } : fehlt;
  }
  if (wert.typ === "mehrfach" && frage.typ === "mehrfach") {
    if (wert.keine && wert.optionen.length === 0) return { antwort: text, einstufung: keine, unvollstaendig: false };
    const stufen = wert.optionen.map((o) => einstufung.get(o));
    if (stufen.length === 0 || stufen.some((s) => s === undefined)) return fehlt;
    return { antwort: text, einstufung: hoechsteEinstufung(...(stufen as Einstufung[])), unvollstaendig: false };
  }
  return fehlt;
}

export function bewerteEntwicklung(
  katalog: Katalog,
  e: EntwicklungsKatalog,
  eingaben: EntwicklungsEingaben,
  alter: { monate: number | null; korrigiert: boolean },
): EntwicklungsErgebnis {
  // --- Pflichtfrage Regression (gilt für jeden gewählten Bereich, REQ-324) ---
  const pflichtFrage = katalog.fragenById.get(e.pflichtfrageId);
  const pflichtMeta = e.meta.get(e.pflichtfrageId);
  const pflichtWert = Object.hasOwn(eingaben.antworten, e.pflichtfrageId) ? eingaben.antworten[e.pflichtfrageId] : undefined;
  const pflicht = bewerteAntwort(pflichtFrage, pflichtMeta?.einstufung ?? new Map(), pflichtWert, "ALTERSGERECHT");
  const symptomAngegeben = eingaben.symptome.includes(e.regressionSymptom);
  const pflichtOptionen = pflichtWert?.typ === "mehrfach" ? pflichtWert.optionen : [];
  const regression: RegressionAngabe = pflichtOptionen.includes(e.regressionSymptom)
    ? "ja"
    : e.pflichtUnsicher && pflichtOptionen.includes(e.pflichtUnsicher)
      ? "unsicher"
      : symptomAngegeben
        ? "ja"
        : pflichtWert?.typ === "mehrfach" && pflichtWert.keine
          ? "nein"
          : null;
  const global = hoechsteEinstufung(pflicht.einstufung, symptomAngegeben ? "ABKLAERUNG" : "ALTERSGERECHT");
  const globalGruende: string[] = [];
  if (regression === "ja") globalGruende.push("Verlust bereits erworbener Fähigkeiten angegeben – bitte heute ärztlich abklären (siehe Warnhinweis oben).");
  else if (regression === "unsicher") globalGruende.push(REGRESSION_UNSICHER);
  else if (pflicht.unvollstaendig) globalGruende.push("Die Pflichtfrage zum Verlust erworbener Fähigkeiten ist nicht beantwortet.");

  const pflichtUebersicht: BereichAntwort | null = pflichtFrage
    ? { frageId: pflichtFrage.id, frage: pflichtFrage.kurz, rolle: "pflicht", antwort: symptomAngegeben && pflicht.unvollstaendig ? "Warnzeichen angegeben" : pflicht.antwort, einstufung: global }
    : null;

  const gewaehlt = new Set(eingaben.bereiche ?? []);
  const bereiche = e.bereiche
    .filter((b) => gewaehlt.has(b.id))
    .map((b): BereichErgebnis => {
      const uebersicht: BereichAntwort[] = [];
      const gruende = [...globalGruende];
      let unvollstaendig = pflicht.unvollstaendig && !symptomAngegeben;
      let stufe: Einstufung = global;
      for (const fid of b.fragen) {
        const m = e.meta.get(fid);
        const wert = Object.hasOwn(eingaben.antworten, fid) ? eingaben.antworten[fid] : undefined;
        // QA E2: Jede beantwortete Frage zählt immer – der Altersbereich bestimmt nur, welche Fragen gestellt werden.
        if (!m || (wert === undefined && !imMonatsBereich(m.alter, alter.monate))) continue;
        const frage = katalog.fragenById.get(fid);
        const r = bewerteAntwort(frage, m.einstufung, wert, "ALTERSGERECHT");
        const kurz = frage?.kurz ?? fid;
        uebersicht.push({ frageId: fid, frage: kurz, rolle: m.rolle, antwort: r.antwort, einstufung: r.einstufung });
        stufe = hoechsteEinstufung(stufe, r.einstufung);
        if (r.unvollstaendig) {
          unvollstaendig = true;
          gruende.push(`${kurz}: keine Angabe – Angaben unvollständig.`);
        } else if (r.einstufung !== "ALTERSGERECHT") {
          gruende.push(`${kurz}: ${r.antwort}`);
        }
      }
      if (uebersicht.length === 0) {
        // Kein Bereich ohne gestellte Frage – konservativ statt „keine Auffälligkeit“.
        unvollstaendig = true;
        stufe = "ABKLAERUNG";
        gruende.push("Für dieses Alter wurden in diesem Bereich keine Fragen gestellt.");
      }
      const t = e.ergebnisse[stufe];
      return {
        id: b.id,
        bezeichnung: b.bezeichnung,
        einstufung: stufe,
        titel: t.titel,
        textPatient: t.textPatient,
        textArzt: t.textArzt,
        gruende,
        anlaufstellen: [...b.anlaufstellen],
        foerderideen: [...b.foerderideen],
        uebersicht: pflichtUebersicht ? [pflichtUebersicht, ...uebersicht] : uebersicht,
        unvollstaendig,
      };
    });

  return {
    katalogVersion: e.version,
    alterMonate: alter.monate,
    korrigiert: alter.korrigiert,
    regression,
    hinweis: HINWEIS_VORSORGE,
    arztHinweis: ARZT_HINWEIS_ENTWICKLUNG,
    anlaufstellenQuelle: e.anlaufstellenQuelle,
    bereiche,
  };
}
