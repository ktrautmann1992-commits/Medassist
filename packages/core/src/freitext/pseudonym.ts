/**
 * REQ-404 (CLAUDE.md §7): Pseudonymisierung vor einer späteren Übertragung an KI- oder
 * STT-Dienste. Ersetzt ausschließlich **bekannte** Namen (Vor-/Nachname aus Profil und Konto)
 * und **bekannte** E-Mail-Adressen. Bewusst **keine Heuristik** (keine Namenserkennung,
 * keine Wortlisten): Medizinische Begriffe bleiben unverändert – außer sie sind selbst
 * ein bekannter Name (dokumentierte Grenze).
 *
 * Wird in Meilenstein 5 nur in Tests aufgerufen; Pflicht vor jeder KI-Übertragung (Meilenstein 6).
 */

export const NAME_PLATZHALTER = "[NAME]";
export const EMAIL_PLATZHALTER = "[E-MAIL]";
/** Kürzere „Namen“ (z. B. Initialen) werden nicht ersetzt – sie würden sonst Wortteile/Abkürzungen treffen. */
export const MIN_NAMENSLAENGE = 2;

export interface PseudonymOptionen {
  /** Bekannte Namen bzw. Namensteile, z. B. ["Anna", "Müller-Lüdenscheidt"]. */
  namen?: readonly (string | null | undefined)[];
  /** Bekannte E-Mail-Adressen, z. B. die Adresse des Kontos. */
  emails?: readonly (string | null | undefined)[];
}

export interface PseudonymErgebnis {
  text: string;
  ersetzungen: number;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bereinige(werte: readonly (string | null | undefined)[] | undefined): string[] {
  const set = new Set<string>();
  for (const w of werte ?? []) {
    const t = (w ?? "").normalize("NFC").trim();
    if (t.length >= MIN_NAMENSLAENGE) set.add(t);
  }
  return sortiere(set);
}

/** Namen zusätzlich an Bindestrichen und Leerzeichen zerlegen: „Anna-Lena“ ⇒ auch „Anna“ und „Lena“ (QA M5). */
function mitNamensteilen(namen: string[]): string[] {
  const set = new Set(namen);
  for (const n of namen) {
    for (const teil of n.split(/[\s\-\u2010\u2011]+/u)) if (teil.length >= MIN_NAMENSLAENGE) set.add(teil);
  }
  return sortiere(set);
}

function sortiere(set: Set<string>): string[] {
  // Längste zuerst: „Anna-Lena“ vor „Anna“.
  return [...set].sort((a, b) => b.length - a.length);
}

export function pseudonymisiere(text: string, optionen: PseudonymOptionen): PseudonymErgebnis {
  const emails = bereinige(optionen.emails);
  const namen = mitNamensteilen(bereinige(optionen.namen));
  const eingabe = text.normalize("NFC");
  if (!emails.length && !namen.length) return { text: eingabe, ersetzungen: 0 };
  // Ein einziger Durchlauf: Platzhalter werden nie erneut ersetzt (z. B. Name „Name“ in „[NAME]“).
  // E-Mail-Adressen zuerst (sie können einen Namen enthalten), Namen nur als ganze Wörter.
  const teile: string[] = [];
  if (emails.length) teile.push(`(?<![\\w.+-])(${emails.map(escape).join("|")})(?![\\w-]|\\.[\\w-])`);
  if (namen.length) teile.push(`(?<![\\p{L}\\p{N}\\p{M}])(?:${namen.map(escape).join("|")})(?![\\p{L}\\p{N}\\p{M}])`);
  const re = new RegExp(teile.join("|"), "giu");
  let ersetzungen = 0;
  const ergebnis = eingabe.replace(re, (_treffer, email?: string) => {
    ersetzungen++;
    return emails.length && email !== undefined ? EMAIL_PLATZHALTER : NAME_PLATZHALTER;
  });
  return { text: ergebnis, ersetzungen };
}
