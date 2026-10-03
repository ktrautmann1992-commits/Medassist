import "server-only";
import { erstelleZusammenfassung, initialen, sicheresAlter, standardFragenkataloge, standardRegelwerk, type ProfilNutzer } from "@medassist/core";
import { stichtagHeute } from "../profile/format";
import { anzeigeStatus, bewerteFall, ohneDringlichkeitText, statusText, type FallStatusWert } from "./auswertung";
import { alterMonate, type FallDaten } from "./fall";

/** Was für Bewertung und Anzeige gebraucht wird (Einzelfall und Fallliste). */
type FallFuerAnzeige = Pick<FallDaten, "bereich" | "profil" | "eingaben" | "status" | "dringlichkeit" | "abgeschlossenAm">;

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
    alterMonate: alterMonate(p.geburtsdatum, stichtag),
  });
  // QA B1b: gespeicherter Status nur Untergrenze – Maximum mit dem aus den Eingaben abgeleiteten.
  const anzeige = anzeigeStatus(
    { status: fall.status as FallStatusWert, dringlichkeit: fall.dringlichkeit },
    bewertung,
    Boolean(fall.abgeschlossenAm),
    fall.eingaben.length > 0,
  );
  return {
    anzeige: {
      ...anzeige,
      text: statusText(anzeige.status, anzeige.dringlichkeit),
      ohneDringlichkeit: ohneDringlichkeitText(bewertung),
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
    },
    fragenUngeprueft: kataloge.kataloge[fall.bereich].status !== "geprüft",
  };
}
