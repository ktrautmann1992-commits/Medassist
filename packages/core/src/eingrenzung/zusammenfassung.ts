import type { Regelwerk } from "../regeln/laden";
import { anwendbareFragen, type AblaufStand } from "./ablauf";
import type { AntwortWert } from "./antwort";
import type { Gesammelt } from "./eingaben";
import { DAUER_EINHEIT_TEXT } from "./schema";
import type { Frage, Fragenkataloge } from "./typen";

/**
 * REQ-312: Strukturierte Zusammenfassung der Angaben in Patientensprache. Fachbegriffe
 * stammen ausschließlich aus den Daten (`fachbegriff`) – nichts wird erfunden. Es gibt
 * keine Diagnosen, Ursachen oder Fachrichtungen (folgen mit Meilenstein 6).
 */
export interface ZusammenfassungWert {
  text: string;
  /** Kursiv neben der Alltagssprache (`.term`), nur wenn in den Daten hinterlegt. */
  fachbegriff: string | null;
}

export interface ZusammenfassungEintrag {
  id: string;
  bezeichnung: string;
  werte: ZusammenfassungWert[];
  /** z. B. „ungeprüft“ für die Organsystem-Zuordnung. */
  hinweis?: string;
}

export interface ZusammenfassungAbschnitt {
  id: "krise" | "warnzeichen" | "region" | "angaben";
  titel: string;
  eintraege: ZusammenfassungEintrag[];
}

const KEINE_ANGABE: ZusammenfassungWert = { text: "keine Angabe", fachbegriff: null };

/** Zahl deutsch mit Dezimalkomma. */
function zahlDe(n: number): string {
  return String(n).replace(".", ",");
}

export function antwortText(frage: Frage, wert: AntwortWert): ZusammenfassungWert[] {
  if (wert.typ === "keine_angabe") return [KEINE_ANGABE];
  switch (frage.typ) {
    case "einfach": {
      if (wert.typ !== "einfach") return [KEINE_ANGABE];
      const o = frage.optionen.find((x) => x.id === wert.option);
      return o ? [{ text: o.bezeichnung, fachbegriff: o.fachbegriff }] : [KEINE_ANGABE];
    }
    case "mehrfach": {
      if (wert.typ !== "mehrfach") return [KEINE_ANGABE];
      if (wert.keine) return [{ text: frage.keineOption ?? "Nichts davon", fachbegriff: null }];
      const werte = frage.optionen.filter((o) => wert.optionen.includes(o.id)).map((o) => ({ text: o.bezeichnung, fachbegriff: o.fachbegriff }));
      return werte.length ? werte : [KEINE_ANGABE];
    }
    case "skala":
      return wert.typ === "skala" ? [{ text: `${wert.wert} von ${frage.max}`, fachbegriff: null }] : [KEINE_ANGABE];
    case "freitext":
      return wert.typ === "freitext" ? [{ text: wert.text, fachbegriff: null }] : [KEINE_ANGABE];
    case "dauer": {
      if (wert.typ !== "dauer") return [KEINE_ANGABE];
      const e = DAUER_EINHEIT_TEXT[wert.einheit];
      return [{ text: `seit ${wert.anzahl} ${wert.anzahl === 1 ? e.eins : e.seit}`, fachbegriff: null }];
    }
  }
}

export function erstelleZusammenfassung(
  k: Fragenkataloge,
  regelwerk: Regelwerk,
  g: Gesammelt,
  stand: AblaufStand,
): ZusammenfassungAbschnitt[] {
  const abschnitte: ZusammenfassungAbschnitt[] = [];

  if (stand.bereich === "PSYCHISCH" && g.krisenAntworten) {
    const alleNein = Object.values(g.krisenAntworten).every((a) => a === "nein");
    abschnitte.push({
      id: "krise",
      titel: "Fragen zu Ihrer Sicherheit",
      eintraege: [
        {
          id: "krise",
          bezeichnung: "Krisen-Screening",
          werte: [
            alleNein
              ? { text: "Alle Fragen mit „Nein“ beantwortet", fachbegriff: null }
              : { text: "Nicht alle Fragen mit „Nein“ beantwortet – Krisenhinweis", fachbegriff: null },
          ],
        },
      ],
    });
  }

  const warn: ZusammenfassungEintrag[] = [];
  if (g.symptome.length) {
    warn.push({
      id: "symptome",
      bezeichnung: "Angekreuzte Warnzeichen und Beschwerden",
      werte: g.symptome.map((s) => {
        const v = regelwerk.symptome.get(s);
        return { text: v?.bezeichnung ?? s, fachbegriff: v?.fachbegriff ?? null };
      }),
    });
  } else if (g.schnellcheckKeine) {
    warn.push({ id: "symptome", bezeichnung: "Warnzeichen", werte: [{ text: "Keines der abgefragten Warnzeichen angegeben", fachbegriff: null }] });
  }
  for (const [mid, werte] of Object.entries(g.messwerte)) {
    const m = regelwerk.messwerte.get(mid);
    warn.push({ id: `messwert.${mid}`, bezeichnung: m?.bezeichnung ?? mid, werte: werte.map((w) => ({ text: `${zahlDe(w)} ${m?.einheit ?? ""}`.trim(), fachbegriff: null })) });
  }
  if (warn.length) abschnitte.push({ id: "warnzeichen", titel: "Warnzeichen-Schnellcheck", eintraege: warn });

  if (stand.bereich === "KOERPERLICH" && g.region) {
    const r = k.koerperkarte.regionenById.get(g.region);
    if (r) {
      abschnitte.push({
        id: "region",
        titel: "Körperregion",
        eintraege: [
          { id: "region", bezeichnung: "Region", werte: [{ text: r.bezeichnung, fachbegriff: r.fachbegriff }] },
          {
            id: "organsysteme",
            bezeichnung: "Grobe Zuordnung zu Organsystemen",
            hinweis: "ungeprüft",
            werte: r.organsysteme.map((o) => {
              const s = k.koerperkarte.organsysteme.get(o);
              return { text: s?.bezeichnung ?? o, fachbegriff: s?.fachbegriff ?? null };
            }),
          },
        ],
      });
    }
  }

  const angaben = anwendbareFragen(k, stand)
    .filter((f) => Object.hasOwn(g.antworten, f.id))
    .map((f) => ({ id: f.id, bezeichnung: f.kurz, werte: antwortText(f, g.antworten[f.id]!) }));
  if (angaben.length) abschnitte.push({ id: "angaben", titel: "Ihre Angaben", eintraege: angaben });

  return abschnitte;
}
