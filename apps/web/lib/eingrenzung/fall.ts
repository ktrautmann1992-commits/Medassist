import "server-only";
import { berechneAlter, type Bereich, type ProfilNutzer } from "@medassist/core";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { profilFilter } from "../profile/filter";
import { regelErfuellt, zugriffsFelder } from "../profile/zugriff";

/**
 * REQ-316: Zugriff auf einen Fall genau dann, wenn Zugriff auf sein Profil besteht
 * (REQ-115). Abgefragt wird immer mit dem Berechtigungsfilter; das Ergebnis wird
 * zusätzlich mit `darfProfilZugreifen` geprüft. `null` = nicht gefunden / kein Zugriff
 * (keine Auskunft über die Existenz).
 */
export function fallFilter(nutzer: ProfilNutzer): Prisma.FallWhereInput {
  return { profil: profilFilter(nutzer) };
}

const profilFelder = {
  ...zugriffsFelder,
  vorname: true,
  nachname: true,
  geburtsdatum: true,
  schwangerschaft: true,
  sswBeiGeburtWochen: true,
  sswBeiGeburtTage: true,
} satisfies Prisma.PatientenprofilSelect;

const fallFelder = {
  id: true,
  art: true,
  weg: true,
  status: true,
  dringlichkeit: true,
  regelVersion: true,
  katalogVersion: true,
  erstelltAm: true,
  aktualisiertAm: true,
  abgeschlossenAm: true,
  profil: { select: profilFelder },
} satisfies Prisma.FallSelect;

function gueltigeId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}

export async function ladeFall(nutzer: ProfilNutzer, fallId: unknown) {
  if (!gueltigeId(fallId)) return null;
  const fall = await db().fall.findFirst({
    where: { AND: [{ id: fallId }, fallFilter(nutzer)] },
    select: {
      ...fallFelder,
      eingaben: { orderBy: [{ erstelltAm: "asc" }, { id: "asc" }], select: { frageId: true, strukturiert: true } },
    },
  });
  if (!fall || !regelErfuellt(nutzer, fall.profil)) return null;
  // Nur die Weg-2-Fälle dieses Meilensteins (geführt, körperlich/seelisch).
  if (fall.weg !== "GEFUEHRT" || (fall.art !== "KOERPERLICH" && fall.art !== "PSYCHISCH")) return null;
  return { ...fall, bereich: fall.art as Bereich };
}
export type FallDaten = NonNullable<Awaited<ReturnType<typeof ladeFall>>>;

/** REQ-317: Fälle aller zugänglichen Profile (neueste zuerst). */
export async function ladeFaelle(nutzer: ProfilNutzer) {
  const faelle = await db().fall.findMany({
    where: fallFilter(nutzer),
    // QA B1b: Eingaben mitladen – der angezeigte Status wird zusätzlich daraus abgeleitet.
    select: { ...fallFelder, eingaben: { orderBy: [{ erstelltAm: "asc" }, { id: "asc" }], select: { frageId: true, strukturiert: true } } },
    orderBy: [{ erstelltAm: "desc" }],
    take: 500,
  });
  return faelle
    .filter((f) => regelErfuellt(nutzer, f.profil) && f.weg === "GEFUEHRT" && (f.art === "KOERPERLICH" || f.art === "PSYCHISCH"))
    .map((f) => ({ ...f, bereich: f.art as Bereich }));
}

/** Alter in vollen Monaten (serverseitig aus dem Geburtsdatum, REQ-204) oder `null`. */
export function alterMonate(geburtsdatum: Date, stichtag: Date): number | null {
  try {
    return berechneAlter(geburtsdatum, stichtag).gesamtMonate;
  } catch {
    return null;
  }
}
