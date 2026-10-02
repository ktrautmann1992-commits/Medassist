/**
 * Aufzählungen des Patientenprofils mit deutschen Bezeichnungen. Die Werte
 * entsprechen den Prisma-Enums in `apps/web/prisma/schema.prisma`
 * (Gleichheit wird in `apps/web/lib/profile/enums.test.ts` geprüft).
 */

export const GESCHLECHTER = ["WEIBLICH", "MAENNLICH", "DIVERS", "UNBEKANNT"] as const;
export type Geschlecht = (typeof GESCHLECHTER)[number];
export const GESCHLECHT_BEZEICHNUNG: Record<Geschlecht, string> = {
  WEIBLICH: "weiblich",
  MAENNLICH: "männlich",
  DIVERS: "divers",
  UNBEKANNT: "keine Angabe",
};

export const SCHWANGERSCHAFT_STATUS = ["NEIN", "SCHWANGER", "STILLEND", "UNBEKANNT"] as const;
export type SchwangerschaftsStatus = (typeof SCHWANGERSCHAFT_STATUS)[number];
export const SCHWANGERSCHAFT_BEZEICHNUNG: Record<SchwangerschaftsStatus, string> = {
  NEIN: "weder schwanger noch stillend",
  SCHWANGER: "schwanger",
  STILLEND: "stillend",
  UNBEKANNT: "keine Angabe",
};

export const ORGAN_FUNKTIONEN = [
  "NORMAL",
  "LEICHT_EINGESCHRAENKT",
  "MITTELGRADIG_EINGESCHRAENKT",
  "SCHWER_EINGESCHRAENKT",
  "UNBEKANNT",
] as const;
export type OrganFunktion = (typeof ORGAN_FUNKTIONEN)[number];
export const ORGAN_FUNKTION_BEZEICHNUNG: Record<OrganFunktion, string> = {
  NORMAL: "normal",
  LEICHT_EINGESCHRAENKT: "leicht eingeschränkt",
  MITTELGRADIG_EINGESCHRAENKT: "mittelgradig eingeschränkt",
  SCHWER_EINGESCHRAENKT: "schwer eingeschränkt",
  UNBEKANNT: "unbekannt",
};

export const RAUCH_STATUS = ["NIE", "EHEMALIG", "AKTUELL", "UNBEKANNT"] as const;
export type RauchStatus = (typeof RAUCH_STATUS)[number];
export const RAUCH_BEZEICHNUNG: Record<RauchStatus, string> = {
  NIE: "nie geraucht",
  EHEMALIG: "ehemals Raucher/in",
  AKTUELL: "raucht aktuell",
  UNBEKANNT: "keine Angabe",
};

export const ALKOHOL_KONSUM = ["KEIN", "GELEGENTLICH", "REGELMAESSIG", "UNBEKANNT"] as const;
export type AlkoholKonsum = (typeof ALKOHOL_KONSUM)[number];
export const ALKOHOL_BEZEICHNUNG: Record<AlkoholKonsum, string> = {
  KEIN: "kein Alkohol",
  GELEGENTLICH: "gelegentlich",
  REGELMAESSIG: "regelmäßig",
  UNBEKANNT: "keine Angabe",
};

export const AKTIVITAETEN = ["KAUM", "GELEGENTLICH", "REGELMAESSIG", "UNBEKANNT"] as const;
export type Aktivitaet = (typeof AKTIVITAETEN)[number];
export const AKTIVITAET_BEZEICHNUNG: Record<Aktivitaet, string> = {
  KAUM: "kaum Sport",
  GELEGENTLICH: "gelegentlich",
  REGELMAESSIG: "regelmäßig",
  UNBEKANNT: "keine Angabe",
};

export const ALLERGIE_TYPEN = ["ALLERGIE", "UNVERTRAEGLICHKEIT"] as const;
export type AllergieTyp = (typeof ALLERGIE_TYPEN)[number];
export const ALLERGIE_TYP_BEZEICHNUNG: Record<AllergieTyp, string> = {
  ALLERGIE: "Allergie",
  UNVERTRAEGLICHKEIT: "Unverträglichkeit",
};

/** CLAUDE.md §3a: U1–U9 (inkl. U7a) und J1. */
export const VORSORGE_TYPEN = ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U7A", "U8", "U9", "J1"] as const;
export type VorsorgeTyp = (typeof VORSORGE_TYPEN)[number];
export const VORSORGE_BEZEICHNUNG: Record<VorsorgeTyp, string> = {
  U1: "U1",
  U2: "U2",
  U3: "U3",
  U4: "U4",
  U5: "U5",
  U6: "U6",
  U7: "U7",
  U7A: "U7a",
  U8: "U8",
  U9: "U9",
  J1: "J1",
};

export const VORSORGE_ERGEBNISSE = ["UNAUFFAELLIG", "AUFFAELLIG", "UNBEKANNT"] as const;
export type VorsorgeErgebnis = (typeof VORSORGE_ERGEBNISSE)[number];
export const VORSORGE_ERGEBNIS_BEZEICHNUNG: Record<VorsorgeErgebnis, string> = {
  UNAUFFAELLIG: "unauffällig",
  AUFFAELLIG: "auffällig",
  UNBEKANNT: "Ergebnis nicht erfasst",
};

export const EINRICHTUNGEN = ["KEINE", "KRIPPE", "KITA", "SCHULE", "SONSTIGE"] as const;
export type Einrichtung = (typeof EINRICHTUNGEN)[number];
export const EINRICHTUNG_BEZEICHNUNG: Record<Einrichtung, string> = {
  KEINE: "keine (zu Hause)",
  KRIPPE: "Krippe",
  KITA: "Kita / Kindergarten",
  SCHULE: "Schule",
  SONSTIGE: "Sonstige",
};

export const SPRACHSITUATIONEN = ["EINSPRACHIG", "MEHRSPRACHIG"] as const;
export type Sprachsituation = (typeof SPRACHSITUATIONEN)[number];
export const SPRACHSITUATION_BEZEICHNUNG: Record<Sprachsituation, string> = {
  EINSPRACHIG: "einsprachig",
  MEHRSPRACHIG: "mehrsprachig",
};
