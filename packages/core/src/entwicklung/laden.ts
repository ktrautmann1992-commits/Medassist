import type { AntwortWert } from "../eingrenzung/antwort";
import { RESERVIERTE_SCHRITTE } from "../eingrenzung/schema";
import { baueSchnellcheck, doppelte } from "../eingrenzung/schnellcheck";
import type { Frage, Katalog, Option } from "../eingrenzung/typen";
import type { Regelwerk } from "../regeln/laden";
import { imMonatsBereich, verfuegbareBereiche } from "./alter";
import { bewerteEntwicklung } from "./ergebnis";
import { OPTION_UNSICHER, type Einstufung, type EntwicklungskatalogDatei } from "./schema";
import type { EntwicklungsAnlaufstelle, EntwicklungsBereich, EntwicklungsFrageMeta, EntwicklungsKatalog } from "./typen";

/**
 * REQ-320, REQ-321: Aufbau und Selbsttests des Entwicklungskatalogs. Fehler werden gesammelt
 * und von `ladeFragenkataloge` als `FragenkatalogFehler` geworfen (Fail-safe, nie stilles
 * Ignorieren). Ergebnis: ein normaler Ablauf-Katalog (`bereich: ENTWICKLUNG`) plus Zusatzdaten.
 */
export const KINDERARZT = "kinderarzt";

export function baueEntwicklung(
  name: string,
  d: EntwicklungskatalogDatei,
  w: Regelwerk,
  fehler: string[],
): { katalog: Katalog; entwicklung: EntwicklungsKatalog } {
  const anzahlVorher = fehler.length;
  const f = (t: string) => fehler.push(`${name}: ${t}`);

  const schnellcheck = baueSchnellcheck(d.schnellcheck, w, f);

  // --- Anlaufstellen ---------------------------------------------------------
  for (const x of doppelte(d.anlaufstellen.map((a) => a.id))) f(`Anlaufstelle „${x}“ ist doppelt.`);
  const anlaufstellen = new Map<string, EntwicklungsAnlaufstelle>(d.anlaufstellen.map((a) => [a.id, a]));
  if (!anlaufstellen.has(KINDERARZT)) f(`Anlaufstelle „${KINDERARZT}“ fehlt.`);

  // --- Pflichtfrage Regression (REQ-321, REQ-324) ------------------------------
  const p = d.pflichtfrage;
  const regression = w.symptome.get(d.regressionSymptom);
  if (!regression) f(`regressionSymptom „${d.regressionSymptom}“ ist nicht im Engine-Vokabular.`);
  else if (!regression.warnzeichen) f(`Selbsttest: regressionSymptom „${d.regressionSymptom}“ ist im Vokabular kein Warnzeichen.`);
  if (!d.schnellcheck.symptome.includes(d.regressionSymptom)) f(`Selbsttest: regressionSymptom fehlt im Schnellcheck.`);
  const pflichtEinstufung = new Map<string, Einstufung>();
  const pflichtOptionen: Option[] = p.optionen.map((o) => {
    if ("id" in o) {
      // QA E1: eigene Option mit Symptom (z. B. „Ich bin mir nicht sicher“) – zählt konservativ als Warnzeichen.
      const s = w.symptome.get(o.symptom);
      if (!s) f(`Pflichtfrage: unbekanntes Symptom „${o.symptom}“.`);
      if (w.symptome.has(o.id)) f(`Pflichtfrage: eigene Option „${o.id}“ hat die ID eines Symptoms.`);
      pflichtEinstufung.set(o.id, o.einstufung);
      return { id: o.id, bezeichnung: o.bezeichnung, fachbegriff: null, symptom: o.symptom, warnzeichen: s?.warnzeichen ?? false };
    }
    if ("symptom" in o) {
      const s = w.symptome.get(o.symptom);
      if (!s) f(`Pflichtfrage: unbekanntes Symptom „${o.symptom}“.`);
      pflichtEinstufung.set(o.symptom, o.einstufung);
      return { id: o.symptom, bezeichnung: s?.bezeichnung ?? o.symptom, fachbegriff: s?.fachbegriff ?? null, symptom: o.symptom, warnzeichen: s?.warnzeichen ?? false };
    }
    throw new Error("unerreichbar");
  });
  for (const x of doppelte(pflichtOptionen.map((o) => o.id))) f(`Pflichtfrage: Option „${x}“ ist doppelt.`);
  if (!p.optionen.some((o) => !("id" in o) && o.symptom === d.regressionSymptom)) {
    f(`Selbsttest: Pflichtfrage „${p.id}“ bietet das Symptom „${d.regressionSymptom}“ nicht an.`);
  }
  for (const [oid, e] of pflichtEinstufung) if (e !== "ABKLAERUNG") f(`Selbsttest: Pflichtfrage, Option „${oid}“ muss ABKLAERUNG sein.`);
  // QA E1/REQ-324: Jede Option außer „Nein“ setzt das Regressions-Symptom (⇒ Regel-Engine, mindestens DRINGEND).
  for (const o of pflichtOptionen) if (o.symptom !== d.regressionSymptom) f(`Selbsttest: Pflichtfrage, Option „${o.id}“ muss das Symptom „${d.regressionSymptom}“ setzen.`);
  const pflichtUnsicher = pflichtOptionen.find((o) => o.id !== o.symptom)?.id ?? null;

  const pflicht: Frage = {
    id: p.id,
    kurz: p.kurz,
    text: p.textKind,
    textKind: p.textKind,
    textFremd: p.textFremd,
    hilfe: p.hilfe ?? null,
    pflicht: true,
    bedingung: null,
    gruppe: null,
    alter: null,
    typ: "mehrfach",
    optionen: pflichtOptionen,
    keineOption: p.keineOption,
  };
  const meta = new Map<string, EntwicklungsFrageMeta>([[p.id, { id: p.id, bereich: null, rolle: "pflicht", alter: null, einstufung: pflichtEinstufung }]]);

  // --- Bereiche und Fragen ------------------------------------------------------
  const fragen: Frage[] = [pflicht];
  const bereiche: EntwicklungsBereich[] = [];
  for (const x of doppelte(d.bereiche.map((b) => b.id))) f(`Bereich „${x}“ ist doppelt.`);
  const alleIds = [p.id, ...d.bereiche.flatMap((b) => b.fragen.map((q) => q.id))];
  for (const x of doppelte(alleIds)) f(`Frage-ID „${x}“ ist doppelt.`);

  for (const b of d.bereiche) {
    const g = (t: string) => f(`Bereich „${b.id}“: ${t}`);
    if (b.alter.minMonate < d.alter.minMonate || b.alter.unterMonate > d.alter.unterMonate) g("Altersbereich liegt außerhalb des Katalogs.");
    if (b.anlaufstellen[0] !== KINDERARZT) g(`erste Anlaufstelle muss „${KINDERARZT}“ sein (Heilmittel nur mit ärztlicher Verordnung).`);
    for (const a of b.anlaufstellen) if (!anlaufstellen.has(a)) g(`unbekannte Anlaufstelle „${a}“.`);
    for (const x of doppelte(b.anlaufstellen)) g(`Anlaufstelle „${x}“ ist doppelt.`);
    const sorge = b.fragen.filter((q) => q.rolle === "sorge");
    if (sorge.length !== 1) g("braucht genau eine Sorge-Frage.");
    else if (sorge[0]!.alter.minMonate !== b.alter.minMonate || sorge[0]!.alter.unterMonate !== b.alter.unterMonate) {
      g("die Sorge-Frage muss den ganzen Altersbereich des Bereichs abdecken.");
    }

    for (const q of b.fragen) {
      const h = (t: string) => g(`Frage „${q.id}“: ${t}`);
      if ((RESERVIERTE_SCHRITTE as readonly string[]).includes(q.id)) h("ID ist reserviert.");
      if (w.fragenIds.has(q.id)) h("ID ist bereits eine Krisenfrage.");
      if (q.alter.minMonate < b.alter.minMonate || q.alter.unterMonate > b.alter.unterMonate) h("Altersbereich liegt außerhalb des Bereichs.");
      for (const x of doppelte(q.optionen.map((o) => o.id))) h(`Option „${x}“ ist doppelt.`);
      for (const o of q.optionen) if (w.symptome.has(o.id)) h(`Option „${o.id}“ hat die ID eines Symptoms.`);
      const unsicher = q.optionen.find((o) => o.id === OPTION_UNSICHER);
      if (!unsicher) h(`Option „${OPTION_UNSICHER}“ fehlt.`);
      else if (unsicher.einstufung === "ALTERSGERECHT") h(`Option „${OPTION_UNSICHER}“ darf nicht ALTERSGERECHT sein.`);
      if (!q.optionen.some((o) => o.einstufung === "ALTERSGERECHT")) h("braucht mindestens eine Option ALTERSGERECHT.");
      // Konservativ: Kern- und Sorge-Fragen kennen nur „unauffällig“ oder „Abklärung empfohlen“.
      if ((q.rolle === "kern" || q.rolle === "sorge") && q.optionen.some((o) => o.einstufung === "BEOBACHTEN")) {
        h("Kern- und Sorge-Fragen: auffällige Optionen müssen ABKLAERUNG sein.");
      }
      if (q.rolle === "sorge" && !q.optionen.some((o) => o.einstufung === "ABKLAERUNG")) h("Sorge-Frage braucht eine Option ABKLAERUNG.");
      fragen.push({
        id: q.id,
        kurz: q.kurz,
        text: q.textKind,
        textKind: q.textKind,
        textFremd: q.textFremd,
        hilfe: q.hilfe ?? null,
        pflicht: true,
        bedingung: null,
        gruppe: b.id,
        alter: q.alter,
        typ: "einfach",
        optionen: q.optionen.map((o) => ({ id: o.id, bezeichnung: o.bezeichnung, fachbegriff: null, symptom: null, warnzeichen: false })),
      });
      meta.set(q.id, { id: q.id, bereich: b.id, rolle: q.rolle, alter: q.alter, einstufung: new Map(q.optionen.map((o) => [o.id, o.einstufung])) });
    }
    bereiche.push({
      id: b.id,
      bezeichnung: b.bezeichnung,
      beschreibung: b.beschreibung,
      alter: b.alter,
      anlaufstellen: b.anlaufstellen.flatMap((a) => (anlaufstellen.has(a) ? [anlaufstellen.get(a)!] : [])),
      foerderideen: b.foerderideen,
      fragen: b.fragen.map((q) => q.id),
    });
  }
  if (d.alter.minMonate < Math.min(...d.bereiche.map((b) => b.alter.minMonate))) f("Katalog-Altersbereich beginnt vor dem ersten Bereich.");

  const katalog: Katalog = {
    bereich: "ENTWICKLUNG",
    version: d.katalogVersion,
    stand: d.stand,
    hinweis: d.hinweis,
    status: d.status,
    quelle: d.quelle,
    quelleHinweis: d.quelleHinweis,
    geprueftVon: d.geprueftVon,
    schnellcheck,
    fragen,
    fragenById: new Map(fragen.map((q) => [q.id, q])),
  };
  const entwicklung: EntwicklungsKatalog = {
    version: d.katalogVersion,
    alter: d.alter,
    regressionSymptom: d.regressionSymptom,
    pflichtfrageId: p.id,
    pflichtUnsicher,
    bereiche,
    bereicheById: new Map(bereiche.map((b) => [b.id, b])),
    meta,
    anlaufstellenQuelle: d.anlaufstellenQuelle,
    ergebnisse: d.ergebnisse,
  };
  if (fehler.length === anzahlVorher) selbsttestKonservativ(katalog, entwicklung, f);
  return { katalog, entwicklung };
}

/**
 * REQ-321: Für jeden Monat des Katalogbereichs und jeden angebotenen Bereich – „unsicher“ bei
 * allen Fragen ⇒ ABKLAERUNG; nur unauffällige Antworten (und „Nein“ bei der Pflichtfrage) ⇒
 * ALTERSGERECHT; Regression ⇒ ABKLAERUNG.
 */
function selbsttestKonservativ(katalog: Katalog, e: EntwicklungsKatalog, f: (t: string) => void) {
  for (let monate = e.alter.minMonate; monate < e.alter.unterMonate; monate++) {
    for (const b of verfuegbareBereiche(e, monate)) {
      const gestellt = b.fragen.filter((fid) => imMonatsBereich(e.meta.get(fid)?.alter ?? null, monate));
      const antworten = (wahl: (fid: string) => string): Record<string, AntwortWert> =>
        Object.fromEntries(gestellt.map((fid) => [fid, { typ: "einfach", option: wahl(fid) } as AntwortWert]));
      const unauffaellig = (fid: string) => [...e.meta.get(fid)!.einstufung].find(([, s]) => s === "ALTERSGERECHT")![0];
      const nein: AntwortWert = { typ: "mehrfach", optionen: [], keine: true, symptome: [] };
      const alter = { monate, korrigiert: false };
      const pruefe = (beschreibung: string, a: Record<string, AntwortWert>, symptome: string[], erwartet: Einstufung) => {
        const r = bewerteEntwicklung(katalog, e, { antworten: a, symptome, bereiche: [b.id] }, alter);
        const ist = r.bereiche[0]?.einstufung;
        if (ist !== erwartet) f(`Selbsttest (${b.id}, ${monate} Monate): ${beschreibung} ergibt ${ist ?? "nichts"} statt ${erwartet}.`);
      };
      pruefe("alles „unsicher“", { ...antworten(() => OPTION_UNSICHER), [e.pflichtfrageId]: nein }, [], "ABKLAERUNG");
      pruefe("nur unauffällige Antworten", { ...antworten(unauffaellig), [e.pflichtfrageId]: nein }, [], "ALTERSGERECHT");
      pruefe("Regression", { ...antworten(unauffaellig), [e.pflichtfrageId]: nein }, [e.regressionSymptom], "ABKLAERUNG");
    }
  }
}
