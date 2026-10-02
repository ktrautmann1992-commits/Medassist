/**
 * Wandelt FormData mit Punkt-Namen in ein verschachteltes Objekt um, z. B.
 * `vorerkrankungen.0.bezeichnung` → `{ vorerkrankungen: [{ bezeichnung }] }`.
 * Numerische Segmente erzeugen Listen. Validiert wird danach mit zod (core).
 *
 * Schutz: keine Prototyp-Schlüssel, nur Textwerte, Index-Obergrenze, Next.js-
 * interne Felder (`$ACTION_…`) werden ignoriert.
 */
const VERBOTEN = new Set(["__proto__", "constructor", "prototype"]);
export const MAX_INDEX = 199;

type Knoten = Record<string, unknown> | unknown[];

export function formDataZuObjekt(
  eintraege: Iterable<[string, FormDataEntryValue]>,
  ignorieren: readonly string[] = [],
): Record<string, unknown> {
  const wurzel: Record<string, unknown> = {};
  for (const [schluessel, wert] of eintraege) {
    if (typeof wert !== "string" || schluessel.startsWith("$") || ignorieren.includes(schluessel)) continue;
    const teile = schluessel.split(".");
    if (teile.some((t) => t === "" || VERBOTEN.has(t) || (istIndex(t) && Number(t) > MAX_INDEX))) continue;
    setze(wurzel, teile, wert);
  }
  return kompakt(wurzel) as Record<string, unknown>;
}

const istIndex = (t: string) => /^\d+$/.test(t);

function setze(wurzel: Knoten, teile: string[], wert: string) {
  let ziel: Knoten = wurzel;
  for (let i = 0; i < teile.length; i++) {
    const teil = teile[i]!;
    const letzter = i === teile.length - 1;
    if (Array.isArray(ziel) !== istIndex(teil)) return; // Struktur passt nicht (z. B. a.0 und a.x)
    const container = ziel as Record<string, unknown>;
    if (letzter) {
      if (container[teil] === undefined) container[teil] = wert;
      return;
    }
    const naechster: unknown = container[teil] ?? (istIndex(teile[i + 1]!) ? [] : {});
    if (typeof naechster !== "object" || naechster === null) return;
    container[teil] = naechster;
    ziel = naechster as Knoten;
  }
}

/** Lücken in Listen werden zu `undefined` (gelten als leere Zeilen, Indizes bleiben erhalten). */
function kompakt(knoten: unknown): unknown {
  if (Array.isArray(knoten)) return Array.from(knoten, kompakt);
  if (knoten && typeof knoten === "object") {
    return Object.fromEntries(Object.entries(knoten).map(([k, v]) => [k, kompakt(v)]));
  }
  return knoten;
}
