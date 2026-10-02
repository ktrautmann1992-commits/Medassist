import {
  darfArztFelderSehen,
  isoTag,
  type AlkoholKonsum,
  type Aktivitaet,
  type AllergieTyp,
  type Einrichtung,
  type Geschlecht,
  type OrganFunktion,
  type RauchStatus,
  type Rolle,
  type SchwangerschaftsStatus,
  type Sprachsituation,
  type VorsorgeErgebnis,
  type VorsorgeTyp,
} from "@medassist/core";

/**
 * Serialisierbare Ansichtsdaten eines Profils (für Server-Seiten und Formulare).
 * Rein und testbar. REQ-114: Für Patienten enthält die Ansicht keine Arzt-Felder.
 *
 * Zahlen bleiben Strings in Punkt-Schreibweise (Decimal), Datumsangaben `YYYY-MM-DD`.
 */

type Dezimal = { toString(): string } | number | null;

/** Struktur, die der Loader liefert (Prisma-Ergebnis passt strukturell). */
export interface ProfilDatensatz {
  id: string;
  kontoinhaberId: string | null;
  istKinderprofil: boolean;
  vorname: string;
  nachname: string;
  geburtsdatum: Date;
  geschlecht: Geschlecht;
  groesseCm: Dezimal;
  gewichtKg: Dezimal;
  schwangerschaft: SchwangerschaftsStatus;
  nierenfunktion: OrganFunktion;
  leberfunktion: OrganFunktion;
  familienanamnese: string | null;
  rauchen: RauchStatus;
  packungsjahre: Dezimal;
  alkohol: AlkoholKonsum;
  sport: Aktivitaet;
  impfstatusNotiz: string | null;
  sswBeiGeburtWochen: number | null;
  sswBeiGeburtTage: number | null;
  geburtsgewichtG: number | null;
  einrichtung: Einrichtung | null;
  einrichtungName: string | null;
  klassenstufe: number | null;
  sprachsituation: Sprachsituation | null;
  sprachen: string[];
  sorgerechtBestaetigtAm: Date | null;
  vorerkrankungen: { icd10Code: string | null; bezeichnung: string }[];
  operationen: { bezeichnung: string; datum: Date | null }[];
  allergien: { typ: AllergieTyp; ausloeser: string; reaktion: string | null }[];
  dauermedikation: { wirkstoff: string; staerke: string | null; dosierung: string | null }[];
  impfungen: { gegen: string; impfstoff: string | null; datum: Date | null; dosisNr: number | null }[];
  vorsorge: { typ: VorsorgeTyp; durchgefuehrtAm: Date | null; ergebnis: VorsorgeErgebnis }[];
  wachstum: { gemessenAm: Date; groesseCm: Dezimal; gewichtKg: Dezimal; kopfumfangCm: Dezimal }[];
  laborwerte?: { parameter: string; wert: Dezimal; einheit: string; gemessenAm: Date }[];
}

const zahl = (d: Dezimal) => (d == null ? null : d.toString());
const tag = (d: Date | null) => (d ? isoTag(d) : null);

export function zuProfilAnsicht(p: ProfilDatensatz, nutzer: { id: string; rolle: Rolle }) {
  return {
    id: p.id,
    istKinderprofil: p.istKinderprofil,
    istEigenesProfil: p.kontoinhaberId !== null && p.kontoinhaberId === nutzer.id,
    vorname: p.vorname,
    nachname: p.nachname,
    geburtsdatum: isoTag(p.geburtsdatum),
    geschlecht: p.geschlecht,
    groesseCm: zahl(p.groesseCm),
    gewichtKg: zahl(p.gewichtKg),
    schwangerschaft: p.schwangerschaft,
    familienanamnese: p.familienanamnese,
    rauchen: p.rauchen,
    packungsjahre: zahl(p.packungsjahre),
    alkohol: p.alkohol,
    sport: p.sport,
    impfstatusNotiz: p.impfstatusNotiz,
    vorerkrankungen: p.vorerkrankungen.map((v) => ({ bezeichnung: v.bezeichnung, icd10Code: v.icd10Code })),
    operationen: p.operationen.map((o) => ({ bezeichnung: o.bezeichnung, datum: tag(o.datum) })),
    allergien: p.allergien.map((a) => ({ typ: a.typ, ausloeser: a.ausloeser, reaktion: a.reaktion })),
    dauermedikation: p.dauermedikation.map((m) => ({ wirkstoff: m.wirkstoff, staerke: m.staerke, dosierung: m.dosierung })),
    impfungen: p.impfungen.map((i) => ({ gegen: i.gegen, impfstoff: i.impfstoff, datum: tag(i.datum), dosisNr: i.dosisNr })),
    kind: p.istKinderprofil
      ? {
          sswWochen: p.sswBeiGeburtWochen,
          sswTage: p.sswBeiGeburtTage,
          geburtsgewichtG: p.geburtsgewichtG,
          einrichtung: p.einrichtung,
          einrichtungName: p.einrichtungName,
          klassenstufe: p.klassenstufe,
          sprachsituation: p.sprachsituation,
          sprachen: p.sprachen,
          sorgerechtBestaetigtAm: p.sorgerechtBestaetigtAm ? p.sorgerechtBestaetigtAm.toISOString() : null,
          vorsorge: p.vorsorge.map((v) => ({ typ: v.typ, datum: tag(v.durchgefuehrtAm), ergebnis: v.ergebnis })),
          wachstum: [...p.wachstum]
            .sort((a, b) => a.gemessenAm.getTime() - b.gemessenAm.getTime())
            .map((w) => ({
              gemessenAm: isoTag(w.gemessenAm),
              groesseCm: zahl(w.groesseCm),
              gewichtKg: zahl(w.gewichtKg),
              kopfumfangCm: zahl(w.kopfumfangCm),
            })),
        }
      : null,
    // REQ-114: nur für Ärzte.
    arzt: darfArztFelderSehen(nutzer.rolle)
      ? {
          nierenfunktion: p.nierenfunktion,
          leberfunktion: p.leberfunktion,
          laborwerte: (p.laborwerte ?? []).map((l) => ({
            parameter: l.parameter,
            wert: zahl(l.wert) ?? "",
            einheit: l.einheit,
            gemessenAm: isoTag(l.gemessenAm),
          })),
        }
      : null,
  };
}

export type ProfilAnsicht = ReturnType<typeof zuProfilAnsicht>;
