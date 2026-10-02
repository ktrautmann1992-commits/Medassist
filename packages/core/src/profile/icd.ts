/**
 * REQ-102: Formatprüfung für ICD-10-GM-Codes (BfArM).
 *
 * Geprüft wird ausschließlich das **Format** (Buchstabe, zwei Ziffern, optional
 * eine oder zwei Nachkommastellen, optional Kennzeichen +, *, ! oder †).
 * Ob ein Code existiert, kann erst mit dem amtlichen Katalog geprüft werden
 * (REQ-040). Die Software ergänzt oder schlägt keine Codes vor.
 */
export const ICD10_GM_FORMAT = /^[A-Z]\d{2}(\.\d{1,2})?[+*!†]?$/;

/** Entfernt Leerzeichen und schreibt Buchstaben groß (z. B. „ j45.0 “ → „J45.0“). */
export function normalisiereIcd10(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function istIcd10GmFormat(code: string): boolean {
  return ICD10_GM_FORMAT.test(normalisiereIcd10(code));
}
