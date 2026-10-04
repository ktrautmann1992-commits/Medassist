/**
 * REQ-207, REQ-208: Notruf- und Krisennummern – zentral und exakt nach CLAUDE.md §5.
 * Nur hier pflegen; Oberfläche und Texte beziehen sich auf diese Konstanten (RISK-028).
 */
export interface Kontakt {
  /** Anzeigeform, z. B. „0800 111 0 111“. */
  nummer: string;
  /** `tel:`-Link ohne Leerzeichen. */
  href: string;
  bezeichnung: string;
}

function kontakt(nummer: string, bezeichnung: string): Kontakt {
  return { nummer, href: `tel:${nummer.replace(/\s/g, "")}`, bezeichnung };
}

export const NOTRUF: Kontakt = kontakt("112", "Notruf");
export const BEREITSCHAFTSDIENST: Kontakt = kontakt("116117", "Ärztlicher Bereitschaftsdienst");
export const TELEFONSEELSORGE: readonly Kontakt[] = [
  kontakt("0800 111 0 111", "Telefonseelsorge"),
  kontakt("0800 111 0 222", "Telefonseelsorge"),
];

/** Anlaufstellen, auf die eine Regel verweisen kann. */
export const ANLAUFSTELLEN = ["NOTRUF_112", "BEREITSCHAFTSDIENST_116117", "KRISE_AKUTVORSTELLUNG"] as const;
export type Anlaufstelle = (typeof ANLAUFSTELLEN)[number];

export const ANLAUFSTELLE_TEXT: Record<Anlaufstelle, string> = {
  NOTRUF_112: `Notruf ${NOTRUF.nummer}`,
  BEREITSCHAFTSDIENST_116117: `Ärztlicher Bereitschaftsdienst ${BEREITSCHAFTSDIENST.nummer}`,
  KRISE_AKUTVORSTELLUNG: `Ärztliche Akutvorstellung; Notruf ${NOTRUF.nummer}, Telefonseelsorge ${TELEFONSEELSORGE.map((k) => k.nummer).join(" / ")}`,
};
