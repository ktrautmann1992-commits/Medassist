/**
 * REQ-402: Freie Beschreibung (Weg 1). Rein und ohne Abhängigkeiten – wird serverseitig
 * und im Zähler der Oberfläche genutzt, damit beide gleich zählen.
 *
 * Leitprinzip (RISK-050): Ein zu langer Text wird **abgelehnt**, nie still gekürzt.
 */

export const MAX_BESCHREIBUNG = 2000;

// Steuerzeichen außer Tab (\u0009) und Zeilenumbruch (\u000A) werden abgelehnt statt still entfernt –
// auch C1-Steuerzeichen (U+0080–U+009F) und die Zeilen-/Absatztrenner U+2028/U+2029 (QA M5).
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/u;
/**
 * QA M5: Unsichtbare Zeichen, die den angezeigten Text verfälschen können (Bidi-Steuerung
 * U+202A–U+202E, U+2066–U+2069; Zero-Width U+200B–U+200D; BOM U+FEFF). Ausnahme: der
 * Zero-Width-Joiner (U+200D) **zwischen zwei Bildzeichen** (Emoji-Sequenzen wie 👩‍⚕️).
 */
const UNSICHTBAR = /[\u200B\u200C\u202A-\u202E\u2066-\u2069\uFEFF]|(?<!\p{Extended_Pictographic}\uFE0F?)\u200D|\u200D(?!\p{Extended_Pictographic})/u;
/** Für die Leer-Prüfung: Leerraum und unsichtbare Zeichen. */
const LEER_ZEICHEN = /[\s\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF\u2028\u2029]/gu;

/**
 * Vereinheitlicht Zeilenumbrüche (Formulare senden CRLF, das Textfeld im Browser zählt LF)
 * und entfernt führende/abschließende Leerzeichen. Sonst nichts – der Inhalt bleibt unverändert.
 */
export function normalisiereBeschreibung(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** Länge, wie sie Server und Zähler der Oberfläche zählen (UTF-16-Einheiten nach Normalisierung). */
export function beschreibungsLaenge(text: string): number {
  return normalisiereBeschreibung(text).length;
}

export type BeschreibungPruefung = { ok: true; text: string } | { ok: false; fehler: string };

export function pruefeBeschreibung(roh: unknown, max = MAX_BESCHREIBUNG): BeschreibungPruefung {
  if (roh !== undefined && roh !== null && typeof roh !== "string") return { ok: false, fehler: "Bitte nur einen Text eingeben." };
  const text = normalisiereBeschreibung(typeof roh === "string" ? roh : "");
  // Ein Text nur aus Leerraum/unsichtbaren Zeichen gilt als leer (QA M5).
  if (!text.replace(LEER_ZEICHEN, "")) return { ok: false, fehler: "Bitte beschreiben Sie Ihre Beschwerden in eigenen Worten." };
  if (text.length > max) {
    return {
      ok: false,
      fehler: `Der Text ist zu lang (${text.length} von höchstens ${max} Zeichen). Bitte kürzen Sie ihn – es wird nichts automatisch abgeschnitten.`,
    };
  }
  if (STEUERZEICHEN.test(text)) return { ok: false, fehler: "Der Text enthält unzulässige Steuerzeichen." };
  if (UNSICHTBAR.test(text)) return { ok: false, fehler: "Der Text enthält unsichtbare Steuerzeichen (z. B. aus einer Kopie). Bitte tippen Sie ihn neu ein." };
  return { ok: true, text };
}
