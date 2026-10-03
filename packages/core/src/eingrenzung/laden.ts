import type { z } from "zod";
import type { Regelwerk } from "../regeln/laden";
import { bedingungReferenzen } from "./bedingung";
import {
  ANSICHTEN,
  BEREICHE,
  MAX_BEDINGUNG_TIEFE,
  RESERVIERTE_SCHRITTE,
  fragenkatalogDateiSchema,
  koerperkarteDateiSchema,
  type Bereich,
  type Form,
  type FragenkatalogDatei,
  type KoerperkarteDatei,
} from "./schema";
import { baueEntwicklung } from "../entwicklung/laden";
import { entwicklungskatalogDateiSchema } from "../entwicklung/schema";
import { baueSchnellcheck, doppelte } from "./schnellcheck";
import type { Frage, Fragenkataloge, Katalog, Koerperkarte, Option, Region } from "./typen";

/**
 * REQ-300 – REQ-303, REQ-306: Laden und Prüfen der Fragenkataloge. Jeder Fehler bricht das
 * Laden ab (Fail-safe wie REQ-201) – nie stilles Ignorieren einzelner Fragen.
 */
export class FragenkatalogFehler extends Error {
  override name = "FragenkatalogFehler";
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(details.length ? `${message}\n- ${details.join("\n- ")}` : message);
  }
}

export interface FragenDateien {
  koerperkarte: unknown;
  koerperlich: unknown;
  seelisch: unknown;
  entwicklung: unknown;
}

/**
 * REQ-303: Mindest-Trefferfläche je Kartenregion in viewBox-Einheiten. Die Karte wird auf
 * Mobilgeräten mit mindestens ≈ 1,34 px je Einheit dargestellt (≈ 48 px); die Liste ist die
 * gleichwertige Alternative.
 */
export const MIN_TREFFERFLAECHE = 36;

function parse<T extends z.ZodType>(name: string, schema: T, daten: unknown): z.infer<T> {
  const r = schema.safeParse(daten);
  if (!r.success) {
    throw new FragenkatalogFehler(
      `Fragendatei „${name}“ ist ungültig.`,
      r.error.issues.map((i) => `${i.path.map(String).join(".") || "(Wurzel)"}: ${i.message}`),
    );
  }
  return r.data;
}

export function formGrenzen(f: Form): { minX: number; minY: number; maxX: number; maxY: number } {
  if ("ellipse" in f) {
    const e = f.ellipse;
    return { minX: e.cx - e.rx, minY: e.cy - e.ry, maxX: e.cx + e.rx, maxY: e.cy + e.ry };
  }
  if ("rechteck" in f) {
    const r = f.rechteck;
    return { minX: r.x, minY: r.y, maxX: r.x + r.breite, maxY: r.y + r.hoehe };
  }
  const xs = f.polygon.map((p) => p[0]);
  const ys = f.polygon.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function baueKarte(d: KoerperkarteDatei, fehler: string[]): Koerperkarte {
  for (const x of doppelte(d.organsysteme.map((o) => o.id))) fehler.push(`Organsystem-ID „${x}“ ist doppelt.`);
  for (const x of doppelte(d.regionen.map((r) => r.id))) fehler.push(`Region-ID „${x}“ ist doppelt.`);
  const organ = new Set(d.organsysteme.map((o) => o.id));
  for (const r of d.regionen) {
    for (const o of r.organsysteme) if (!organ.has(o)) fehler.push(`Region „${r.id}“: unbekanntes Organsystem „${o}“.`);
    for (const a of ANSICHTEN) {
      const formen = r.formen[a];
      if (!formen.length) continue;
      const g = formen.map(formGrenzen);
      const box = {
        minX: Math.min(...g.map((x) => x.minX)),
        minY: Math.min(...g.map((x) => x.minY)),
        maxX: Math.max(...g.map((x) => x.maxX)),
        maxY: Math.max(...g.map((x) => x.maxY)),
      };
      if (box.minX < 0 || box.minY < 0 || box.maxX > d.viewBox.breite || box.maxY > d.viewBox.hoehe) {
        fehler.push(`Region „${r.id}“ (${a}): Form liegt außerhalb des viewBox.`);
      }
      if (box.maxX - box.minX < MIN_TREFFERFLAECHE || box.maxY - box.minY < MIN_TREFFERFLAECHE) {
        fehler.push(`Region „${r.id}“ (${a}): Trefferfläche kleiner als ${MIN_TREFFERFLAECHE} × ${MIN_TREFFERFLAECHE}.`);
      }
    }
  }
  for (const a of ANSICHTEN) {
    if (!d.regionen.some((r) => r.formen[a].length > 0)) fehler.push(`Ansicht „${a}“ hat keine Region.`);
  }
  const regionen: Region[] = d.regionen.map((r) => ({ ...r, formen: { vorne: r.formen.vorne, hinten: r.formen.hinten } }));
  return {
    version: d.katalogVersion,
    hinweis: d.hinweis,
    status: d.status,
    quelle: d.quelle,
    quelleHinweis: d.quelleHinweis,
    geprueftVon: d.geprueftVon,
    viewBox: d.viewBox,
    organsysteme: new Map(d.organsysteme.map((o) => [o.id, o])),
    regionen,
    regionenById: new Map(regionen.map((r) => [r.id, r])),
  };
}

function baueKatalog(name: string, d: FragenkatalogDatei, bereich: Bereich, karte: Koerperkarte, w: Regelwerk, fehler: string[]): Katalog {
  const f = (t: string) => fehler.push(`${name}: ${t}`);
  if (d.bereich !== bereich) f(`Bereich „${d.bereich}“ erwartet „${bereich}“.`);


  for (const x of doppelte(d.fragen.map((q) => q.id))) f(`Frage-ID „${x}“ ist doppelt.`);
  const frueher = new Map<string, Frage>();
  const fragen: Frage[] = [];
  for (const q of d.fragen) {
    if ((RESERVIERTE_SCHRITTE as readonly string[]).includes(q.id)) f(`Frage-ID „${q.id}“ ist reserviert.`);
    if (w.fragenIds.has(q.id)) f(`Frage-ID „${q.id}“ ist bereits eine Krisenfrage.`);

    let optionen: Option[] = [];
    if (q.typ === "einfach" || q.typ === "mehrfach") {
      optionen = q.optionen.map((o) => {
        if ("symptom" in o) {
          const s = w.symptome.get(o.symptom);
          if (!s) f(`Frage „${q.id}“: unbekanntes Symptom „${o.symptom}“.`);
          return { id: o.symptom, bezeichnung: s?.bezeichnung ?? o.symptom, fachbegriff: s?.fachbegriff ?? null, symptom: o.symptom, warnzeichen: s?.warnzeichen ?? false };
        }
        if (w.symptome.has(o.id)) f(`Frage „${q.id}“: eigene Option „${o.id}“ hat die ID eines Symptoms – stattdessen { "symptom": "${o.id}" } verwenden.`);
        return { ...o, symptom: null, warnzeichen: false };
      });
      for (const x of doppelte(optionen.map((o) => o.id))) f(`Frage „${q.id}“: Option „${x}“ ist doppelt.`);
    }

    if (q.bedingung) {
      const ref = bedingungReferenzen(q.bedingung);
      if (ref.tiefe > MAX_BEDINGUNG_TIEFE) f(`Frage „${q.id}“: Bedingung tiefer als ${MAX_BEDINGUNG_TIEFE} Ebenen.`);
      for (const a of ref.antworten) {
        const ziel = frueher.get(a.frage);
        if (!ziel) {
          f(`Frage „${q.id}“: Bedingung verweist auf „${a.frage}“ – nur frühere Fragen sind erlaubt.`);
          continue;
        }
        if (a.art === "ist" && ziel.typ !== "einfach") f(`Frage „${q.id}“: „ist“ nur für Einfachauswahl („${a.frage}“).`);
        if (a.art === "enthaelt" && ziel.typ !== "mehrfach") f(`Frage „${q.id}“: „enthaelt“ nur für Mehrfachauswahl („${a.frage}“).`);
        if (a.option !== null && (ziel.typ === "einfach" || ziel.typ === "mehrfach") && !ziel.optionen.some((o) => o.id === a.option)) {
          f(`Frage „${q.id}“: Option „${a.option}“ gibt es in „${a.frage}“ nicht.`);
        }
      }
      if (bereich === "PSYCHISCH" && (ref.regionen.length || ref.organsysteme.length)) f(`Frage „${q.id}“: Region/Organsystem im seelischen Katalog nicht erlaubt.`);
      for (const r of ref.regionen) if (!karte.regionenById.has(r)) f(`Frage „${q.id}“: unbekannte Region „${r}“.`);
      for (const o of ref.organsysteme) if (!karte.organsysteme.has(o)) f(`Frage „${q.id}“: unbekanntes Organsystem „${o}“.`);
    }

    const kopf = {
      id: q.id,
      kurz: q.kurz,
      text: q.text,
      textKind: q.textKind,
      textFremd: q.textFremd,
      hilfe: q.hilfe ?? null,
      pflicht: q.pflicht,
      bedingung: q.bedingung,
      gruppe: null,
      alter: null,
    };
    let frage: Frage;
    switch (q.typ) {
      case "einfach":
        frage = { ...kopf, typ: "einfach", optionen };
        break;
      case "mehrfach":
        frage = { ...kopf, typ: "mehrfach", optionen, keineOption: q.keineOption ?? null };
        break;
      case "skala":
        frage = { ...kopf, typ: "skala", min: q.min, max: q.max, minText: q.minText, maxText: q.maxText };
        break;
      case "freitext":
        frage = { ...kopf, typ: "freitext", maxLaenge: q.maxLaenge };
        break;
      case "dauer":
        frage = { ...kopf, typ: "dauer", einheiten: q.einheiten, maxAnzahl: q.maxAnzahl };
        break;
    }
    fragen.push(frage);
    frueher.set(q.id, frage);
  }

  return {
    bereich,
    version: d.katalogVersion,
    stand: d.stand,
    hinweis: d.hinweis,
    status: d.status,
    quelle: d.quelle,
    quelleHinweis: d.quelleHinweis,
    geprueftVon: d.geprueftVon,
    schnellcheck: baueSchnellcheck(d.schnellcheck, w, f),
    fragen,
    fragenById: new Map(fragen.map((q) => [q.id, q])),
  };
}

function tiefgefroren<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o) && !(o instanceof Map)) {
    Object.freeze(o);
    for (const v of Object.values(o)) tiefgefroren(v);
  }
  return o;
}

export function ladeFragenkataloge(dateien: FragenDateien, regelwerk: Regelwerk): Fragenkataloge {
  const kartenDatei = parse("koerperkarte.json", koerperkarteDateiSchema, dateien.koerperkarte);
  const koerperlich = parse("koerperlich.json", fragenkatalogDateiSchema, dateien.koerperlich);
  const seelisch = parse("seelisch.json", fragenkatalogDateiSchema, dateien.seelisch);
  const entwicklungDatei = parse("entwicklung.json", entwicklungskatalogDateiSchema, dateien.entwicklung);

  const fehler: string[] = [];
  const versionen = new Set([kartenDatei.katalogVersion, koerperlich.katalogVersion, seelisch.katalogVersion, entwicklungDatei.katalogVersion]);
  if (versionen.size !== 1) fehler.push(`Katalog-Versionen unterscheiden sich: ${[...versionen].join(", ")}`);

  const koerperkarte = baueKarte(kartenDatei, fehler);
  // REQ-320/REQ-321: Entwicklungskatalog (Weg 3) inkl. Selbsttests.
  const entwicklung = baueEntwicklung("entwicklung.json", entwicklungDatei, regelwerk, fehler);
  const kataloge: Record<Bereich, Katalog> = {
    KOERPERLICH: baueKatalog("koerperlich.json", koerperlich, "KOERPERLICH", koerperkarte, regelwerk, fehler),
    PSYCHISCH: baueKatalog("seelisch.json", seelisch, "PSYCHISCH", koerperkarte, regelwerk, fehler),
    ENTWICKLUNG: entwicklung.katalog,
  };
  if (fehler.length) throw new FragenkatalogFehler("Fragenkataloge sind ungültig.", fehler);
  for (const b of BEREICHE) tiefgefroren(kataloge[b].fragen);
  tiefgefroren(koerperkarte.regionen);
  tiefgefroren(entwicklung.entwicklung.bereiche);
  return { version: kartenDatei.katalogVersion, koerperkarte, kataloge, entwicklung: entwicklung.entwicklung };
}
