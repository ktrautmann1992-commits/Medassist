import "server-only";
import {
  bewerteEntwicklung,
  entwicklungsAlter,
  erstelleZusammenfassung,
  filtereEntwicklungNachRolle,
  initialen,
  MAX_ALTER_MONATE,
  naechsterSchritt,
  sicheresAlter,
  standardFragenkataloge,
  standardRegelwerk,
  type GefilterteEntwicklung,
  type ProfilNutzer,
} from "@medassist/core";
import { stichtagHeute } from "../profile/format";
import { anzeigeStatus, bewerteFall, ohneDringlichkeitText, statusText, type FallBewertung, type FallStatusWert } from "./auswertung";
import { ablaufAlterMonate, type FallDaten } from "./fall";

/** QA E4: ab diesem Entwicklungsalter wird im Entwicklungs-Check „Hilfe in Krisen“ angezeigt (Grenze ungeprüft). */
export const KRISENKONTAKTE_AB_MONATE = 120;

/** Was für Bewertung und Anzeige gebraucht wird (Einzelfall und Fallliste). */
type FallFuerAnzeige = Pick<FallDaten, "bereich" | "weg" | "profil" | "eingaben" | "status" | "dringlichkeit" | "abgeschlossenAm">;

/**
 * REQ-325/REQ-330: Entwicklungsergebnis (nur Weg 3, erst wenn alle Fragen beantwortet sind) –
 * aus den Eingaben berechnet und serverseitig nach Rolle gefiltert (REQ-328). `fehler` = die
 * Berechnung ist gescheitert ⇒ die Seite zeigt „Auswertung fehlgeschlagen“, nie „unauffällig“.
 */
export type EntwicklungAnzeige = { art: "ergebnis"; ergebnis: GefilterteEntwicklung } | { art: "offen" } | { art: "fehler" };

function entwicklungAnzeige(
  nutzer: ProfilNutzer,
  fall: FallFuerAnzeige,
  b: FallBewertung,
  alter: { monate: number | null; korrigiert: boolean },
): EntwicklungAnzeige | null {
  if (fall.bereich !== "ENTWICKLUNG") return null;
  try {
    const kataloge = standardFragenkataloge();
    if (naechsterSchritt(kataloge, b.stand).art !== "zusammenfassung") return { art: "offen" };
    const ergebnis = bewerteEntwicklung(kataloge.kataloge.ENTWICKLUNG, kataloge.entwicklung, b.gesammelt, alter);
    return { art: "ergebnis", ergebnis: filtereEntwicklungNachRolle(ergebnis, nutzer.rolle) };
  } catch {
    return { art: "fehler" };
  }
}

/** Gemeinsame Aufbereitung eines (zugänglichen) Falls für Assistent und Fallansicht. */
export function fallKontext(nutzer: ProfilNutzer, fall: FallFuerAnzeige) {
  const regelwerk = standardRegelwerk();
  const kataloge = standardFragenkataloge();
  const stichtag = stichtagHeute();
  const p = fall.profil;
  const bewertung = bewerteFall({
    regelwerk,
    kataloge,
    bereich: fall.bereich,
    profil: p,
    eingaben: fall.eingaben,
    rolle: nutzer.rolle,
    stichtag,
    alterMonate: ablaufAlterMonate(fall.bereich, p, stichtag),
    weg: fall.weg,
  });
  // QA B1b: gespeicherter Status nur Untergrenze – Maximum mit dem aus den Eingaben abgeleiteten.
  const anzeige = anzeigeStatus(
    { status: fall.status as FallStatusWert, dringlichkeit: fall.dringlichkeit },
    bewertung,
    Boolean(fall.abgeschlossenAm),
    fall.eingaben.length > 0,
  );
  const eAlter = fall.bereich === "ENTWICKLUNG" ? entwicklungsAlter(p, stichtag) : null;
  // QA E2: Ergebnis mit dem bei der Bereichsauswahl festgehaltenen Entwicklungsalter.
  const festAlter = bewertung.gesammelt.entwicklungsAlter ?? (eAlter ? { monate: eAlter.monate, korrigiert: eAlter.korrigiert } : { monate: null, korrigiert: false });
  const e = kataloge.entwicklung;
  const regressionAntwort = bewertung.gesammelt.antworten[e.pflichtfrageId];
  return {
    anzeige: {
      ...anzeige,
      text: statusText(anzeige.status, anzeige.dringlichkeit),
      // QA E8: im Entwicklungs-Check nur „keine akuten Warnzeichen“ – das Entwicklungsergebnis gilt unabhängig davon.
      ohneDringlichkeit:
        fall.bereich === "ENTWICKLUNG" ? ohneDringlichkeitText(bewertung).replace("Keine Warnzeichen erkannt", "Keine akuten Warnzeichen") : ohneDringlichkeitText(bewertung),
      offen: !fall.abgeschlossenAm && !bewertung.krise && anzeige.status !== "KRISENHINWEIS",
    },
    regelwerk,
    kataloge,
    bewertung,
    zusammenfassung: erstelleZusammenfassung(kataloge, regelwerk, bewertung.gesammelt, bewertung.stand),
    profilKopf: {
      name: `${p.vorname} ${p.nachname}`,
      initialen: initialen(p.vorname, p.nachname),
      alter: sicheresAlter(p.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt",
      istKinderprofil: p.istKinderprofil,
      // REQ-322: Entwicklungsalter nur nennen, wenn es korrigiert ist.
      ...(eAlter?.korrigiert ? { entwicklungsalter: eAlter.anzeige } : {}),
    },
    fragenUngeprueft: kataloge.kataloge[fall.bereich].status !== "geprüft",
    entwicklung: entwicklungAnzeige(nutzer, fall, bewertung, festAlter),
    /** Zusatzhinweise des Entwicklungs-Checks (QA E1, E4, E5). */
    entwicklungHinweise:
      fall.bereich === "ENTWICKLUNG"
        ? {
            // E1: „Ich bin mir nicht sicher“ bei der Regressionsfrage
            regressionUnsicher: Boolean(e.pflichtUnsicher && regressionAntwort?.typ === "mehrfach" && regressionAntwort.optionen.includes(e.pflichtUnsicher)),
            // E4: Bereich Verhalten gewählt oder Entwicklungsalter ab 120 Monaten (Grenze ungeprüft)
            krisenKontakte: Boolean(bewertung.gesammelt.bereiche?.includes("sozial")) || (festAlter.monate ?? 0) >= KRISENKONTAKTE_AB_MONATE,
            // E5: Profil inzwischen volljährig (Fall wird mit festgehaltenem Alter fortgeführt)
            volljaehrig: (eAlter?.chronologischMonate ?? 0) >= MAX_ALTER_MONATE,
          }
        : null,
  };
}
