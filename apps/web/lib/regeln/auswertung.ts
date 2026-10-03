import {
  befundlageFuerProfil,
  ergebnisAusPruefung,
  filtereNachRolle,
  pruefeRegelEingabe,
  pruefeVorrangig,
  type Befundlage,
  type ProfilFuerRegeln,
  type Pruefergebnis,
  type RegelEingabeRoh,
  type Regelwerk,
  type Rolle,
} from "@medassist/core";
import { fehlgeschlagenState, krisenVerdacht, type NotfallFallback, type RegelPruefState } from "./form";

/**
 * REQ-210, REQ-213, REQ-219, REQ-220: Auswertung als reine Funktion (ohne Datenbank).
 * Leitprinzip: Ein Krisen- oder Notfallhinweis wird durch nichts unterdrückt –
 * - Eingabefehler: Teilauswertung, Feldfehler zusätzlich (REQ-219),
 * - unbekanntes/fremdes Profil: Auswertung mit unbekanntem Alter (alle altersabhängigen
 *   Regeln greifen), ohne Profildaten preiszugeben,
 * - interner Fehler: statischer Krisen-/Notfallhinweis (REQ-220).
 */
export interface AuswertungsAbhaengigkeiten {
  filter: typeof filtereNachRolle;
  ergebnisAus: typeof ergebnisAusPruefung;
  pruefe: typeof pruefeVorrangig;
}

const STANDARD: AuswertungsAbhaengigkeiten = { filter: filtereNachRolle, ergebnisAus: ergebnisAusPruefung, pruefe: pruefeVorrangig };

const EINGABE_FEHLER =
  "Einige Angaben waren ungültig oder mehrfach vorhanden: Ungültige wurden nicht berücksichtigt, mehrfache vorsichtig gewertet. Alle übrigen Angaben wurden geprüft.";
const PROFIL_FEHLT = "Profil nicht gefunden. Zur Sicherheit wurden Ihre Angaben ohne Alter geprüft (alle altersabhängigen Warnzeichen gelten).";

function fallbackAus(p: Pruefergebnis): NotfallFallback {
  const rf = p.redFlagDringlichkeit;
  return {
    krise: p.status === "KRISE",
    notfall: rf === "NOTFALL" || rf === "DRINGEND" ? { dringlichkeit: rf, zeitrahmen: p.redFlagZeitrahmen === "HEUTE" && rf === "DRINGEND" ? "HEUTE" : "SOFORT" } : null,
  };
}

export function werteWarnzeichenAus(
  regelwerk: Regelwerk,
  profil: ProfilFuerRegeln | null,
  roh: RegelEingabeRoh,
  rolle: Rolle,
  stichtag: Date,
  abh: AuswertungsAbhaengigkeiten = STANDARD,
): RegelPruefState {
  let pruefung: Pruefergebnis;
  let feldFehler: Record<string, string[]> = {};
  try {
    const eingabe = pruefeRegelEingabe(regelwerk, roh);
    feldFehler = eingabe.feldFehler;
    const befund: Befundlage = profil
      ? befundlageFuerProfil(profil, eingabe.daten, stichtag)
      : befundlageFuerProfil(
          { geburtsdatum: new Date(Number.NaN), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" },
          eingabe.daten,
          stichtag,
        );
    pruefung = abh.pruefe(regelwerk, befund);
  } catch {
    // Vor oder während der Regelprüfung: Zustand unbekannt → konservativ.
    let krise = true;
    try {
      krise = krisenVerdacht(roh);
    } catch {
      krise = true;
    }
    return fehlgeschlagenState(krise);
  }

  const unvollstaendig = Object.keys(feldFehler).length > 0 || pruefung.befundlageFehler.length > 0;
  const meldungen = [
    !profil && PROFIL_FEHLT,
    unvollstaendig && EINGABE_FEHLER,
  ].filter(Boolean) as string[];
  const basis: RegelPruefState = {
    ...(meldungen.length ? { fehler: meldungen.join(" ") } : {}),
    ...(Object.keys(feldFehler).length ? { feldFehler } : {}),
    ...(unvollstaendig ? { unvollstaendig: true } : {}),
    ...(!profil ? { profilUnbekannt: true } : {}),
  };

  try {
    return { ...basis, ergebnis: abh.filter(abh.ergebnisAus(pruefung), rolle) };
  } catch {
    // Nach festgestellter Krise/Red Flag: Hinweise trotzdem zeigen (REQ-220).
    return { ...basis, fehler: "Die Darstellung des Ergebnisses ist fehlgeschlagen.", fallback: fallbackAus(pruefung) };
  }
}
