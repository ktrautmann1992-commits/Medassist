import "server-only";
import { db } from "../db";

/**
 * REQ-405: Einwilligungen für Foto- und Sprachverarbeitung (DSGVO Art. 9) je Nutzer, mit
 * Textversion, Zeitpunkt und Widerruf. Der Server erzwingt sie bei jeder Verarbeitung.
 */
export type MedienZweck = "FOTO_VERARBEITUNG" | "SPRACH_VERARBEITUNG";

export const EINWILLIGUNG: Record<MedienZweck, { version: string; titel: string; text: string }> = {
  FOTO_VERARBEITUNG: {
    version: "foto-0.1",
    titel: "Einwilligung Fotos",
    text:
      "Ich willige ein, dass Fotos der betroffenen Körperstelle zu diesem Fall gespeichert und angezeigt werden. Bildmetadaten (z. B. Aufnahmeort/GPS) werden vor dem Hochladen entfernt und vom Server geprüft. Ich kann die Einwilligung jederzeit widerrufen und Fotos löschen.",
  },
  SPRACH_VERARBEITUNG: {
    version: "sprache-0.1",
    titel: "Einwilligung Sprachaufnahme",
    text:
      "Ich willige ein, dass meine Sprachaufnahme an den konfigurierten Spracherkennungsdienst übermittelt und in Text umgewandelt wird. Die Aufnahme wird danach sofort gelöscht; gespeichert wird nur der von mir geprüfte Text. Ich kann die Einwilligung jederzeit widerrufen.",
  },
};

export function istMedienZweck(z: unknown): z is MedienZweck {
  return z === "FOTO_VERARBEITUNG" || z === "SPRACH_VERARBEITUNG";
}

/** Aktive (nicht widerrufene) Einwilligung oder `null`. */
export async function aktiveEinwilligung(nutzerId: string, zweck: MedienZweck): Promise<{ erteiltAm: Date; textVersion: string } | null> {
  return db().einwilligung.findFirst({
    where: { nutzerId, zweck, widerrufenAm: null, profilId: null },
    orderBy: { erteiltAm: "desc" },
    select: { erteiltAm: true, textVersion: true },
  });
}

export async function erteileEinwilligung(nutzerId: string, zweck: MedienZweck): Promise<void> {
  if (await aktiveEinwilligung(nutzerId, zweck)) return;
  await db().einwilligung.create({ data: { nutzerId, zweck, textVersion: EINWILLIGUNG[zweck].version } });
}

export async function widerrufeEinwilligung(nutzerId: string, zweck: MedienZweck): Promise<void> {
  await db().einwilligung.updateMany({ where: { nutzerId, zweck, widerrufenAm: null }, data: { widerrufenAm: new Date() } });
}
