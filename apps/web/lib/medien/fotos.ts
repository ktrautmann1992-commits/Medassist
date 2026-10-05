import "server-only";
import { db } from "../db";
import { loescheObjekte } from "./aufraeumen";
import { objektSpeicher } from "./speicher";
import { DOWNLOAD_GUELTIG_S } from "./speicher-typen";

/**
 * REQ-410: Fotos eines (bereits zugriffsgeprüften) Falls mit frisch erzeugten, kurzlebigen
 * signierten Download-URLs. Aufrufer müssen den Fallzugriff vorher geprüft haben (`ladeFall`).
 */
export interface FotoAnsicht {
  id: string;
  url: string | null;
  erstelltAm: Date;
  koerperregion: string | null;
  groesseBytes: number;
}

export const MAX_FOTOS_JE_FALL = 20;

export async function ladeFotoAnsichten(fallId: string, nutzerId: string): Promise<FotoAnsicht[]> {
  const fotos = await db().foto.findMany({
    where: { fallId },
    orderBy: [{ erstelltAm: "asc" }, { id: "asc" }],
    select: { id: true, speicherSchluessel: true, mimeType: true, erstelltAm: true, koerperregion: true, groesseBytes: true },
    take: MAX_FOTOS_JE_FALL,
  });
  const speicher = objektSpeicher();
  return Promise.all(
    fotos.map(async (f) => ({
      id: f.id,
      url: speicher ? await speicher.ladeUrl({ schluessel: f.speicherSchluessel, mimeType: f.mimeType, nutzerId, gueltigS: DOWNLOAD_GUELTIG_S }).catch(() => null) : null,
      erstelltAm: f.erstelltAm,
      koerperregion: f.koerperregion,
      groesseBytes: f.groesseBytes,
    })),
  );
}

/**
 * REQ-414 (QA M5): Speicherobjekte (Fotos und Eingänge offener/alter Hochladeaufträge) der
 * angegebenen Fälle löschen – **vor** dem Löschen der Datensätze (Cascade von Fall, Profil oder
 * Konto entfernt sonst nur die Verweise, die Objekte blieben verwaist). Wirft, wenn ein Objekt
 * nicht gelöscht werden konnte; der Aufrufer bricht dann das Löschen der Datensätze ab.
 *
 * Im Prototyp gibt es noch keine Funktion zum Löschen von Fällen, Profilen oder Konten; jede
 * künftige Löschfunktion muss diese Funktion zuerst aufrufen (REQ-414).
 */
export async function loescheFallMedien(fallIds: readonly string[]): Promise<void> {
  const speicher = objektSpeicher();
  if (!speicher || fallIds.length === 0) return;
  const [fotos, auftraege] = await Promise.all([
    db().foto.findMany({ where: { fallId: { in: [...fallIds] } }, select: { speicherSchluessel: true } }),
    db().hochladeauftrag.findMany({ where: { fallId: { in: [...fallIds] } }, select: { eingangsSchluessel: true } }),
  ]);
  const fehler = await loescheObjekte(speicher, [...fotos.map((f) => f.speicherSchluessel), ...auftraege.map((a) => a.eingangsSchluessel)]);
  if (fehler.length) throw new Error(`${fehler.length} Speicherobjekt(e) konnten nicht gelöscht werden.`);
}
