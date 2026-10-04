import {
  DRINGLICHKEITEN,
  ablaufStandAus,
  sammleEingaben,
  type AblaufStand,
  type Bereich,
  type DringlichkeitStufe,
  type Fragenkataloge,
  type Gesammelt,
  type GespeicherteEingabeRoh,
  type ProfilFuerRegeln,
  type Regelwerk,
  type Rolle,
} from "@medassist/core";
import { fehlgeschlagenState, type RegelPruefState } from "../regeln/form";
import { werteWarnzeichenAus } from "../regeln/auswertung";

/**
 * REQ-307, REQ-313, REQ-314: Bewertung eines Falls aus **allen** gespeicherten Eingaben –
 * rein und ohne Datenbank, damit testbar. Die Sicherheitslogik ist ausschließlich die der
 * Regel-Engine aus Meilenstein 3 (`werteWarnzeichenAus`: Teilauswertung, Sicherheitsnetz,
 * Fallback, Rollenfilter, Alter serverseitig aus dem Profil).
 */
export type FallStatusWert = "ENTWURF" | "IN_EINGRENZUNG" | "NOTFALLHINWEIS" | "KRISENHINWEIS" | "ABGESCHLOSSEN";

export interface FallBewertung {
  gesammelt: Gesammelt;
  stand: AblaufStand;
  /** Ergebnis der Regelprüfung (rollengefiltert) oder `null`, solange nichts zu prüfen ist. */
  state: RegelPruefState | null;
  krise: boolean;
  /** Höchster Red-Flag-Hinweis (NOTFALL/DRINGEND) oder `null`. */
  notfall: "NOTFALL" | "DRINGEND" | null;
  /** Verworfene oder nicht lesbare Angaben – nie „keine Warnzeichen“ melden. */
  unvollstaendig: boolean;
  /** Regelprüfung fehlgeschlagen – nur statischer Hinweis (REQ-220). */
  fehlgeschlagen: boolean;
}

export interface FallKontext {
  regelwerk: Regelwerk;
  kataloge: Fragenkataloge;
  bereich: Bereich;
  profil: ProfilFuerRegeln & { istKinderprofil: boolean };
  eingaben: readonly GespeicherteEingabeRoh[];
  rolle: Rolle;
  stichtag: Date;
  alterMonate: number | null;
  /** REQ-401: Weg des Falls – bei FREITEXT (Weg 1) gibt es den Schritt „Beschreibung“. */
  weg?: string;
}

export function bewerteFall(k: FallKontext): FallBewertung {
  const gesammelt = sammleEingaben(k.kataloge, k.regelwerk, k.bereich, k.eingaben);
  let state: RegelPruefState | null = null;
  if (gesammelt.bewertbar) {
    try {
      state = werteWarnzeichenAus(k.regelwerk, k.profil, gesammelt.regelEingabe, k.rolle, k.stichtag);
    } catch {
      // Konservativ: seelisch ⇒ Krisenverdacht, sonst „Prüfung fehlgeschlagen – 112“.
      state = fehlgeschlagenState(k.bereich === "PSYCHISCH");
    }
  }
  const e = state?.ergebnis;
  const fb = state?.fallback;
  const krise = Boolean(e?.krisenhinweis || e?.status === "KRISE" || fb?.krise);
  const notfall = e?.notfallhinweis?.dringlichkeit ?? fb?.notfall?.dringlichkeit ?? null;
  const stand = ablaufStandAus(k.bereich, gesammelt, {
    krise,
    notfallAktiv: notfall === "NOTFALL",
    kinderprofil: k.profil.istKinderprofil,
    alterMonate: k.alterMonate,
    mitBeschreibung: k.weg === "FREITEXT",
  });
  return {
    gesammelt,
    stand,
    state,
    krise,
    notfall,
    unvollstaendig: Boolean(state?.unvollstaendig) || gesammelt.ungueltig > 0 || gesammelt.uneindeutig,
    fehlgeschlagen: Boolean(fb) && !e,
  };
}

const STATUS_RANG: Record<FallStatusWert, number> = {
  ENTWURF: 0,
  IN_EINGRENZUNG: 1,
  ABGESCHLOSSEN: 2,
  NOTFALLHINWEIS: 3,
  KRISENHINWEIS: 4,
};

function hoehereDringlichkeit(a: DringlichkeitStufe | null, b: DringlichkeitStufe | null): DringlichkeitStufe | null {
  if (a === null) return b;
  if (b === null) return a;
  return DRINGLICHKEITEN.indexOf(a) <= DRINGLICHKEITEN.indexOf(b) ? a : b;
}

/**
 * REQ-314: Neuer Fallstatus – nie herabgestuft (Rang KRISENHINWEIS > NOTFALLHINWEIS > übrige).
 * Ein interner Fehler der Bewertung ändert den gespeicherten Status nicht – außer ein
 * Krisenverdacht (konservativ, der Ablauf endet dann ohnehin).
 */
export function neuerFallStatus(
  alt: { status: FallStatusWert; dringlichkeit: DringlichkeitStufe | null },
  b: FallBewertung,
  abgeschlossen: boolean,
  hatEingaben: boolean,
): { status: FallStatusWert; dringlichkeit: DringlichkeitStufe | null } {
  let status: FallStatusWert;
  let dringlichkeit: DringlichkeitStufe | null = null;
  if (b.fehlgeschlagen) {
    status = b.krise ? "KRISENHINWEIS" : alt.status;
    dringlichkeit = b.krise ? "NOTFALL" : null;
  } else {
    status = b.krise ? "KRISENHINWEIS" : b.notfall ? "NOTFALLHINWEIS" : abgeschlossen ? "ABGESCHLOSSEN" : hatEingaben ? "IN_EINGRENZUNG" : "ENTWURF";
    dringlichkeit = b.state?.ergebnis?.dringlichkeit ?? null;
  }
  return {
    status: STATUS_RANG[status] >= STATUS_RANG[alt.status] ? status : alt.status,
    dringlichkeit: hoehereDringlichkeit(alt.dringlichkeit, dringlichkeit),
  };
}

/** Hinweis neu oder höher eingestuft ⇒ Fokus auf den Hinweis (REQ-307). */
export function hinweisEskaliert(vorher: FallBewertung | null, nachher: FallBewertung): boolean {
  const rang = (b: FallBewertung | null) => (!b ? 0 : b.krise ? 3 : b.notfall === "NOTFALL" ? 2 : b.notfall === "DRINGEND" ? 1 : 0);
  return rang(nachher) > rang(vorher);
}

/**
 * QA B1b/REQ-314: Angezeigter Status – Maximum aus gespeichertem Wert (nur Untergrenze) und dem
 * aus allen Eingaben abgeleiteten Wert. So kann auch ein (theoretisch) verlorenes Update den
 * angezeigten Krisen-/Notfallstatus nie herabstufen.
 */
export function anzeigeStatus(
  gespeichert: { status: FallStatusWert; dringlichkeit: DringlichkeitStufe | null },
  b: FallBewertung,
  abgeschlossen: boolean,
  hatEingaben: boolean,
): { status: FallStatusWert; dringlichkeit: DringlichkeitStufe | null } {
  return neuerFallStatus(gespeichert, b, abgeschlossen, hatEingaben);
}

/** QA B7: Statustext für die Anzeige – bei DRINGEND neutral „Warnhinweis“, „Notfallhinweis“ nur bei NOTFALL. */
export function statusText(status: FallStatusWert, dringlichkeit: DringlichkeitStufe | null): string {
  switch (status) {
    case "ENTWURF":
      return "Entwurf – noch nicht begonnen";
    case "IN_EINGRENZUNG":
      return "In Bearbeitung";
    case "NOTFALLHINWEIS":
      return dringlichkeit === "NOTFALL" ? "Notfallhinweis" : "Warnhinweis";
    case "KRISENHINWEIS":
      return "Krisenhinweis – Ablauf beendet";
    case "ABGESCHLOSSEN":
      return "Abgeschlossen";
  }
}

/** QA B2: Text, wenn keine Dringlichkeit vorliegt – „keine Warnzeichen“ nur bei tatsächlich bewertetem Fall. */
export function ohneDringlichkeitText(b: FallBewertung): string {
  if (b.fehlgeschlagen) return "Prüfung offen";
  if (!b.state?.ergebnis) return "Noch nicht geprüft";
  return b.unvollstaendig ? "Prüfung unvollständig" : "Keine Warnzeichen erkannt (Demo-Regelsatz)";
}
