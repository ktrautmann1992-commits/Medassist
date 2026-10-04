import type { z } from "zod";
import { referenzen } from "./bedingung";
import type { AlterAngabe, Befundlage } from "./befundlage";
import { pruefeVorrangig, rang } from "./engine";
import {
  MAX_TIEFE,
  krisenpfadDateiSchema,
  redFlagsDateiSchema,
  vokabularDateiSchema,
  type KrisenFrage,
  type Regel,
  type Sicherheitsnetz,
  type VokabularDatei,
} from "./schema";

/**
 * REQ-201: Laden und Validieren des Regelwerks. Jeder Fehler bricht das Laden ab
 * (Fail-safe: lieber kein Start als stille Ignoranz einzelner Regeln, RISK-020).
 */
export class RegelwerkFehler extends Error {
  override name = "RegelwerkFehler";
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(details.length ? `${message}\n- ${details.join("\n- ")}` : message);
  }
}

export interface Symptom {
  id: string;
  bezeichnung: string;
  fachbegriff: string | null;
  warnzeichen: boolean;
  mindestens?: "NOTFALL" | "DRINGEND";
}

export type Messwert = VokabularDatei["messwerte"][number];

export interface Regelwerk {
  version: string;
  stand: { vokabular: string; redFlags: string; krisenpfad: string };
  symptome: ReadonlyMap<string, Symptom>;
  messwerte: ReadonlyMap<string, Messwert>;
  fragen: readonly KrisenFrage[];
  fragenIds: ReadonlySet<string>;
  fragenStatus: "geprüft" | "ungeprüft";
  fragenHinweis: string;
  redFlags: readonly Regel[];
  sicherheitsnetz: Sicherheitsnetz;
  mindestDringlichkeit: Sicherheitsnetz;
  krisenRegeln: readonly Regel[];
}

export interface RegelDateien {
  vokabular: unknown;
  redFlags: unknown;
  krisenpfad: unknown;
}

function parse<T extends z.ZodType>(name: string, schema: T, daten: unknown): z.infer<T> {
  const r = schema.safeParse(daten);
  if (!r.success) {
    throw new RegelwerkFehler(
      `Regeldatei „${name}“ ist ungültig.`,
      r.error.issues.map((i) => `${i.path.map(String).join(".") || "(Wurzel)"}: ${i.message}`),
    );
  }
  return r.data;
}

function doppelte(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function tiefgefroren<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) tiefgefroren(v);
  }
  return o;
}

/**
 * REQ-209: Selbsttest des Krisenpfads. Jede Frage mit „ja“, mit fehlender Antwort und mit
 * ungültigem Wert (z. B. „JA“, „yes“, "", null, Zahl) muss KRISE auslösen; „alle nein“
 * darf keine KRISE auslösen.
 */
const UNGUELTIGE_ANTWORTEN: readonly unknown[] = ["JA", "Ja", "yes", " ja", "", null, 1, true, "keine_angabe", ["nein", "ja"]];

function basisBefund(teil: Partial<Befundlage> = {}): Befundlage {
  return { alter: null, korrigiertesAlter: null, symptome: [], messwerte: {}, antworten: {}, schwangerschaft: "UNBEKANNT", psychisch: true, ...teil };
}

function selbsttestKrisenpfad(w: Regelwerk): string[] {
  const alleNein = Object.fromEntries(w.fragen.map((f) => [f.id, "nein" as const]));
  const fehler: string[] = [];
  if (pruefeVorrangig(w, basisBefund({ antworten: alleNein })).status === "KRISE") {
    fehler.push("Alle Krisenfragen mit „nein“ beantwortet ergeben KRISE.");
  }
  for (const f of w.fragen) {
    for (const wert of ["ja", ...UNGUELTIGE_ANTWORTEN]) {
      if (pruefeVorrangig(w, basisBefund({ antworten: { ...alleNein, [f.id]: wert } })).status !== "KRISE") {
        fehler.push(`Antwort ${JSON.stringify(wert)} auf „${f.id}“ ergibt keine KRISE.`);
      }
      // Auch ohne Angabe seelischer Beschwerden: übermittelte Krisenantwort aktiviert den Pfad.
      if (pruefeVorrangig(w, basisBefund({ psychisch: false, antworten: { [f.id]: wert } })).status !== "KRISE") {
        fehler.push(`Antwort ${JSON.stringify(wert)} auf „${f.id}“ ohne seelische Beschwerden ergibt keine KRISE.`);
      }
    }
    const ohne: Record<string, "nein"> = { ...alleNein };
    delete ohne[f.id];
    if (pruefeVorrangig(w, basisBefund({ antworten: ohne })).status !== "KRISE") {
      fehler.push(`Fehlende Antwort auf „${f.id}“ ergibt keine KRISE.`);
    }
  }
  return fehler;
}

/**
 * REQ-218, REQ-222: Selbsttest Sicherheitsnetz und Mindest-Dringlichkeit. Jedes
 * Warnzeichen-Symptom ergibt in jedem Alter (Neugeborenes bis Hochbetagte, unbekannt)
 * mindestens seine Mindeststufe (`mindestens`, sonst DRINGEND). Wird z. B. eine
 * NOTFALL-Regel entfernt, schlägt das Laden fehl.
 */
/** Altersstufen für den Selbsttest: feste Stufen plus alle Altersgrenzen der Regeln ±1 Tag bzw. ±1 Monat. */
function testAlter(w: Regelwerk): (AlterAngabe | null)[] {
  const alter: (AlterAngabe | null)[] = [null, { tage: 0, monate: 0 }, { tage: 400, monate: 13 }, { tage: 6200, monate: 203 }, { tage: 11000, monate: 361 }, { tage: 36500, monate: 1200 }];
  const tageZuMonaten = (t: number) => Math.max(0, Math.floor(t / 30.4375));
  for (const r of [...w.redFlags, ...w.krisenRegeln]) {
    const b = r.altersbereich;
    if (!b) continue;
    for (const t of [b.minTage, b.unterTage]) {
      if (t === undefined) continue;
      for (const d of [-1, 0, 1]) if (t + d >= 0) alter.push({ tage: t + d, monate: tageZuMonaten(t + d) });
    }
    for (const m of [b.minMonate, b.unterMonate]) {
      if (m === undefined) continue;
      for (const d of [-1, 0, 1]) {
        if (m + d < 0) continue;
        const tage = Math.round((m + d) * 30.4375);
        // ±1 Tag um die Monatsgrenze
        for (const dt of [-1, 0, 1]) if (tage + dt >= 0) alter.push({ tage: tage + dt, monate: m + d });
      }
    }
  }
  return alter;
}

/**
 * REQ-218, REQ-222: Selbsttest Sicherheitsnetz und Mindest-Dringlichkeit. Jedes
 * Warnzeichen-Symptom muss in jeder Altersstufe (inkl. aller Altersgrenzen ±1) schon
 * **durch das Regelwerk selbst** (ohne Laufzeit-Absicherung SN-002) mindestens seine
 * Mindeststufe erreichen – sonst Ladefehler (z. B. gelöschte oder lückenhafte NOTFALL-Regel).
 */
function selbsttestSicherheitsnetz(w: Regelwerk): string[] {
  const fehler: string[] = [];
  const alter = testAlter(w);
  for (const s of w.symptome.values()) {
    if (!s.warnzeichen) continue;
    for (const a of alter) {
      const e = pruefeVorrangig(w, basisBefund({ psychisch: false, alter: a, symptome: [s.id] }), { mindestDringlichkeit: false });
      const mindestens = s.mindestens ?? "DRINGEND";
      const erreicht = e.hoechsteDringlichkeit !== null && rang(e.hoechsteDringlichkeit) <= rang(mindestens);
      if (!erreicht) fehler.push(`Warnzeichen „${s.id}“ (Alter ${a ? `${a.tage} Tage/${a.monate} Monate` : "unbekannt"}) ergibt ${e.status}, mindestens ${mindestens} verlangt.`);
    }
  }
  return [...new Set(fehler)];
}

/**
 * Baut das Regelwerk mit Schema- und Konsistenzprüfung, aber **ohne** Selbsttests.
 * Nur für Tests (z. B. Laufzeit-Absicherung bei absichtlich lückenhaftem Regelwerk);
 * Anwendungscode nutzt ausschließlich `ladeRegelwerk` bzw. `standardRegelwerk`.
 */
export function baueRegelwerkOhneSelbsttest(dateien: RegelDateien): Regelwerk {
  const vokabular = parse("vokabular.json", vokabularDateiSchema, dateien.vokabular);
  const redFlags = parse("red-flags.json", redFlagsDateiSchema, dateien.redFlags);
  const krisenpfad = parse("krisenpfad.json", krisenpfadDateiSchema, dateien.krisenpfad);

  const fehler: string[] = [];
  const versionen = new Set([vokabular.regelwerkVersion, redFlags.regelwerkVersion, krisenpfad.regelwerkVersion]);
  if (versionen.size !== 1) fehler.push(`Regelwerk-Versionen unterscheiden sich: ${[...versionen].join(", ")}`);

  const symptomIds = vokabular.symptome.map((s) => s.id);
  const messwertIds = vokabular.messwerte.map((m) => m.id);
  const fragenIds = krisenpfad.fragen.map((f) => f.id);
  const alleRegeln = [...redFlags.regeln, ...krisenpfad.regeln];
  for (const [art, ids] of [
    ["Symptom", symptomIds],
    ["Messwert", messwertIds],
    ["Frage", fragenIds],
    ["Regel", [...alleRegeln.map((r) => r.id), redFlags.sicherheitsnetz.id, redFlags.mindestDringlichkeit.id]],
  ] as const) {
    for (const id of doppelte(ids)) fehler.push(`${art}-ID „${id}“ ist doppelt.`);
  }

  // REQ-203: Jede referenzierte ID muss definiert sein.
  for (const r of alleRegeln) {
    const ref = referenzen(r.bedingung);
    if (ref.tiefe > MAX_TIEFE) fehler.push(`${r.id}: Bedingung ist tiefer als ${MAX_TIEFE} Ebenen verschachtelt.`);
    for (const s of ref.symptome) if (!symptomIds.includes(s)) fehler.push(`${r.id}: unbekanntes Symptom „${s}“.`);
    for (const m of ref.messwerte) if (!messwertIds.includes(m)) fehler.push(`${r.id}: unbekannter Messwert „${m}“.`);
    for (const a of ref.antworten) if (!fragenIds.includes(a)) fehler.push(`${r.id}: unbekannte Frage „${a}“.`);
  }
  // REQ-222: Ein Warnzeichen, das eine altersunabhängige NOTFALL-Regel für sich allein auslöst
  // (`symptom` bzw. `eines` aus Symptomen), muss `mindestens: NOTFALL` tragen – so kann die
  // Laufzeit-Absicherung nicht unbemerkt durch Entfernen der Mindeststufe entfallen.
  const symptomeById = new Map(vokabular.symptome.map((x) => [x.id, x]));
  for (const r of redFlags.regeln) {
    if (r.altersbereich !== null || r.ergebnis.dringlichkeit !== "NOTFALL") continue;
    const b = r.bedingung;
    const einzeln = "symptom" in b ? [b.symptom] : "eines" in b && b.eines.every((x) => "symptom" in x) ? b.eines.map((x) => (x as { symptom: string }).symptom) : [];
    for (const id of einzeln) {
      if (symptomeById.get(id)?.mindestens !== "NOTFALL") fehler.push(`${r.id}: Warnzeichen „${id}“ braucht „mindestens: NOTFALL“ im Vokabular.`);
    }
  }
  if (fehler.length) throw new RegelwerkFehler("Regelwerk ist inkonsistent.", fehler);

  const regelwerk: Regelwerk = {
    version: vokabular.regelwerkVersion,
    stand: { vokabular: vokabular.stand, redFlags: redFlags.stand, krisenpfad: krisenpfad.stand },
    symptome: new Map(vokabular.symptome.map((s) => [s.id, s])),
    messwerte: new Map(vokabular.messwerte.map((m) => [m.id, m])),
    fragen: krisenpfad.fragen,
    fragenIds: new Set(fragenIds),
    fragenStatus: krisenpfad.fragenStatus,
    fragenHinweis: krisenpfad.fragenHinweis,
    redFlags: redFlags.regeln,
    sicherheitsnetz: redFlags.sicherheitsnetz,
    mindestDringlichkeit: redFlags.mindestDringlichkeit,
    krisenRegeln: krisenpfad.regeln,
  };

  // Maps/Sets selbst sind nicht einfrierbar; Regeln und Fragen schon.
  tiefgefroren(regelwerk.redFlags);
  tiefgefroren(regelwerk.krisenRegeln);
  tiefgefroren(regelwerk.fragen);
  tiefgefroren(regelwerk.sicherheitsnetz);
  tiefgefroren(regelwerk.mindestDringlichkeit);
  return regelwerk;
}

export function ladeRegelwerk(dateien: RegelDateien): Regelwerk {
  const regelwerk = baueRegelwerkOhneSelbsttest(dateien);
  const selbsttest = selbsttestKrisenpfad(regelwerk);
  if (selbsttest.length) throw new RegelwerkFehler("Selbsttest Krisenpfad fehlgeschlagen.", selbsttest);
  const netz = selbsttestSicherheitsnetz(regelwerk);
  if (netz.length) throw new RegelwerkFehler("Selbsttest Sicherheitsnetz fehlgeschlagen.", netz);

  return regelwerk;
}
