import type { Beobachtungen } from "./befundlage";
import { normalisiereAntwort } from "./engine";
import type { Regelwerk } from "./laden";
import { ANTWORTEN, type Antwort } from "./schema";

/**
 * REQ-203, REQ-215, REQ-219: Serverseitige Prüfung der Eingaben für die Regelprüfung
 * (z. B. aus einem Formular). **Teilauswertung:** Ungültige Angaben werden verworfen und
 * als Feldfehler gemeldet; alle gültigen Angaben werden trotzdem ausgewertet – ein
 * Tippfehler darf keinen Krisen- oder Notfallhinweis unterdrücken.
 *
 * Mehrfach übermittelte Felder (z. B. manipuliertes Formular) werden konservativ
 * zusammengeführt (B2): Symptome als Vereinigung, Messwerte – alle gültigen Werte
 * werden geprüft, Antworten – nur einheitlich „nein“ gilt als „nein“.
 *
 * Das Alter ist bewusst **kein** Eingabefeld – es kommt aus dem Profil (REQ-204).
 */
export interface RegelEingabeRoh {
  symptome: readonly unknown[];
  /** Paare (Messwert-ID, Text) in Formularreihenfolge; dieselbe ID darf mehrfach vorkommen. */
  messwerte: ReadonlyArray<readonly [string, unknown]>;
  /** Paare (Frage-ID, Antwort) in Formularreihenfolge; dieselbe ID darf mehrfach vorkommen. */
  antworten: ReadonlyArray<readonly [string, unknown]>;
  /** Jeder gesetzte, nicht leere Wert gilt als „seelische Beschwerden“ (S4). */
  psychisch: unknown;
}

export interface RegelEingabeErgebnis {
  /** Immer vorhanden: die gültigen (bzw. konservativ gewerteten) Angaben. */
  daten: Beobachtungen;
  /** Leer, wenn alles gültig war. */
  feldFehler: Record<string, string[]>;
}

// R4-1: höchstens eine Nachkommastelle – „37,39“ könnte zwei Messungen (37 und 39) meinen;
// Körpertemperatur wird üblicherweise mit einer Nachkommastelle angegeben. Im Zweifel ablehnen.
const ZAHL = /^-?\d{1,4}([.,]\d)?$/;

/**
 * N-1/REQ-219: Lesen von Zahlen nach dem Grundsatz **„im Zweifel ablehnen statt
 * interpretieren“** – eine Ablehnung führt zu „Prüfung unvollständig“, eine
 * Fehlinterpretation (z. B. „37, 39“ als 37,39) kann zu Untertriage führen.
 *
 * Toleriert wird nur, was eindeutig ist: Unicode-Normalisierung (z. B. Vollbreiten-
 * Ziffern, „℃“), eine abschließende Einheit „°“, „°C“ oder „C“ („º“ und „˚“ werden vor
 * NFKC wie „°“ behandelt). Danach muss der **ganze** Text genau eine Zahl sein
 * (`ZAHL`). Leerzeichen oder unsichtbare Zeichen innerhalb des Werts, abschließende
 * Trennzeichen („38,“), Exponenten oder mehrere Zahlen werden abgelehnt.
 */
export type ZahlLesung = { ok: true; zahl: number } | { ok: false; grund: "mehrere_werte" | "format" };

/** Normalisierter Text, auf den `leseZahl` die Prüfung anwendet (ohne ihn zu akzeptieren). */
export function normalisiereZahlText(wert: string): string {
  return wert
    .replace(/[º˚∘]/g, "°")
    .normalize("NFKC")
    // Unsichtbare Zeichen zählen als Leerraum – innerhalb des Werts führen sie zur Ablehnung.
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, " ")
    .trim()
    .replace(/\s*(°\s*[cC]?|[cC])$/, "")
    .trim();
}

export function leseZahl(wert: string): ZahlLesung {
  const t = normalisiereZahlText(wert);
  if (/\s/.test(t)) return { ok: false, grund: "mehrere_werte" };
  if (!ZAHL.test(t)) return { ok: false, grund: "format" };
  const zahl = Number(t.replace(",", "."));
  return Number.isFinite(zahl) ? { ok: true, zahl } : { ok: false, grund: "format" };
}

function istGesetzt(wert: unknown): boolean {
  return !(wert === undefined || wert === null || wert === false || (typeof wert === "string" && wert.trim() === ""));
}

function gruppiere(paare: ReadonlyArray<readonly [string, unknown]>): Map<string, unknown[]> {
  const m = new Map<string, unknown[]>();
  for (const [id, wert] of paare) {
    if (typeof id !== "string") continue;
    const liste = m.get(id) ?? [];
    liste.push(wert);
    m.set(id, liste);
  }
  return m;
}

export function pruefeRegelEingabe(w: Regelwerk, roh: RegelEingabeRoh): RegelEingabeErgebnis {
  const feldFehler: Record<string, string[]> = {};
  const fehler = (feld: string, text: string) => {
    const liste = feldFehler[feld] ?? [];
    if (!liste.includes(text)) liste.push(text);
    feldFehler[feld] = liste;
  };

  // Symptome: Vereinigung der bekannten IDs; unbekannte werden gemeldet, nicht ausgewertet.
  const symptome: string[] = [];
  for (const s of roh.symptome) {
    if (typeof s === "string" && w.symptome.has(s)) {
      if (!symptome.includes(s)) symptome.push(s);
    } else fehler("symptome", "Unbekanntes Warnzeichen – nicht berücksichtigt.");
  }

  const messwerte: Record<string, number[]> = {};
  for (const [id, werte] of gruppiere(roh.messwerte)) {
    const m = w.messwerte.get(id);
    const feld = `messwert.${id}`;
    if (!m) {
      fehler(feld, "Unbekannter Messwert – nicht berücksichtigt.");
      continue;
    }
    const gesetzt = werte.filter(istGesetzt);
    if (gesetzt.length > 1) fehler(feld, "Mehrere Werte angegeben – jeder gültige Wert wurde geprüft.");
    for (const wert of gesetzt) {
      const lesung: ZahlLesung = typeof wert === "string" ? leseZahl(wert) : { ok: false, grund: "format" };
      if (!lesung.ok) {
        fehler(
          feld,
          lesung.grund === "mehrere_werte"
            ? "Bitte nur einen Wert angeben, z. B. 38,5. Der Wert wurde nicht berücksichtigt."
            : "Bitte eine Zahl eingeben (z. B. 38,5). Der Wert wurde nicht berücksichtigt.",
        );
        continue;
      }
      const zahl = lesung.zahl;
      // Plausibilitätsbereich nur als Tippfehlerschutz (Status im Vokabular, ggf. ungeprüft).
      if (!Number.isFinite(zahl) || zahl < m.plausibel.min || zahl > m.plausibel.max) {
        fehler(feld, `Wert muss zwischen ${m.plausibel.min} und ${m.plausibel.max} ${m.einheit} liegen. Der Wert wurde nicht berücksichtigt.`);
        continue;
      }
      (messwerte[id] ??= []).push(zahl);
    }
  }

  // Antworten: jede übermittelte Frage zählt (aktiviert den Krisenpfad); ungültige Werte → „keine_angabe“.
  const antworten: Record<string, Antwort> = {};
  for (const [id, werte] of gruppiere(roh.antworten)) {
    const feld = `antwort.${id}`;
    if (!w.fragenIds.has(id)) {
      fehler(feld, "Unbekannte Frage – nicht berücksichtigt.");
      continue;
    }
    const ungueltig = werte.some((x) => istGesetzt(x) && !(typeof x === "string" && (ANTWORTEN as readonly string[]).includes(x)));
    if (ungueltig) fehler(feld, "Ungültige Antwort – zu Ihrer Sicherheit wie „keine Angabe“ gewertet.");
    else if (new Set(werte).size > 1) fehler(feld, "Mehrere Antworten – die vorsichtigste wurde gewertet.");
    antworten[id] = normalisiereAntwort(werte);
  }

  return { daten: { symptome, messwerte, antworten, psychisch: istGesetzt(roh.psychisch) }, feldFehler };
}
