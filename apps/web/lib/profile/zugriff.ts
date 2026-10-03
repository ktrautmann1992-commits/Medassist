import "server-only";
import { darfProfilZugreifen, type ProfilNutzer } from "@medassist/core";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { zuProfilAnsicht, type ProfilAnsicht } from "./ansicht";
import { profilFilter } from "./filter";

export { profilFilter };

/**
 * REQ-115: Einziger Weg, Profile zu laden. Abgefragt wird immer mit dem
 * Berechtigungsfilter (fremde Profile werden nie geladen); das Ergebnis wird
 * zusätzlich mit der zentralen Regel `darfProfilZugreifen` geprüft.
 * Fremde oder unbekannte IDs → 404 (keine Auskunft über die Existenz).
 */
const zugriffsFelder = {
  id: true,
  kontoinhaberId: true,
  angelegtVonId: true,
  istKinderprofil: true,
  sorgeberechtigte: { select: { nutzerId: true } },
} satisfies Prisma.PatientenprofilSelect;

function regelErfuellt(
  nutzer: ProfilNutzer,
  p: { kontoinhaberId: string | null; angelegtVonId: string; istKinderprofil: boolean; sorgeberechtigte: { nutzerId: string }[] },
) {
  return darfProfilZugreifen(nutzer, { ...p, sorgeberechtigteIds: p.sorgeberechtigte.map((s) => s.nutzerId) });
}

/** Für Server Actions (REQ-116): Zugriff prüfen, ohne Daten zu laden. `null` = kein Zugriff. */
export async function findeZugaenglichesProfil(nutzer: ProfilNutzer, id: string) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  const p = await db().patientenprofil.findFirst({ where: { AND: [{ id }, profilFilter(nutzer)] }, select: zugriffsFelder });
  return p && regelErfuellt(nutzer, p) ? { id: p.id, istKinderprofil: p.istKinderprofil } : null;
}

/** Vollständiges Profil für Ansicht und Bearbeiten; sonst 404. */
export async function ladeProfil(nutzer: ProfilNutzer, id: string): Promise<ProfilAnsicht> {
  if (id.length > 64) notFound();
  const istArzt = nutzer.rolle === "ARZT";
  const p = await db().patientenprofil.findFirst({
    where: { AND: [{ id }, profilFilter(nutzer)] },
    include: {
      sorgeberechtigte: { select: { nutzerId: true } },
      vorerkrankungen: { orderBy: { id: "asc" } },
      operationen: { orderBy: { id: "asc" } },
      allergien: { orderBy: { id: "asc" } },
      dauermedikation: { orderBy: { id: "asc" } },
      impfungen: { orderBy: { id: "asc" } },
      vorsorge: true,
      wachstum: { orderBy: { gemessenAm: "asc" } },
      // REQ-114: Laborwerte werden für Patienten gar nicht erst geladen.
      laborwerte: istArzt ? { orderBy: [{ gemessenAm: "desc" }, { parameter: "asc" }] } : false,
    },
  });
  if (!p || !regelErfuellt(nutzer, p)) notFound();
  return zuProfilAnsicht(p, nutzer);
}

/** Profil-Übersicht (Auswahl, Listen). `suche` filtert nach Vor-/Nachname. */
export async function ladeZugaenglicheProfile(nutzer: ProfilNutzer, suche?: string) {
  const s = suche?.trim().slice(0, 100);
  const profile = await db().patientenprofil.findMany({
    where: {
      AND: [
        profilFilter(nutzer),
        s
          ? { OR: [{ vorname: { contains: s, mode: "insensitive" } }, { nachname: { contains: s, mode: "insensitive" } }] }
          : {},
      ],
    },
    select: { ...zugriffsFelder, vorname: true, nachname: true, geburtsdatum: true },
    // Eigenes Profil zuerst, dann Kinder nach Alter (älteste zuerst) bzw. Patienten nach Name.
    orderBy:
      nutzer.rolle === "ARZT"
        ? [{ nachname: "asc" }, { vorname: "asc" }]
        : [{ istKinderprofil: "asc" }, { geburtsdatum: "asc" }],
    take: 500,
  });
  return profile
    .filter((p) => regelErfuellt(nutzer, p))
    .map((p) => ({
      id: p.id,
      vorname: p.vorname,
      nachname: p.nachname,
      geburtsdatum: p.geburtsdatum,
      istKinderprofil: p.istKinderprofil,
      istEigenesProfil: p.kontoinhaberId === nutzer.id,
    }));
}

export type ProfilUebersicht = Awaited<ReturnType<typeof ladeZugaenglicheProfile>>[number];

/**
 * REQ-204/REQ-215: Stammdaten für die Regel-Engine (Alter wird daraus serverseitig
 * berechnet). Gleicher Berechtigungsfilter wie alle Loader; `null` = kein Zugriff.
 */
export async function ladeProfilFuerRegeln(nutzer: ProfilNutzer, id: string) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  const p = await db().patientenprofil.findFirst({
    where: { AND: [{ id }, profilFilter(nutzer)] },
    select: {
      ...zugriffsFelder,
      vorname: true,
      nachname: true,
      geburtsdatum: true,
      schwangerschaft: true,
      sswBeiGeburtWochen: true,
      sswBeiGeburtTage: true,
    },
  });
  if (!p || !regelErfuellt(nutzer, p)) return null;
  return {
    id: p.id,
    vorname: p.vorname,
    nachname: p.nachname,
    istKinderprofil: p.istKinderprofil,
    geburtsdatum: p.geburtsdatum,
    schwangerschaft: p.schwangerschaft,
    sswBeiGeburtWochen: p.sswBeiGeburtWochen,
    sswBeiGeburtTage: p.sswBeiGeburtTage,
  };
}
