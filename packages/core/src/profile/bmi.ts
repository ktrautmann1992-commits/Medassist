/**
 * REQ-033: BMI wird aus Größe und Gewicht berechnet (nicht gespeichert).
 * Plausibilitätsgrenzen decken Neugeborene bis Erwachsene ab; Werte außerhalb
 * werden abgewiesen statt stillschweigend verrechnet.
 *
 * Hinweis: Bei Kindern ist der BMI nur zusammen mit alters- und geschlechts-
 * spezifischen Perzentilen aussagekräftig (folgt mit Meilenstein 2).
 */

export const GROESSE_CM = { min: 30, max: 250 } as const;
export const GEWICHT_KG = { min: 0.3, max: 400 } as const;

export function pruefeGroesse(cm: number): void {
  if (!Number.isFinite(cm) || cm < GROESSE_CM.min || cm > GROESSE_CM.max) {
    throw new RangeError(`Körpergröße muss zwischen ${GROESSE_CM.min} und ${GROESSE_CM.max} cm liegen.`);
  }
}

export function pruefeGewicht(kg: number): void {
  if (!Number.isFinite(kg) || kg < GEWICHT_KG.min || kg > GEWICHT_KG.max) {
    throw new RangeError(`Gewicht muss zwischen ${GEWICHT_KG.min} und ${GEWICHT_KG.max} kg liegen.`);
  }
}

/** BMI in kg/m², auf eine Nachkommastelle gerundet. */
export function berechneBmi(groesseCm: number, gewichtKg: number): number {
  pruefeGroesse(groesseCm);
  pruefeGewicht(gewichtKg);
  const m = groesseCm / 100;
  return Math.round((gewichtKg / (m * m)) * 10) / 10;
}
