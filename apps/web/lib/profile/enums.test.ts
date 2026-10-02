import * as core from "@medassist/core";
import { describe, expect, it } from "vitest";
import * as prisma from "@/generated/prisma/enums";

/** Die Aufzählungen in packages/core müssen den Prisma-Enums entsprechen. */
describe("Enums core ↔ Prisma", () => {
  it.each([
    [core.GESCHLECHTER, prisma.Geschlecht],
    [core.SCHWANGERSCHAFT_STATUS, prisma.SchwangerschaftsStatus],
    [core.ORGAN_FUNKTIONEN, prisma.OrganFunktion],
    [core.RAUCH_STATUS, prisma.RauchStatus],
    [core.ALKOHOL_KONSUM, prisma.AlkoholKonsum],
    [core.AKTIVITAETEN, prisma.Aktivitaet],
    [core.ALLERGIE_TYPEN, prisma.AllergieTyp],
    [core.VORSORGE_TYPEN, prisma.Vorsorge],
    [core.VORSORGE_ERGEBNISSE, prisma.VorsorgeErgebnis],
    [core.EINRICHTUNGEN, prisma.Einrichtung],
    [core.SPRACHSITUATIONEN, prisma.Sprachsituation],
    [core.ROLLEN, prisma.Rolle],
  ])("%j", (werte, prismaEnum) => {
    expect([...werte].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
