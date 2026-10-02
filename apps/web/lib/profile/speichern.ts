import "server-only";
import type { GeprueftesProfil, ProfilNutzer } from "@medassist/core";
import { db } from "../db";
import { profilFelder, profilListen, type ProfilListen } from "./persistenz";

/**
 * Speichern von Profilen. Aufrufer (Server Actions) haben Sitzung, Rolle und
 * Zugriff bereits geprüft (REQ-116); hier wird nur noch geschrieben.
 */

export type NeuesProfilArt = "EIGEN" | "KIND" | "ARZT_PATIENT";

export async function legeProfilAn(nutzer: ProfilNutzer, art: NeuesProfilArt, daten: GeprueftesProfil): Promise<string> {
  const felder = profilFelder(daten, nutzer.rolle);
  const listen = profilListen(daten, nutzer.rolle);
  const jetzt = new Date();
  const verschachtelt = Object.fromEntries(
    Object.entries(listen).map(([k, zeilen]) => [k, { create: zeilen as object[] }]),
  ) as { [K in keyof ProfilListen]: { create: NonNullable<ProfilListen[K]> } };

  const profil = await db().patientenprofil.create({
    data: {
      ...felder,
      ...verschachtelt,
      angelegtVonId: nutzer.id,
      // REQ-100: eigenes Profil → Kontoinhaber (eindeutig per Unique-Index).
      kontoinhaberId: art === "EIGEN" ? nutzer.id : null,
      istKinderprofil: art === "KIND" || daten.kind !== null,
      // REQ-106: Sorgerechtsbestätigung mit Zeitpunkt und Eintrag `Sorgeberechtigung`.
      ...(art === "KIND"
        ? { sorgerechtBestaetigtAm: jetzt, sorgeberechtigte: { create: { nutzerId: nutzer.id, bestaetigtAm: jetzt } } }
        : {}),
    },
    select: { id: true },
  });
  return profil.id;
}

/** REQ-101: Skalare Felder aktualisieren, Listen vollständig ersetzen – in einer Transaktion. */
export async function aktualisiereProfil(nutzer: ProfilNutzer, profilId: string, daten: GeprueftesProfil): Promise<void> {
  const felder = profilFelder(daten, nutzer.rolle);
  const l = profilListen(daten, nutzer.rolle);
  const where = { profilId };
  await db().$transaction(async (tx) => {
    await tx.patientenprofil.update({ where: { id: profilId }, data: felder });
    await tx.vorerkrankung.deleteMany({ where });
    await tx.vorerkrankung.createMany({ data: l.vorerkrankungen.map((z) => ({ ...z, profilId })) });
    await tx.operation.deleteMany({ where });
    await tx.operation.createMany({ data: l.operationen.map((z) => ({ ...z, profilId })) });
    await tx.allergie.deleteMany({ where });
    await tx.allergie.createMany({ data: l.allergien.map((z) => ({ ...z, profilId })) });
    await tx.dauermedikation.deleteMany({ where });
    await tx.dauermedikation.createMany({ data: l.dauermedikation.map((z) => ({ ...z, profilId })) });
    await tx.impfung.deleteMany({ where });
    await tx.impfung.createMany({ data: l.impfungen.map((z) => ({ ...z, profilId })) });
    if (l.vorsorge) {
      await tx.vorsorgeuntersuchung.deleteMany({ where });
      await tx.vorsorgeuntersuchung.createMany({ data: l.vorsorge.map((z) => ({ ...z, profilId })) });
    }
    if (l.wachstum) {
      await tx.wachstumsmessung.deleteMany({ where });
      await tx.wachstumsmessung.createMany({ data: l.wachstum.map((z) => ({ ...z, profilId })) });
    }
    // REQ-114: nur vorhanden, wenn die Rolle ARZT ist (siehe `profilListen`).
    if (l.laborwerte) {
      await tx.laborwert.deleteMany({ where });
      await tx.laborwert.createMany({ data: l.laborwerte.map((z) => ({ ...z, profilId })) });
    }
  });
}
