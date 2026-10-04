import {
  DAUER_EINHEIT_TEXT,
  MAX_BESCHREIBUNG,
  verfuegbareBereiche,
  type AntwortWert,
  type Fragenkataloge,
  type Gesammelt,
  type Regelwerk,
  type Rolle,
  type Schritt,
  type Bereich,
} from "@medassist/core";

/**
 * Serialisierbare Darstellung des aktuellen Schritts für die Client-Komponente. Texte je
 * Rolle/Profil: Arzt – Fremdanamnese (`textFremd`), Kinderprofil – an Sorgeberechtigte
 * (`textKind`), sonst `text` (REQ-310, REQ-311, REQ-221). Rein und testbar.
 */
/** QA R3-B2: Ziel (Portal) oberhalb der Seitenüberschrift für Hinweise aus dem Formular. */
export const VORRANG_ZIEL_ID = "vorrang-formular-ziel";

export interface OptionAnsicht {
  wert: string;
  bezeichnung: string;
  fachbegriff: string | null;
}

export type SchrittAnsicht =
  | { art: "krise"; fragen: { id: string; text: string }[]; fragenHinweis: string; ungeprueft: boolean }
  | {
      art: "schnellcheck";
      titel: string;
      text: string;
      hilfe: string;
      keineText: string;
      symptome: OptionAnsicht[];
      messwerte: { id: string; bezeichnung: string; einheit: string; min: number; max: number; ungeprueft: boolean }[];
    }
  | { art: "notfall_weiter" }
  | {
      /** REQ-402/REQ-407: freie Beschreibung (Weg 1) – Text oder korrigierbares Transkript. */
      art: "beschreibung";
      maxLaenge: number;
      vorher: { text: string; quelle: "text" | "sprache" } | null;
    }
  | {
      /** REQ-323: Bereichsauswahl des Entwicklungs-Checks (nur für das Entwicklungsalter angebotene Bereiche). */
      art: "bereiche";
      bereiche: { id: string; bezeichnung: string; beschreibung: string }[];
      gewaehlt: string[];
      /** QA E3: Bereiche mit beantworteten Fragen – nicht abwählbar. */
      gesperrt: string[];
    }
  | {
      art: "region";
      regionen: { id: string; bezeichnung: string; fachbegriff: string | null; formen: Fragenkataloge["koerperkarte"]["regionen"][number]["formen"] }[];
      viewBox: { breite: number; hoehe: number };
      ausgewaehlt: string | null;
    }
  | {
      art: "frage";
      id: string;
      /** REQ-323: Bereich des Entwicklungs-Checks (Bezeichnung) oder `null`. */
      gruppe: string | null;
      typ: "einfach" | "mehrfach" | "skala" | "freitext" | "dauer";
      text: string;
      hilfe: string | null;
      pflicht: boolean;
      optionen: OptionAnsicht[];
      keineOption: string | null;
      skala: { min: number; max: number; minText: string; maxText: string } | null;
      maxLaenge: number | null;
      einheiten: { wert: string; bezeichnung: string }[];
      maxAnzahl: number | null;
      vorher: AntwortWert | null;
    };

export function textFuer(rolle: Rolle, kinderprofil: boolean, t: { text: string; textKind: string; textFremd: string }): string {
  if (rolle === "ARZT") return t.textFremd;
  return kinderprofil ? t.textKind : t.text;
}

export function schrittAnsicht(
  k: Fragenkataloge,
  regelwerk: Regelwerk,
  bereich: Bereich,
  schritt: Schritt,
  g: Gesammelt,
  rolle: Rolle,
  kinderprofil: boolean,
  /** Ablauf-Alter (Entwicklungsalter im Entwicklungs-Check). */
  alterMonate: number | null = null,
): SchrittAnsicht | null {
  const katalog = k.kataloge[bereich];
  switch (schritt.art) {
    case "krise":
      return {
        art: "krise",
        fragen: regelwerk.fragen.map((f) => ({ id: f.id, text: textFuer(rolle, kinderprofil, f) })),
        fragenHinweis: regelwerk.fragenHinweis,
        ungeprueft: regelwerk.fragenStatus !== "geprüft",
      };
    case "schnellcheck": {
      const s = katalog.schnellcheck;
      return {
        art: "schnellcheck",
        titel: s.titel,
        text: textFuer(rolle, kinderprofil, s),
        hilfe: s.hilfe,
        keineText: s.keineText,
        symptome: s.symptome.map((o) => ({ wert: o.id, bezeichnung: o.bezeichnung, fachbegriff: o.fachbegriff })),
        messwerte: s.messwerte.map((m) => ({ id: m.id, bezeichnung: m.bezeichnung, einheit: m.einheit, min: m.min, max: m.max, ungeprueft: m.status !== "geprüft" })),
      };
    }
    case "notfall_weiter":
      return { art: "notfall_weiter" };
    case "beschreibung":
      return { art: "beschreibung", maxLaenge: MAX_BESCHREIBUNG, vorher: g.beschreibung ? { text: g.beschreibung.text, quelle: g.beschreibung.quelle } : null };
    case "region":
      return {
        art: "region",
        regionen: k.koerperkarte.regionen.map((r) => ({ id: r.id, bezeichnung: r.bezeichnung, fachbegriff: r.fachbegriff, formen: r.formen })),
        viewBox: k.koerperkarte.viewBox,
        ausgewaehlt: g.region,
      };
    case "bereiche":
      return {
        art: "bereiche",
        bereiche: verfuegbareBereiche(k.entwicklung, alterMonate).map((b) => ({ id: b.id, bezeichnung: b.bezeichnung, beschreibung: b.beschreibung })),
        gewaehlt: g.bereiche ?? [],
        gesperrt: [...new Set(Object.keys(g.antworten).flatMap((fid) => k.entwicklung.meta.get(fid)?.bereich ?? []))],
      };
    case "frage": {
      const f = schritt.frage;
      const optionen = f.typ === "einfach" || f.typ === "mehrfach" ? f.optionen.map((o) => ({ wert: o.id, bezeichnung: o.bezeichnung, fachbegriff: o.fachbegriff })) : [];
      return {
        art: "frage",
        id: f.id,
        gruppe: f.gruppe ? (k.entwicklung.bereicheById.get(f.gruppe)?.bezeichnung ?? null) : null,
        typ: f.typ,
        text: textFuer(rolle, kinderprofil, f),
        hilfe: f.hilfe,
        pflicht: f.pflicht,
        optionen,
        keineOption: f.typ === "mehrfach" ? f.keineOption : null,
        skala: f.typ === "skala" ? { min: f.min, max: f.max, minText: f.minText, maxText: f.maxText } : null,
        maxLaenge: f.typ === "freitext" ? f.maxLaenge : null,
        einheiten: f.typ === "dauer" ? f.einheiten.map((e) => ({ wert: e, bezeichnung: DAUER_EINHEIT_TEXT[e].mehr })) : [],
        maxAnzahl: f.typ === "dauer" ? f.maxAnzahl : null,
        vorher: Object.hasOwn(g.antworten, f.id) ? g.antworten[f.id]! : null,
      };
    }
    default:
      return null;
  }
}
