import { darfArztFelderSehen, type GeprueftesProfil, type Rolle } from "@medassist/core";

/**
 * Übersetzt geprüfte Profildaten in Prisma-Daten (rein, ohne Datenbank – testbar).
 *
 * REQ-114: Arzt-Felder (Nieren-/Leberfunktion, Laborwerte) werden nur bei Rolle
 * ARZT übernommen – auch wenn sie (z. B. durch einen Programmierfehler) in den
 * Daten stehen. Die Rolle stammt aus der Sitzung (REQ-116).
 * REQ-101: Listen werden beim Speichern vollständig ersetzt.
 */

export function profilFelder(d: GeprueftesProfil, rolle: Rolle) {
  const b = d.basis;
  const felder = {
    vorname: b.vorname,
    nachname: b.nachname,
    geburtsdatum: b.geburtsdatum,
    geschlecht: b.geschlecht,
    groesseCm: b.groesseCm ?? null,
    gewichtKg: b.gewichtKg ?? null,
    schwangerschaft: b.schwangerschaft,
    familienanamnese: b.familienanamnese ?? null,
    rauchen: b.rauchen,
    packungsjahre: b.packungsjahre ?? null,
    alkohol: b.alkohol,
    sport: b.sport,
    impfstatusNotiz: b.impfstatusNotiz ?? null,
  };
  const kind = d.kind
    ? {
        sswBeiGeburtWochen: d.kind.sswWochen ?? null,
        // Bei angegebener Woche ohne Tage gilt +0.
        sswBeiGeburtTage: d.kind.sswWochen != null ? (d.kind.sswTage ?? 0) : null,
        geburtsgewichtG: d.kind.geburtsgewichtG ?? null,
        einrichtung: d.kind.einrichtung ?? null,
        einrichtungName: d.kind.einrichtungName ?? null,
        klassenstufe: d.kind.klassenstufe ?? null,
        sprachsituation: d.kind.sprachsituation ?? null,
        sprachen: d.kind.sprachen,
      }
    : {};
  const arzt =
    d.arzt && darfArztFelderSehen(rolle) ? { nierenfunktion: d.arzt.nierenfunktion, leberfunktion: d.arzt.leberfunktion } : {};
  return { ...felder, ...kind, ...arzt };
}

export interface ProfilListen {
  vorerkrankungen: { bezeichnung: string; icd10Code: string | null }[];
  operationen: { bezeichnung: string; datum: Date | null }[];
  allergien: { typ: "ALLERGIE" | "UNVERTRAEGLICHKEIT"; ausloeser: string; reaktion: string | null }[];
  dauermedikation: { wirkstoff: string; staerke: string | null; dosierung: string | null }[];
  impfungen: { gegen: string; impfstoff: string | null; datum: Date | null; dosisNr: number | null }[];
  vorsorge?: {
    typ: GeprueftesKindVorsorge["typ"];
    durchgefuehrtAm: Date | null;
    ergebnis: "UNAUFFAELLIG" | "AUFFAELLIG" | "UNBEKANNT";
  }[];
  wachstum?: { gemessenAm: Date; groesseCm: number | null; gewichtKg: number | null; kopfumfangCm: number | null }[];
  laborwerte?: { parameter: string; wert: number; einheit: string; gemessenAm: Date }[];
}

type GeprueftesKindVorsorge = NonNullable<GeprueftesProfil["kind"]>["vorsorge"][number];

/** Nur die Listen, die für Rolle und Profilart geschrieben werden dürfen. */
export function profilListen(d: GeprueftesProfil, rolle: Rolle): ProfilListen {
  const b = d.basis;
  const listen: ProfilListen = {
    vorerkrankungen: b.vorerkrankungen.map((v) => ({ bezeichnung: v.bezeichnung, icd10Code: v.icd10Code ?? null })),
    operationen: b.operationen.map((o) => ({ bezeichnung: o.bezeichnung, datum: o.datum ?? null })),
    allergien: b.allergien.map((a) => ({ typ: a.typ, ausloeser: a.ausloeser, reaktion: a.reaktion ?? null })),
    dauermedikation: b.dauermedikation.map((m) => ({
      wirkstoff: m.wirkstoff,
      staerke: m.staerke ?? null,
      dosierung: m.dosierung ?? null,
    })),
    impfungen: b.impfungen.map((i) => ({
      gegen: i.gegen,
      impfstoff: i.impfstoff ?? null,
      datum: i.datum ?? null,
      dosisNr: i.dosisNr ?? null,
    })),
  };
  if (d.kind) {
    listen.vorsorge = d.kind.vorsorge.map((v) => ({
      typ: v.typ,
      durchgefuehrtAm: v.datum ?? null,
      ergebnis: v.ergebnis ?? "UNBEKANNT",
    }));
    listen.wachstum = d.kind.wachstum.map((w) => ({
      gemessenAm: w.gemessenAm,
      groesseCm: w.groesseCm ?? null,
      gewichtKg: w.gewichtKg ?? null,
      kopfumfangCm: w.kopfumfangCm ?? null,
    }));
  }
  if (d.arzt && darfArztFelderSehen(rolle)) {
    listen.laborwerte = d.arzt.laborwerte.map((l) => ({ ...l }));
  }
  return listen;
}
