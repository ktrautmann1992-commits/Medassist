import { genutzteSymptome, imAltersbereich, werteAus } from "./bedingung";
import type { AlterAngabe, Befundlage } from "./befundlage";
import type { Anlaufstelle } from "./kontakte";
import type { Regelwerk } from "./laden";
import {
  DRINGLICHKEITEN,
  ZEITRAHMEN,
  type Antwort,
  type DringlichkeitStufe,
  type Quelle,
  type Regel,
  type RegelStatus,
  type Zeitrahmen,
} from "./schema";

/**
 * REQ-205, REQ-208 – REQ-210, REQ-218, REQ-219: Regel-Engine. Rein und deterministisch,
 * keine KI, keine Ein-/Ausgabe. Regeln haben immer Vorrang vor der KI (CLAUDE.md §7).
 *
 * Leitprinzip: Ein Krisen- oder Notfallhinweis wird durch nichts unterdrückt – auch nicht
 * durch fehlerhafte Eingaben. Ungültige Teile der Befundlage werden verworfen und als
 * `befundlageFehler` gemeldet; die übrigen Angaben werden trotzdem ausgewertet.
 */

export type Regelbereich = "krisenpfad" | "red-flags" | "sicherheitsnetz";

export interface AusgeloesteRegel {
  regelwerk: Regelbereich;
  id: string;
  version: string;
  titel: string;
  dringlichkeit: DringlichkeitStufe;
  zeitrahmen: Zeitrahmen;
  hinweisPatient: string;
  hinweisArzt: string;
  anlaufstelle: Anlaufstelle;
  quelle: Quelle | null;
  quelleHinweis: string | null;
  status: RegelStatus;
  geprueftVon: string | null;
}

export type Gesamtstatus = "KRISE" | DringlichkeitStufe | "KEINE_WARNZEICHEN";

export interface Pruefergebnis {
  /** Für das Logging (`Fall.regelVersion`). */
  regelwerkVersion: string;
  status: Gesamtstatus;
  hoechsteDringlichkeit: DringlichkeitStufe | null;
  /** Höchste Dringlichkeit der Red Flags inkl. Sicherheitsnetz (für den Notfallhinweis). */
  redFlagDringlichkeit: DringlichkeitStufe | null;
  /** Zeitrahmen der ranghöchsten Red Flag (Überschrift des Notfallhinweises). */
  redFlagZeitrahmen: Zeitrahmen | null;
  krisenpfadAktiv: boolean;
  /** `positiv` = mindestens eine Antwort „ja“; `unvollstaendig` = fehlende/ungültige/„keine Angabe“ (REQ-209). */
  kriseGrund: "positiv" | "unvollstaendig" | null;
  krisenRegeln: AusgeloesteRegel[];
  /** Red Flags und ggf. Sicherheitsnetz (REQ-218). */
  redFlags: AusgeloesteRegel[];
  /** Kein weiterer Diagnose-Ablauf (REQ-208). */
  ablaufBeenden: boolean;
  enthaeltUngepruefteRegeln: boolean;
  /** Verworfene, ungültige Teile der Befundlage (REQ-219) – unterdrücken keine Hinweise. */
  befundlageFehler: string[];
}

export const rang = (d: DringlichkeitStufe) => DRINGLICHKEITEN.indexOf(d);

export function hoechste(stufen: readonly DringlichkeitStufe[]): DringlichkeitStufe | null {
  return stufen.reduce<DringlichkeitStufe | null>((max, d) => (max === null || rang(d) < rang(max) ? d : max), null);
}

function ausgeloest(
  regelwerk: Regelbereich,
  r: Pick<Regel, "id" | "version" | "titel" | "ergebnis" | "quelle" | "quelleHinweis" | "status" | "geprueftVon">,
  titel = r.titel,
): AusgeloesteRegel {
  return {
    regelwerk,
    id: r.id,
    version: r.version,
    titel,
    dringlichkeit: r.ergebnis.dringlichkeit,
    zeitrahmen: r.ergebnis.zeitrahmen,
    hinweisPatient: r.ergebnis.hinweisPatient,
    hinweisArzt: r.ergebnis.hinweisArzt,
    anlaufstelle: r.ergebnis.anlaufstelle,
    quelle: r.quelle,
    quelleHinweis: r.quelleHinweis,
    status: r.status,
    geprueftVon: r.geprueftVon,
  };
}

/** Rangfolge: Dringlichkeit, dann Zeitrahmen (SOFORT zuerst), dann ID. */
function sortiere(regeln: AusgeloesteRegel[]): AusgeloesteRegel[] {
  return regeln.sort(
    (a, b) =>
      rang(a.dringlichkeit) - rang(b.dringlichkeit) ||
      ZEITRAHMEN.indexOf(a.zeitrahmen) - ZEITRAHMEN.indexOf(b.zeitrahmen) ||
      a.id.localeCompare(b.id),
  );
}

function feuernde(regeln: readonly Regel[], befund: Befundlage): Regel[] {
  return regeln.filter((r) => imAltersbereich(r.altersbereich, befund) && werteAus(r.bedingung, befund));
}

/** N-3: Nur einfache Objekte (Prototyp `Object.prototype` oder `null`) – keine Map, Liste o. Ä. */
function istObjekt(o: unknown): o is Record<string, unknown> {
  if (o === null || typeof o !== "object") return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

function gueltigesAlter(a: unknown): AlterAngabe | null {
  if (!a || typeof a !== "object") return null;
  const { tage, monate } = a as Record<string, unknown>;
  return typeof tage === "number" && typeof monate === "number" && Number.isFinite(tage) && Number.isFinite(monate) && tage >= 0 && monate >= 0
    ? { tage, monate }
    : null;
}

/**
 * REQ-203, REQ-219 (S1): Befundlage bereinigen. Unbekannte IDs, NaN/Infinity und Werte
 * außerhalb des Plausibilitätsbereichs werden verworfen und gemeldet – nie still
 * übernommen, aber auch nie Anlass, die übrige Auswertung abzubrechen.
 */
function bereinige(
  w: Regelwerk,
  b: Befundlage,
): { befund: Befundlage; roheAntworten: Map<string, unknown>; antwortStrukturFehler: boolean; fehler: string[] } {
  const fehler: string[] = [];
  // S-3: Falsche Strukturen werden gemeldet, nie still als „leer“ behandelt.
  if (!Array.isArray(b.symptome)) fehler.push("Symptome haben eine ungültige Struktur – verworfen.");
  if (!istObjekt(b.messwerte)) fehler.push("Messwerte haben eine ungültige Struktur – verworfen.");
  const antwortStrukturFehler = !istObjekt(b.antworten);
  if (antwortStrukturFehler) fehler.push("Antworten haben eine ungültige Struktur – Krisenpfad konservativ aktiviert.");
  const symptome: string[] = [];
  for (const s of Array.isArray(b.symptome) ? b.symptome : []) {
    if (typeof s === "string" && w.symptome.has(s)) {
      if (!symptome.includes(s)) symptome.push(s);
    } else fehler.push(`Unbekanntes Symptom „${String(s)}“ verworfen.`);
  }

  const messwerte: Record<string, number[]> = {};
  for (const [id, werte] of istObjekt(b.messwerte) ? Object.entries(b.messwerte) : []) {
    const m = w.messwerte.get(id);
    if (!m) {
      fehler.push(`Unbekannter Messwert „${id}“ verworfen.`);
      continue;
    }
    for (const x of Array.isArray(werte) ? werte : [werte]) {
      if (typeof x === "number" && Number.isFinite(x) && x >= m.plausibel.min && x <= m.plausibel.max) (messwerte[id] ??= []).push(x);
      else fehler.push(`Ungültiger Wert für „${id}“ verworfen.`);
    }
  }

  const roheAntworten = new Map<string, unknown>();
  for (const [id, wert] of istObjekt(b.antworten) ? Object.entries(b.antworten) : []) {
    if (w.fragenIds.has(id)) roheAntworten.set(id, wert);
    else fehler.push(`Unbekannte Frage „${id}“ verworfen.`);
  }

  const alter = gueltigesAlter(b.alter);
  if (b.alter !== null && alter === null) fehler.push("Ungültiges Alter – als unbekannt gewertet (konservativ).");
  const befund: Befundlage = {
    alter,
    korrigiertesAlter: gueltigesAlter(b.korrigiertesAlter),
    schwangerschaft: b.schwangerschaft,
    symptome,
    messwerte,
    antworten: {},
    // Jeder gesetzte Wert gilt als „seelische Beschwerden“ (konservativ, S4).
    psychisch: Boolean(b.psychisch),
  };
  return { befund, roheAntworten, antwortStrukturFehler, fehler };
}

/**
 * B5/REQ-209: Nur exakt „ja“ bzw. „nein“ werden übernommen; jeder andere Wert (z. B.
 * „JA“, „yes“, "", null, Zahl) gilt als „keine_angabe“. Mehrere Werte: „ja“ vor
 * „keine_angabe“ vor „nein“ (nur einheitlich „nein“ ist „nein“).
 */
export function normalisiereAntwort(wert: unknown): Antwort {
  const werte = Array.isArray(wert) ? wert : [wert];
  if (werte.length === 0) return "keine_angabe";
  if (werte.some((x) => x === "ja")) return "ja";
  return werte.every((x) => x === "nein") ? "nein" : "keine_angabe";
}

/**
 * REQ-208/REQ-209: Krisenpfad ist aktiv bei seelischen Beschwerden oder wenn irgendeine
 * Krisenfrage (mit beliebigem Wert) übermittelt wurde. Dann gilt jede fehlende oder
 * ungültige Antwort als „keine_angabe“ – kein Entwarnungssignal.
 */
function krisenAntworten(w: Regelwerk, psychisch: boolean, roh: Map<string, unknown>, strukturFehler: boolean) {
  // S-3: Eine ungültige Antwort-Struktur aktiviert den Krisenpfad (alle Antworten fehlen ⇒ KRISE).
  const aktiv = psychisch || strukturFehler || w.fragen.some((f) => roh.has(f.id));
  const antworten: Record<string, Antwort> = {};
  if (aktiv) for (const f of w.fragen) antworten[f.id] = roh.has(f.id) ? normalisiereAntwort(roh.get(f.id)) : "keine_angabe";
  return { aktiv, antworten };
}

/**
 * REQ-218: Sicherheitsnetz. Jedes angegebene Warnzeichen-Symptom, das von keiner
 * ausgelösten Regel abgedeckt wird (z. B. außerhalb des Altersbereichs), ergibt
 * mindestens DRINGEND – nie „keine Warnzeichen“.
 */
function sicherheitsnetz(w: Regelwerk, befund: Befundlage, gefeuert: readonly Regel[]): AusgeloesteRegel | null {
  // H-2: Abgedeckt ist nur, was eine ausgelöste Regel im erfüllten Zweig tatsächlich verwendet hat.
  const abgedeckt = new Set(gefeuert.flatMap((r) => genutzteSymptome(r.bedingung, befund)));
  const offen = befund.symptome.filter((s) => w.symptome.get(s)?.warnzeichen && !abgedeckt.has(s));
  if (!offen.length) return null;
  const namen = offen.map((s) => w.symptome.get(s)!.bezeichnung).join(", ");
  return ausgeloest("sicherheitsnetz", w.sicherheitsnetz, `${w.sicherheitsnetz.titel}: ${namen}`);
}

/**
 * N-2/REQ-222: Laufzeit-Absicherung. Ein angegebenes Warnzeichen mit Mindeststufe hebt das
 * Ergebnis mindestens auf diese Stufe – unabhängig davon, ob eine passende Regel greift
 * (NOTFALL ⇒ SN-002, DRINGEND ⇒ SN-001).
 */
function mindestNetz(w: Regelwerk, befund: Befundlage, redFlags: readonly AusgeloesteRegel[]): AusgeloesteRegel[] {
  const aktuell = hoechste(redFlags.map((r) => r.dringlichkeit));
  const zuNiedrig = (m: DringlichkeitStufe) => aktuell === null || rang(aktuell) > rang(m);
  const zeichen = befund.symptome.map((s) => w.symptome.get(s)).filter((s) => s?.mindestens && zuNiedrig(s.mindestens));
  const notfall = zeichen.filter((s) => s!.mindestens === "NOTFALL");
  const dringend = zeichen.filter((s) => s!.mindestens === "DRINGEND");
  const neu: AusgeloesteRegel[] = [];
  if (notfall.length) {
    neu.push(ausgeloest("sicherheitsnetz", w.mindestDringlichkeit, `${w.mindestDringlichkeit.titel}: ${notfall.map((s) => s!.bezeichnung).join(", ")}`));
  }
  if (dringend.length && !notfall.length && !redFlags.some((r) => r.id === w.sicherheitsnetz.id)) {
    neu.push(ausgeloest("sicherheitsnetz", w.sicherheitsnetz, `${w.sicherheitsnetz.titel}: ${dringend.map((s) => s!.bezeichnung).join(", ")}`));
  }
  return neu;
}

export interface PruefOptionen {
  /** Nur für den Selbsttest beim Laden: Laufzeit-Absicherung SN-002 abschalten. Standard: an. */
  mindestDringlichkeit?: boolean;
}

/**
 * REQ-210: Vorrangige Prüfung vor jeder weiteren Logik (Eingrenzung, KI).
 * Reihenfolge: 1. Krisenpfad, 2. Red Flags, 3. Sicherheitsnetz. Red Flags werden auch
 * im Krisenfall ausgewertet, damit ein körperlicher Notfall nicht verdeckt wird.
 */
export function pruefeVorrangig(w: Regelwerk, eingabe: Befundlage, optionen: PruefOptionen = {}): Pruefergebnis {
  const { befund, roheAntworten, antwortStrukturFehler, fehler } = bereinige(w, eingabe);

  const krise = krisenAntworten(w, befund.psychisch, roheAntworten, antwortStrukturFehler);
  const krisenBefund: Befundlage = { ...befund, antworten: krise.antworten };
  const krisenRegeln = krise.aktiv
    ? sortiere(feuernde(w.krisenRegeln, krisenBefund).map((r) => ausgeloest("krisenpfad", r)))
    : [];

  const gefeuert = feuernde(w.redFlags, krisenBefund);
  const netz = sicherheitsnetz(w, krisenBefund, gefeuert);
  const regelTreffer = [...gefeuert.map((r) => ausgeloest("red-flags", r)), ...(netz ? [netz] : [])];
  const redFlags = sortiere([
    ...regelTreffer,
    ...(optionen.mindestDringlichkeit === false ? [] : mindestNetz(w, befund, regelTreffer)),
  ]);

  const istKrise = krisenRegeln.length > 0;
  const kriseGrund = !istKrise ? null : Object.values(krise.antworten).includes("ja") ? "positiv" : "unvollstaendig";

  const alle = [...krisenRegeln, ...redFlags];
  const hoechsteDringlichkeit = hoechste(alle.map((r) => r.dringlichkeit));
  return {
    regelwerkVersion: w.version,
    status: istKrise ? "KRISE" : (hoechsteDringlichkeit ?? "KEINE_WARNZEICHEN"),
    hoechsteDringlichkeit,
    redFlagDringlichkeit: redFlags[0]?.dringlichkeit ?? null,
    redFlagZeitrahmen: redFlags[0]?.zeitrahmen ?? null,
    krisenpfadAktiv: krise.aktiv,
    kriseGrund,
    krisenRegeln,
    redFlags,
    ablaufBeenden: istKrise,
    enthaeltUngepruefteRegeln: alle.some((r) => r.status !== "geprüft"),
    befundlageFehler: fehler,
  };
}
