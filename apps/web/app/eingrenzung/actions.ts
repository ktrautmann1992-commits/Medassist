"use server";

import { erlaubterSchritt, naechsterSchritt, standardFragenkataloge, standardRegelwerk } from "@medassist/core";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Prisma as DbPrisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { bewerteFall, hinweisEskaliert, neuerFallStatus, type FallStatusWert } from "@/lib/eingrenzung/auswertung";
import { alterMonate, ladeFall } from "@/lib/eingrenzung/fall";
import { notBewertung, SPEICHERN_FEHLGESCHLAGEN } from "@/lib/eingrenzung/notbewertung";
import { absichern, kriseSignal, signalIstNeu, verarbeiteSchritt, warnSignal, type NeueEingabe } from "@/lib/eingrenzung/schritt";
import type { RegelPruefState } from "@/lib/regeln/form";
import type { FormState } from "@/lib/forms/state";
import { stichtagHeute } from "@/lib/profile/format";
import { findeZugaenglichesProfil } from "@/lib/profile/zugriff";

/**
 * REQ-304, REQ-305, REQ-307, REQ-313 – REQ-316: Server Actions der geführten Eingrenzung.
 * Jede Action prüft selbst Sitzung, Rolle (aus der Sitzung) und Fallzugriff – bei **jedem**
 * Schritt. Der Schritt wird ausschließlich aus den gespeicherten Eingaben bestimmt.
 */

const NICHT_GEFUNDEN = "Fall nicht gefunden.";

/** REQ-304: Fall anlegen. Fremde/unbekannte Profil-ID ⇒ 404, es wird nichts angelegt. */
export async function starteFall(formData: FormData): Promise<void> {
  const { nutzer } = await requireUser();
  const profil = await findeZugaenglichesProfil(nutzer, String(formData.get("profilId") ?? ""));
  if (!profil) notFound();
  const art = formData.get("art");
  if (art !== "KOERPERLICH" && art !== "PSYCHISCH") notFound();
  const fall = await db().fall.create({
    data: {
      profilId: profil.id,
      erstelltVonId: nutzer.id,
      art,
      weg: "GEFUEHRT",
      status: "ENTWURF",
      regelVersion: standardRegelwerk().version,
      katalogVersion: standardFragenkataloge().version,
    },
    select: { id: true },
  });
  redirect(`/eingrenzung/${fall.id}`);
}

export type SchrittState = FormState & {
  /** QA N2: Krisen-/Notfallhinweise aus der Bewertung im Speicher, wenn nicht gespeichert werden konnte. */
  vorrang?: RegelPruefState;
};

/** QA N2: Wartezeit auf die Zeilensperre (ms, `EINGRENZUNG_SPERRE_MS`, Standard 5000) – danach Abbruch und ein Wiederholungsversuch. */
function sperreMs(): number {
  const n = Number(process.env.EINGRENZUNG_SPERRE_MS ?? 5000);
  return Number.isInteger(n) && n >= 100 && n <= 60_000 ? n : 5000;
}

/** Ergebnis der Transaktion – `redirect`/`refresh` erst danach (sie werfen bzw. gelten für die Antwort). */
type Ausgang = { art: "weiter"; ziel: string } | { art: "fehler"; state: SchrittState; neuLaden: boolean };

const ABGESCHLOSSEN = "Dieser Fall ist abgeschlossen – es werden keine weiteren Antworten angenommen.";

export async function beantworteSchritt(_vorher: SchrittState, formData: FormData): Promise<SchrittState> {
  const { nutzer } = await requireUser();
  // REQ-316: Zugriff (Profil) prüfen – fremde/unbekannte Fälle: keine Auskunft, nichts gelesen oder geschrieben.
  const fall = await ladeFall(nutzer, formData.get("fallId"));
  if (!fall) return { fehler: NICHT_GEFUNDEN };

  const regelwerk = standardRegelwerk();
  const kataloge = standardFragenkataloge();
  const stichtag = stichtagHeute();
  const kontext = {
    regelwerk,
    kataloge,
    bereich: fall.bereich,
    profil: fall.profil,
    rolle: nutzer.rolle,
    stichtag,
    alterMonate: alterMonate(fall.profil.geburtsdatum, stichtag),
  };

  /**
   * QA B1 (Lost Update): Alles Weitere läuft in **einer** Transaktion mit Zeilensperre auf den
   * Fall (`SELECT … FOR UPDATE`). Parallele Abgaben (zwei Tabs) werden so nacheinander
   * verarbeitet; jede sieht die Eingaben der vorherigen. Status und Dringlichkeit werden aus
   * **allen** Eingaben berechnet und nur gegenüber dem in der Transaktion gelesenen Stand
   * hochgestuft – nie herabgestuft (REQ-314).
   */
  const ausfuehren = () => db().$transaction(
    async (tx): Promise<Ausgang> => {
      // Ganzzahl aus geprüfter Konfiguration – keine Nutzereingabe.
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${sperreMs()}ms'`);
      await tx.$queryRaw`SELECT "id" FROM "Fall" WHERE "id" = ${fall.id} FOR UPDATE`;
      const ladeStand = () =>
        tx.fall.findUniqueOrThrow({
          where: { id: fall.id },
          select: {
            status: true,
            dringlichkeit: true,
            abgeschlossenAm: true,
            eingaben: { orderBy: [{ erstelltAm: "asc" }, { id: "asc" }], select: { frageId: true, strukturiert: true } },
          },
        });
      const akt = await ladeStand();
      const vorher = bewerteFall({ ...kontext, eingaben: akt.eingaben });

      const speichere = async (neueRoh: NeueEingabe[], abschliessbar: boolean) => {
        // QA N1: nur schemagültige (wieder lesbare) Eingaben speichern; Symptome bleiben immer erhalten.
        const neue = neueRoh.map(absichern).filter((x): x is NeueEingabe => x !== null);
        for (const e of neue) {
          await tx.eingabe.create({
            data: {
              fallId: fall.id,
              autorId: nutzer.id,
              typ: e.typ,
              inhalt: e.inhalt,
              frageId: e.frageId,
              koerperregion: e.koerperregion,
              strukturiert: e.strukturiert as unknown as DbPrisma.InputJsonValue,
            },
          });
        }
        // Alle Eingaben neu laden und auf diesem Stand bewerten.
        const danach = await ladeStand();
        const nachher = bewerteFall({ ...kontext, eingaben: danach.eingaben });
        const naechster = naechsterSchritt(kataloge, nachher.stand);
        const abgeschlossen = naechster.art === "beendet" || (abschliessbar && naechster.art === "zusammenfassung");
        const neu = neuerFallStatus(
          { status: danach.status as FallStatusWert, dringlichkeit: danach.dringlichkeit },
          nachher,
          abgeschlossen || Boolean(danach.abgeschlossenAm),
          danach.eingaben.length > 0,
        );
        await tx.fall.update({
          where: { id: fall.id },
          data: {
            status: neu.status,
            dringlichkeit: neu.dringlichkeit,
            // Version des Regelwerks der letzten Bewertung (REQ-205).
            ...(nachher.state?.ergebnis ? { regelVersion: nachher.state.ergebnis.regelwerkVersion } : {}),
            ...(abgeschlossen && !danach.abgeschlossenAm ? { abgeschlossenAm: new Date() } : {}),
          },
        });
        return nachher;
      };

      // QA B5: Ein Krisensignal (Krisenantwort ≠ „nein“) geht nie verloren – auch nicht bei
      // abgeschlossenem Fall oder abgewiesenem Schritt.
      const schrittId = formData.get("schritt");
      // Abgewiesene Abgabe: Krisensignal und angekreuzte Warnzeichen trotzdem sichern (Teil-Eingaben).
      const signale = (): NeueEingabe[] => {
        const warn = warnSignal(kataloge, regelwerk, fall.bereich, schrittId, formData);
        // QA N4: bereits bekannte Warnzeichen/Werte nicht erneut speichern.
        return [kriseSignal(kataloge, regelwerk, formData), warn && signalIstNeu(warn, vorher.gesammelt) ? warn : null].filter((x): x is NeueEingabe => x !== null);
      };

      if (akt.abgeschlossenAm || vorher.krise) {
        const s = vorher.krise ? [] : signale();
        if (s.length) await speichere(s, false);
        return { art: "fehler", state: { fehler: ABGESCHLOSSEN }, neuLaden: s.length > 0 };
      }

      const schritt = typeof schrittId === "string" ? erlaubterSchritt(kataloge, vorher.stand, schrittId) : null;
      // REQ-305: kein Überspringen von Schritten, kein Bearbeiten von Krisen-Screening/Schnellcheck.
      if (!schritt) {
        const s = signale();
        if (s.length) await speichere(s, false);
        return { art: "fehler", state: { fehler: "Dieser Schritt ist nicht möglich. Bitte laden Sie die Seite neu." }, neuLaden: s.length > 0 };
      }

      const v = verarbeiteSchritt(kataloge, regelwerk, fall.bereich, schritt, formData);
      const nachher = v.eingaben.length ? await speichere(v.eingaben, !v.fehler) : vorher;
      if (v.fehler) return { art: "fehler", state: { fehler: v.fehler, feldFehler: v.feldFehler }, neuLaden: v.eingaben.length > 0 };
      return { art: "weiter", ziel: `/eingrenzung/${fall.id}${hinweisEskaliert(vorher, nachher) ? "?hinweis=neu" : ""}` };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  // QA N2: Transaktionsabbruch (P2028/P2034, Sperr-Timeout, Datenbankfehler) ⇒ ein Wiederholungsversuch;
  // scheitert auch dieser, Bewertung im Speicher bzw. statischer Hinweis – nie eine Fehlerseite ohne Hinweis.
  let ausgang: Ausgang;
  try {
    ausgang = await ausfuehren();
  } catch {
    try {
      ausgang = await ausfuehren();
    } catch {
      return { fehler: SPEICHERN_FEHLGESCHLAGEN, vorrang: notBewertung(kontext, fall.eingaben, formData) };
    }
  }

  if (ausgang.art === "fehler") {
    // Gespeicherte Teil-Eingaben (z. B. Warnzeichen, Krisensignal) sofort oben anzeigen (REQ-307).
    if (ausgang.neuLaden) refresh();
    return ausgang.state;
  }
  redirect(ausgang.ziel);
}
