import type { Regelwerk } from "../regeln/laden";
import type { FragenkatalogDatei } from "./schema";
import type { Schnellcheck } from "./typen";

export function doppelte(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
}

/** REQ-306: Schnellcheck – Vokabular-IDs müssen existieren; jedes Warnzeichen muss enthalten sein (auch Weg 3). */
export function baueSchnellcheck(d: FragenkatalogDatei["schnellcheck"], w: Regelwerk, f: (t: string) => void): Schnellcheck {
  for (const s of d.symptome) if (!w.symptome.has(s)) f(`Schnellcheck: unbekanntes Symptom „${s}“.`);
  for (const m of d.messwerte) if (!w.messwerte.has(m)) f(`Schnellcheck: unbekannter Messwert „${m}“.`);
  for (const x of doppelte(d.symptome)) f(`Schnellcheck: Symptom „${x}“ ist doppelt.`);
  for (const s of w.symptome.values()) {
    if (s.warnzeichen && !d.symptome.includes(s.id)) f(`Selbsttest: Warnzeichen „${s.id}“ fehlt im Schnellcheck.`);
  }
  return {
    titel: d.titel,
    text: d.text,
    textKind: d.textKind,
    textFremd: d.textFremd,
    hilfe: d.hilfe,
    keineText: d.keineText,
    symptome: d.symptome.map((s) => {
      const v = w.symptome.get(s);
      return { id: s, bezeichnung: v?.bezeichnung ?? s, fachbegriff: v?.fachbegriff ?? null, symptom: s, warnzeichen: v?.warnzeichen ?? false };
    }),
    messwerte: d.messwerte.map((m) => {
      const v = w.messwerte.get(m);
      return { id: m, bezeichnung: v?.bezeichnung ?? m, einheit: v?.einheit ?? "", min: v?.plausibel.min ?? 0, max: v?.plausibel.max ?? 0, status: v?.plausibelStatus ?? "ungeprüft" };
    }),
  };
}
