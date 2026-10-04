"use server";

import { AUDIO_TYPEN, basisMimeTyp, bereinigeJpeg, erkenneAudioTyp, jpegFehlerText, medienErlaubt, standardFragenkataloge, type AudioTyp } from "@medassist/core";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ladeFall, type FallDaten } from "@/lib/eingrenzung/fall";
import { fallKontext } from "@/lib/eingrenzung/kontext";
import { transkriptHash } from "@/lib/eingrenzung/schritt";
import { beanspruche, legeAuftragAn, raeumeAbgelaufeneAuftraegeAuf, setzeErgebnis, zuVieleAuftraege, type BeanspruchterAuftrag } from "@/lib/medien/auftrag";
import { loescheObjekte } from "@/lib/medien/aufraeumen";
import { aktiveEinwilligung, erteileEinwilligung, istMedienZweck, widerrufeEinwilligung, type MedienZweck } from "@/lib/medien/einwilligung";
import { MAX_FOTOS_JE_FALL } from "@/lib/medien/fotos";
import { objektSpeicher } from "@/lib/medien/speicher";
import { MAX_AUDIO_BYTES, MAX_FOTO_BYTES, neuerFotoSchluessel, UPLOAD_GUELTIG_S, type HochladeZiel } from "@/lib/medien/speicher-typen";
import { sttAnbieter } from "@/lib/medien/stt";

/**
 * REQ-405 – REQ-411: Server Actions für Einwilligungen, Foto-Upload und Sprachaufnahme (Weg 1).
 * Jede Action prüft selbst Sitzung, Fallzugriff (= Profilzugriff, REQ-316), den Ablauf
 * (Schnellcheck/Krisen-Screening vorher, keine Krise – REQ-401) und die Einwilligung.
 * Uploads gehen direkt vom Client in den Objektspeicher; hier kommen nur Referenzen an.
 */

const NICHT_GEFUNDEN = "Fall nicht gefunden.";
const FOTO_NICHT_GEFUNDEN = "Foto nicht gefunden.";
const ABLAUF = "Fotos und Sprachaufnahmen sind erst nach dem Warnzeichen-Schnellcheck möglich – und nicht nach einem Krisenhinweis.";
const AUFTRAG_UNGUELTIG = "Der Upload ist abgelaufen oder ungültig – bitte erneut versuchen.";
const ZU_VIELE = "Zu viele Uploads in kurzer Zeit – bitte später erneut versuchen.";
const ZU_VIELE_FOTOS = `Höchstens ${MAX_FOTOS_JE_FALL} Fotos je Fall.`;
const FEHLER = "Das hat leider nicht geklappt – bitte erneut versuchen.";

export type MedienErgebnis<T = object> = ({ ok: true } & T) | { ok: false; fehler: string };

const KEINE_EINWILLIGUNG: Record<MedienZweck, string> = {
  FOTO_VERARBEITUNG: "Für Fotos ist Ihre Einwilligung nötig. Bitte erteilen Sie sie zuerst.",
  SPRACH_VERARBEITUNG: "Für die Sprachaufnahme ist Ihre Einwilligung nötig. Bitte erteilen Sie sie zuerst.",
};

type Nutzer = Awaited<ReturnType<typeof requireUser>>["nutzer"];

/** Zugriff, Weg 1 und Ablauf prüfen (REQ-316, REQ-401). */
async function medienFall(nutzer: Nutzer, fallId: unknown): Promise<{ ok: true; fall: FallDaten } | { ok: false; fehler: string }> {
  const fall = await ladeFall(nutzer, fallId);
  if (!fall || fall.weg !== "FREITEXT") return { ok: false, fehler: NICHT_GEFUNDEN };
  const { bewertung } = fallKontext(nutzer, fall);
  if (!medienErlaubt(bewertung.stand)) return { ok: false, fehler: ABLAUF };
  return { ok: true, fall };
}

// --- Einwilligungen (REQ-405) -------------------------------------------------

export async function aendereEinwilligung(formData: FormData): Promise<void> {
  const { nutzer } = await requireUser();
  const zweck = formData.get("zweck");
  if (!istMedienZweck(zweck)) return;
  if (formData.get("aktion") === "widerrufen") await widerrufeEinwilligung(nutzer.id, zweck);
  // Nur mit ausdrücklicher Bestätigung (Kontrollkästchen) – sonst keine Einwilligung.
  else if (formData.get("aktion") === "erteilen" && formData.get("bestaetigt") === "on") await erteileEinwilligung(nutzer.id, zweck);
  refresh();
}

// --- Fotos (REQ-409 – REQ-411) ----------------------------------------------------

const fotoVorbereitenSchema = z.strictObject({
  fallId: z.string().min(1).max(64),
  groesseBytes: z.number().int().min(1).max(MAX_FOTO_BYTES),
});

export async function bereiteFotoVor(eingabe: unknown): Promise<MedienErgebnis<{ auftragId: string; upload: HochladeZiel }>> {
  const { nutzer } = await requireUser();
  const e = fotoVorbereitenSchema.safeParse(eingabe);
  if (!e.success) {
    return { ok: false, fehler: `Das Foto ist zu groß oder ungültig (höchstens ${MAX_FOTO_BYTES / 1024 / 1024} MB nach der Verkleinerung).` };
  }
  const m = await medienFall(nutzer, e.data.fallId);
  if (!m.ok) return m;
  const speicher = objektSpeicher();
  if (!speicher) return { ok: false, fehler: "Der Foto-Upload ist in dieser Demo nicht aktiviert." };
  if (!(await aktiveEinwilligung(nutzer.id, "FOTO_VERARBEITUNG"))) return { ok: false, fehler: KEINE_EINWILLIGUNG.FOTO_VERARBEITUNG };
  if ((await db().foto.count({ where: { fallId: m.fall.id } })) >= MAX_FOTOS_JE_FALL) return { ok: false, fehler: ZU_VIELE_FOTOS };
  await raeumeAbgelaufeneAuftraegeAuf();
  if (await zuVieleAuftraege(nutzer.id, m.fall.id)) return { ok: false, fehler: ZU_VIELE };
  const a = await legeAuftragAn({ fallId: m.fall.id, nutzerId: nutzer.id, zweck: "FOTO", mimeType: "image/jpeg", groesseBytes: e.data.groesseBytes });
  const upload = await speicher.hochladeUrl({ schluessel: a.eingangsSchluessel, mimeType: a.mimeType, groesseBytes: a.groesseBytes, nutzerId: nutzer.id, gueltigS: UPLOAD_GUELTIG_S });
  return { ok: true, auftragId: a.id, upload };
}

const fotoRegistrierenSchema = z.strictObject({
  fallId: z.string().min(1).max(64),
  auftragId: z.string().min(1).max(64),
  koerperregion: z.string().max(64).nullable(),
});

/**
 * Gemeinsamer Rahmen für Registrierung/Transkription (QA M5): Ein **eigener** offener Auftrag
 * wird immer zuerst beansprucht; das Eingangsobjekt wird danach in **jedem** Fall gelöscht –
 * auch bei Ablauf, fremdem/ungültigem Fall, Krise, fehlender Einwilligung oder Fehlern.
 */
async function mitAuftrag<T extends object>(
  nutzer: Nutzer,
  fallId: string,
  auftragId: string,
  zweck: "FOTO" | "AUDIO",
  arbeit: (a: BeanspruchterAuftrag, fall: FallDaten) => Promise<MedienErgebnis<T>>,
): Promise<MedienErgebnis<T>> {
  const auftrag = await beanspruche(nutzer.id, auftragId, zweck);
  if (!auftrag) return { ok: false, fehler: AUFTRAG_UNGUELTIG };
  const speicher = objektSpeicher();
  const abweisen = async (grund: string, fehler: string): Promise<MedienErgebnis<T>> => {
    await setzeErgebnis(auftrag.id, `abgelehnt:${grund}`).catch(() => undefined);
    return { ok: false, fehler };
  };
  try {
    if (auftrag.abgelaufen) return await abweisen("abgelaufen", AUFTRAG_UNGUELTIG);
    if (auftrag.fallId !== fallId) return await abweisen("fall", AUFTRAG_UNGUELTIG);
    const m = await medienFall(nutzer, fallId);
    if (!m.ok) return await abweisen("ablauf", m.fehler);
    return await arbeit(auftrag, m.fall);
  } catch {
    return await abweisen("fehler", FEHLER).catch(() => ({ ok: false as const, fehler: FEHLER }));
  } finally {
    // Datensparsamkeit: Eingangsobjekte (Foto-Rohdaten, Audio) nie aufbewahren.
    await speicher?.loesche(auftrag.eingangsSchluessel).catch(() => undefined);
  }
}

/**
 * REQ-409 (QA M5): Erst nach eigener Verarbeitung registrieren – Eingangsobjekt lesen, Größe
 * prüfen und das JPEG **serverseitig neu schreiben** (`bereinigeJpeg`: nur Tabellen, Bildkopf
 * und Bilddaten, kanonisches JFIF-APP0; alle APPn/COM verworfen). Gespeichert wird nur dieses
 * neue Byte-Abbild unter einem neuen zufälligen Schlüssel; das Eingangsobjekt wird immer gelöscht.
 * Das Limit von 20 Fotos je Fall wird hier erneut geprüft – in einer Transaktion mit Zeilensperre
 * auf den Fall (`SELECT … FOR UPDATE`), damit parallele Registrierungen es nicht überschreiten.
 */
export async function registriereFoto(eingabe: unknown): Promise<MedienErgebnis<{ fotoId: string }>> {
  const { nutzer } = await requireUser();
  const e = fotoRegistrierenSchema.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: AUFTRAG_UNGUELTIG };
  const speicher = objektSpeicher();
  if (!speicher) return { ok: false, fehler: "Der Foto-Upload ist in dieser Demo nicht aktiviert." };
  const region = e.data.koerperregion ? standardFragenkataloge().koerperkarte.regionenById.get(e.data.koerperregion) : null;
  if (e.data.koerperregion && !region) return { ok: false, fehler: "Unbekannte Körperregion." };

  const r = await mitAuftrag<{ fotoId: string }>(nutzer, e.data.fallId, e.data.auftragId, "FOTO", async (auftrag, fall) => {
    const ablehnen = async (grund: string, fehler: string) => {
      await setzeErgebnis(auftrag.id, `abgelehnt:${grund}`);
      return { ok: false as const, fehler };
    };
    // Einwilligung erneut prüfen (Widerruf zwischen Vorbereitung und Registrierung, RISK-047).
    if (!(await aktiveEinwilligung(nutzer.id, "FOTO_VERARBEITUNG"))) return ablehnen("einwilligung", KEINE_EINWILLIGUNG.FOTO_VERARBEITUNG);
    const roh = await speicher.lese(auftrag.eingangsSchluessel, MAX_FOTO_BYTES);
    if (roh.art === "fehlt") return ablehnen("fehlt", "Das Foto ist nicht angekommen – bitte erneut hochladen.");
    if (roh.art === "zu_gross" || roh.daten.length !== auftrag.groesseBytes) return ablehnen("groesse", "Das Foto hat nicht die angekündigte Größe und wurde abgelehnt und gelöscht.");
    const bild = bereinigeJpeg(roh.daten);
    if (!bild.ok) return ablehnen(bild.grund, jpegFehlerText(bild));

    const schluessel = neuerFotoSchluessel();
    await speicher.schreibe(schluessel, bild.daten, "image/jpeg");
    let fotoId: string | null = null;
    try {
      fotoId = await db().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Fall" WHERE "id" = ${fall.id} FOR UPDATE`;
        if ((await tx.foto.count({ where: { fallId: fall.id } })) >= MAX_FOTOS_JE_FALL) return null;
        const foto = await tx.foto.create({
          data: {
            fallId: fall.id,
            hochgeladenVonId: nutzer.id,
            speicherSchluessel: schluessel,
            mimeType: "image/jpeg",
            groesseBytes: bild.daten.length,
            koerperregion: region?.id ?? null,
            metadatenEntferntAm: new Date(),
          },
          select: { id: true },
        });
        return foto.id;
      });
    } finally {
      // Ohne Datensatz kein Objekt (Limit erreicht oder Fehler).
      if (!fotoId) await speicher.loesche(schluessel).catch(() => undefined);
    }
    if (!fotoId) return ablehnen("limit", ZU_VIELE_FOTOS);
    await setzeErgebnis(auftrag.id, "angenommen");
    return { ok: true, fotoId };
  });
  if (r.ok) refresh();
  return r;
}

/** REQ-410: Foto löschen (Objekt und Datensatz) – nur bei Zugriff auf den Fall. */
export async function loescheFoto(_vorher: MedienErgebnis, formData: FormData): Promise<MedienErgebnis> {
  const { nutzer } = await requireUser();
  const fotoId = formData.get("fotoId");
  if (typeof fotoId !== "string" || !fotoId || fotoId.length > 64) return { ok: false, fehler: FOTO_NICHT_GEFUNDEN };
  const foto = await db().foto.findUnique({ where: { id: fotoId }, select: { id: true, fallId: true, speicherSchluessel: true } });
  // Zugriff über den Fall (= Profilzugriff); fremd/unbekannt ⇒ keine Auskunft, keine Wirkung.
  const fall = foto ? await ladeFall(nutzer, foto.fallId) : null;
  if (!foto || !fall) return { ok: false, fehler: FOTO_NICHT_GEFUNDEN };
  // REQ-414: Erst das Speicherobjekt, dann der Datensatz – schlägt das Löschen im Speicher fehl,
  // bleibt der Datensatz (erneut löschbar) und es entsteht kein verwaistes Objekt.
  const speicher = objektSpeicher();
  if (speicher && (await loescheObjekte(speicher, [foto.speicherSchluessel])).length) return { ok: false, fehler: FEHLER };
  await db().foto.deleteMany({ where: { id: foto.id } });
  refresh();
  return { ok: true };
}

// --- Sprachaufnahme (REQ-406, REQ-407) ------------------------------------------

const audioVorbereitenSchema = z.strictObject({
  fallId: z.string().min(1).max(64),
  groesseBytes: z.number().int().min(1).max(MAX_AUDIO_BYTES),
  mimeType: z.string().max(100),
});

export async function bereiteAudioVor(eingabe: unknown): Promise<MedienErgebnis<{ auftragId: string; upload: HochladeZiel }>> {
  const { nutzer } = await requireUser();
  const e = audioVorbereitenSchema.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: `Die Aufnahme ist zu lang oder ungültig (höchstens ${MAX_AUDIO_BYTES / 1024 / 1024} MB).` };
  const mime = basisMimeTyp(e.data.mimeType);
  if (!(AUDIO_TYPEN as readonly string[]).includes(mime)) return { ok: false, fehler: "Dieses Aufnahmeformat wird nicht unterstützt." };
  const m = await medienFall(nutzer, e.data.fallId);
  if (!m.ok) return m;
  const speicher = objektSpeicher();
  if (!speicher || !sttAnbieter()) return { ok: false, fehler: "Die Sprachaufnahme ist in dieser Demo nicht aktiviert." };
  if (!(await aktiveEinwilligung(nutzer.id, "SPRACH_VERARBEITUNG"))) return { ok: false, fehler: KEINE_EINWILLIGUNG.SPRACH_VERARBEITUNG };
  await raeumeAbgelaufeneAuftraegeAuf();
  if (await zuVieleAuftraege(nutzer.id, m.fall.id)) return { ok: false, fehler: ZU_VIELE };
  const a = await legeAuftragAn({ fallId: m.fall.id, nutzerId: nutzer.id, zweck: "AUDIO", mimeType: mime, groesseBytes: e.data.groesseBytes });
  const upload = await speicher.hochladeUrl({ schluessel: a.eingangsSchluessel, mimeType: a.mimeType, groesseBytes: a.groesseBytes, nutzerId: nutzer.id, gueltigS: UPLOAD_GUELTIG_S });
  return { ok: true, auftragId: a.id, upload };
}

const transkribierenSchema = z.strictObject({ fallId: z.string().min(1).max(64), auftragId: z.string().min(1).max(64) });

/**
 * REQ-407: Transkribieren und das Audio **sofort löschen** (auch bei Fehlern). Zurück geht nur
 * das Roh-Transkript an den Client (zur Prüfung/Korrektur); gespeichert wird nur sein Hash.
 */
export async function transkribiere(eingabe: unknown): Promise<MedienErgebnis<{ auftragId: string; text: string }>> {
  const { nutzer } = await requireUser();
  const e = transkribierenSchema.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: AUFTRAG_UNGUELTIG };
  const speicher = objektSpeicher();
  const stt = sttAnbieter();
  // Ohne Speicher gibt es kein Eingangsobjekt; ohne STT wird der Auftrag trotzdem beansprucht und das Audio gelöscht.
  if (!speicher) return { ok: false, fehler: "Die Sprachaufnahme ist in dieser Demo nicht aktiviert." };
  return mitAuftrag<{ auftragId: string; text: string }>(nutzer, e.data.fallId, e.data.auftragId, "AUDIO", async (auftrag) => {
    const ablehnen = async (grund: string, fehler: string) => {
      await setzeErgebnis(auftrag.id, `abgelehnt:${grund}`);
      return { ok: false as const, fehler };
    };
    if (!stt) return ablehnen("stt_aus", "Die Sprachaufnahme ist in dieser Demo nicht aktiviert.");
    if (!(await aktiveEinwilligung(nutzer.id, "SPRACH_VERARBEITUNG"))) return ablehnen("einwilligung", KEINE_EINWILLIGUNG.SPRACH_VERARBEITUNG);
    const r = await speicher.lese(auftrag.eingangsSchluessel, MAX_AUDIO_BYTES);
    if (r.art !== "ok" || r.daten.length !== auftrag.groesseBytes) {
      return ablehnen("groesse", "Die Aufnahme ist nicht vollständig angekommen – bitte erneut aufnehmen.");
    }
    const typ = erkenneAudioTyp(r.daten);
    if (!typ || typ !== auftrag.mimeType) return ablehnen("typ", "Die Aufnahme hat ein unerwartetes Format und wurde gelöscht.");
    try {
      const { text } = await stt.transkribiere(r.daten, typ as AudioTyp);
      await setzeErgebnis(auftrag.id, "transkribiert", { transkriptHash: transkriptHash(text), sttAnbieter: stt.art });
      return { ok: true, auftragId: auftrag.id, text };
    } catch {
      return ablehnen("fehler", "Die Spracherkennung ist fehlgeschlagen – bitte erneut versuchen oder den Text eintippen.");
    }
  });
}
