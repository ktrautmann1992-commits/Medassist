import "server-only";
import { db } from "../db";
import { raeumeAbgelaufeneAuf, type AufraeumErgebnis } from "./aufraeumen";
import { objektSpeicher } from "./speicher";
import { neuerEingangsSchluessel } from "./speicher-typen";

/**
 * REQ-411: Hochladeaufträge – serverseitig angelegt, an Nutzer und Fall gebunden, einmalig
 * verwendbar, mit kurzer Laufzeit und zufälligem Schlüssel.
 */
export const AUFTRAG_LAUFZEIT_MS = 10 * 60 * 1000;
/** Je Fall und Stunde. */
export const MAX_AUFTRAEGE_JE_STUNDE = 30;
/** QA M5: zusätzlich je Nutzer und Stunde (über alle Fälle – ein neuer Fall umgeht das Limit nicht). */
export const MAX_AUFTRAEGE_JE_NUTZER_STUNDE = 60;
/** Ein Transkript kann bis zu dieser Zeit nach der Aufnahme als Beschreibung abgeschickt werden. */
export const TRANSKRIPT_GUELTIG_MS = 6 * 60 * 60 * 1000;

export type Zweck = "FOTO" | "AUDIO";

export async function zuVieleAuftraege(nutzerId: string, fallId: string): Promise<boolean> {
  const seit = new Date(Date.now() - 60 * 60 * 1000);
  const [jeFall, jeNutzer] = await Promise.all([
    db().hochladeauftrag.count({ where: { fallId, erstelltAm: { gte: seit } } }),
    db().hochladeauftrag.count({ where: { nutzerId, erstelltAm: { gte: seit } } }),
  ]);
  return jeFall >= MAX_AUFTRAEGE_JE_STUNDE || jeNutzer >= MAX_AUFTRAEGE_JE_NUTZER_STUNDE;
}

export async function legeAuftragAn(p: { fallId: string; nutzerId: string; zweck: Zweck; mimeType: string; groesseBytes: number }) {
  return db().hochladeauftrag.create({
    data: { ...p, eingangsSchluessel: neuerEingangsSchluessel(), laeuftAbAm: new Date(Date.now() + AUFTRAG_LAUFZEIT_MS) },
    select: { id: true, eingangsSchluessel: true, mimeType: true, groesseBytes: true },
  });
}

function gueltigeId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}

export type BeanspruchterAuftrag = {
  id: string;
  fallId: string;
  eingangsSchluessel: string;
  mimeType: string;
  groesseBytes: number;
  /** `true`, wenn die Laufzeit beim Beanspruchen schon abgelaufen war (⇒ Aufrufer lehnt ab). */
  abgelaufen: boolean;
};

/**
 * Beansprucht einen **eigenen**, noch nicht verwendeten Auftrag atomar (einmalig) – bewusst
 * unabhängig von Fall und Ablauf (QA M5): Der Aufrufer muss danach in **jedem** Fall das
 * Eingangsobjekt löschen, auch wenn er wegen Ablauf, fremdem Fall oder Krise ablehnt. So bleibt
 * keine Aufnahme liegen. Fremde, unbekannte oder bereits verwendete Aufträge ⇒ `null`.
 */
export async function beanspruche(nutzerId: string, auftragId: unknown, zweck: Zweck): Promise<BeanspruchterAuftrag | null> {
  if (!gueltigeId(auftragId)) return null;
  const jetzt = new Date();
  const r = await db().hochladeauftrag.updateMany({ where: { id: auftragId, nutzerId, zweck, erledigtAm: null }, data: { erledigtAm: jetzt } });
  if (r.count !== 1) return null;
  const a = await db().hochladeauftrag.findUniqueOrThrow({
    where: { id: auftragId },
    select: { id: true, fallId: true, eingangsSchluessel: true, mimeType: true, groesseBytes: true, laeuftAbAm: true },
  });
  const { laeuftAbAm, ...rest } = a;
  return { ...rest, abgelaufen: laeuftAbAm <= jetzt };
}

/** REQ-408 (QA M5): Lokaler PUT nur, solange der Auftrag zum Schlüssel offen ist (eigener Nutzer, nicht erledigt, nicht abgelaufen). */
export async function auftragOffen(nutzerId: string, eingangsSchluessel: string): Promise<boolean> {
  const n = await db().hochladeauftrag.count({ where: { eingangsSchluessel, nutzerId, erledigtAm: null, laeuftAbAm: { gt: new Date() } } });
  return n === 1;
}

/**
 * REQ-414: Abgelaufene offene Aufträge schließen und ihre Eingangsobjekte löschen. Wird
 * opportunistisch bei jedem neuen Auftrag aufgerufen (Fehler werden verschluckt – das Aufräumen
 * darf einen Upload nicht verhindern; Restobjekte entfernt die Lebenszyklusregel, RISK-051).
 */
export async function raeumeAbgelaufeneAuftraegeAuf(): Promise<AufraeumErgebnis | null> {
  const speicher = objektSpeicher();
  if (!speicher) return null;
  return raeumeAbgelaufeneAuf(
    {
      finde: (jetzt, max) =>
        db().hochladeauftrag.findMany({
          where: { erledigtAm: null, laeuftAbAm: { lt: jetzt } },
          orderBy: { laeuftAbAm: "asc" },
          take: max,
          select: { id: true, eingangsSchluessel: true },
        }),
      schliesse: async (id, jetzt) =>
        (await db().hochladeauftrag.updateMany({ where: { id, erledigtAm: null, laeuftAbAm: { lt: jetzt } }, data: { erledigtAm: jetzt, ergebnis: "abgelaufen" } })).count === 1,
    },
    speicher,
  ).catch(() => null);
}

export async function setzeErgebnis(auftragId: string, ergebnis: string, extra: { transkriptHash?: string; sttAnbieter?: string } = {}) {
  await db().hochladeauftrag.update({ where: { id: auftragId }, data: { ergebnis, ...extra } });
}

/** REQ-407: Hash des Roh-Transkripts einer eigenen, transkribierten Aufnahme dieses Falls – sonst `null`. */
export async function ladeSprachTranskript(nutzerId: string, fallId: string, auftragId: unknown): Promise<{ transkriptHash: string } | null> {
  if (!gueltigeId(auftragId)) return null;
  const a = await db().hochladeauftrag.findFirst({
    where: {
      id: auftragId,
      nutzerId,
      fallId,
      zweck: "AUDIO",
      ergebnis: "transkribiert",
      transkriptHash: { not: null },
      erstelltAm: { gte: new Date(Date.now() - TRANSKRIPT_GUELTIG_MS) },
    },
    select: { transkriptHash: true },
  });
  return a?.transkriptHash ? { transkriptHash: a.transkriptHash } : null;
}
