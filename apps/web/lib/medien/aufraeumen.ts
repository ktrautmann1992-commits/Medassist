import type { ObjektSpeicher } from "./speicher-typen";

/**
 * REQ-407, REQ-411, REQ-414 (QA M5): Aufräumen von Speicherobjekten – rein und ohne Datenbank-
 * oder Next.js-Abhängigkeit, damit es ohne Infrastruktur testbar ist. Die Server-Wrapper
 * (`auftrag.ts`, `fotos.ts`) übergeben Datenbankzugriff und Speicher.
 */

export interface AbgelaufeneAuftraege {
  /** Offene (nicht erledigte) Aufträge, deren Laufzeit vor `jetzt` endete – höchstens `max`. */
  finde(jetzt: Date, max: number): Promise<{ id: string; eingangsSchluessel: string }[]>;
  /**
   * Schließt einen abgelaufenen Auftrag **atomar** (nur wenn noch offen) mit Ergebnis „abgelaufen“.
   * `false`, wenn ihn inzwischen jemand anderes beansprucht hat – dann wird nichts gelöscht.
   */
  schliesse(id: string, jetzt: Date): Promise<boolean>;
}

export interface AufraeumErgebnis {
  geschlossen: number;
  geloescht: number;
  fehler: number;
}

/** Höchstzahl je Durchlauf – der Aufruf erfolgt opportunistisch bei neuen Aufträgen. */
export const AUFRAEUMEN_MAX = 50;

/**
 * Abgelaufene, nie registrierte/transkribierte Aufträge schließen und ihre Eingangsobjekte
 * (Foto- und Audio-Eingang) löschen. Fehler beim Löschen werden gezählt, nicht geworfen –
 * verbleibende Objekte entfernt die Lebenszyklusregel des Speichers (Pflicht, RISK-051).
 */
export async function raeumeAbgelaufeneAuf(
  auftraege: AbgelaufeneAuftraege,
  speicher: Pick<ObjektSpeicher, "loesche">,
  jetzt: Date = new Date(),
  max: number = AUFRAEUMEN_MAX,
): Promise<AufraeumErgebnis> {
  const ergebnis: AufraeumErgebnis = { geschlossen: 0, geloescht: 0, fehler: 0 };
  for (const a of await auftraege.finde(jetzt, max)) {
    if (!(await auftraege.schliesse(a.id, jetzt))) continue;
    ergebnis.geschlossen++;
    try {
      await speicher.loesche(a.eingangsSchluessel);
      ergebnis.geloescht++;
    } catch {
      ergebnis.fehler++;
    }
  }
  return ergebnis;
}

/**
 * Löscht Speicherobjekte (z. B. alle Fotos und Eingänge eines Falls) und liefert die Schlüssel,
 * deren Löschung fehlschlug. Aufrufer brechen dann ab, **bevor** Datensätze gelöscht werden –
 * sonst entstünden verwaiste Objekte ohne Verweis (REQ-414).
 */
export async function loescheObjekte(speicher: Pick<ObjektSpeicher, "loesche">, schluessel: readonly string[]): Promise<string[]> {
  const fehlgeschlagen: string[] = [];
  for (const k of new Set(schluessel)) {
    try {
      await speicher.loesche(k);
    } catch {
      fehlgeschlagen.push(k);
    }
  }
  return fehlgeschlagen;
}
