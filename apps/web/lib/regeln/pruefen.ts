import "server-only";
import { standardRegelwerk, type ProfilNutzer } from "@medassist/core";
import { stichtagHeute } from "../profile/format";
import { ladeProfilFuerRegeln } from "../profile/zugriff";
import { fehlgeschlagenState, krisenVerdachtAusFormData, regelEingabeAusFormData, type RegelPruefState } from "./form";
import { werteWarnzeichenAus } from "./auswertung";

/**
 * REQ-215: Regelprüfung für ein Profil. Alter aus dem Profil (serverseitig), Auswertung
 * mit der Regel-Engine, Rollenfilter serverseitig (`werteWarnzeichenAus`). Ein fremdes
 * oder unbekanntes Profil wird nicht geladen (REQ-115) – die Angaben werden dann
 * konservativ ohne Alter geprüft. Es wird (noch) kein Fall gespeichert.
 */
export async function pruefeWarnzeichen(nutzer: ProfilNutzer, formData: FormData): Promise<RegelPruefState> {
  // S-2/REQ-220: Auch Fehler beim Laden des Regelwerks oder Lesen der Formulardaten führen
  // zu einem statischen Hinweis (Krisenhinweis, wenn Krisenangaben erkennbar sind).
  let regelwerk;
  let roh;
  try {
    regelwerk = standardRegelwerk();
    roh = regelEingabeAusFormData(formData);
  } catch {
    return fehlgeschlagenState(krisenVerdachtAusFormData(formData));
  }
  const profilId = formData.get("profilId");
  let profil = null;
  try {
    profil = typeof profilId === "string" ? await ladeProfilFuerRegeln(nutzer, profilId) : null;
  } catch {
    profil = null;
  }
  try {
    return werteWarnzeichenAus(regelwerk, profil, roh, nutzer.rolle, stichtagHeute());
  } catch {
    return fehlgeschlagenState(krisenVerdachtAusFormData(formData));
  }
}
