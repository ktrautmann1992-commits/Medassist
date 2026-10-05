import { describe, expect, it } from "vitest";
import { loescheObjekte, raeumeAbgelaufeneAuf, type AbgelaufeneAuftraege } from "./aufraeumen";

type Auftrag = { id: string; eingangsSchluessel: string; laeuftAbAm: Date; erledigtAm: Date | null; ergebnis: string | null };

/** In-Memory-Nachbildung von Datenbank und Speicher. */
function umgebung(auftraege: Auftrag[], objekte: string[], kaputt: string[] = []) {
  const speicher = new Set(objekte);
  const repo: AbgelaufeneAuftraege = {
    async finde(jetzt, max) {
      return auftraege.filter((a) => a.erledigtAm === null && a.laeuftAbAm < jetzt).slice(0, max);
    },
    async schliesse(id, jetzt) {
      const a = auftraege.find((x) => x.id === id && x.erledigtAm === null && x.laeuftAbAm < jetzt);
      if (!a) return false;
      a.erledigtAm = jetzt;
      a.ergebnis = "abgelaufen";
      return true;
    },
  };
  const loesche = async (k: string) => {
    if (kaputt.includes(k)) throw new Error("Speicher nicht erreichbar");
    speicher.delete(k);
  };
  return { repo, speicher, loesche };
}

const JETZT = new Date("2026-10-04T12:00:00Z");
const vorher = (min: number) => new Date(JETZT.getTime() - min * 60_000);
const nachher = (min: number) => new Date(JETZT.getTime() + min * 60_000);

describe("REQ-414 Aufräumen abgelaufener Hochladeaufträge (QA M5)", () => {
  it("löscht Foto- und Audio-Eingänge abgelaufener offener Aufträge und schließt sie", async () => {
    const auftraege: Auftrag[] = [
      { id: "foto", eingangsSchluessel: "eingang/a", laeuftAbAm: vorher(1), erledigtAm: null, ergebnis: null },
      { id: "audio", eingangsSchluessel: "eingang/b", laeuftAbAm: vorher(60), erledigtAm: null, ergebnis: null },
      { id: "offen", eingangsSchluessel: "eingang/c", laeuftAbAm: nachher(5), erledigtAm: null, ergebnis: null },
      { id: "erledigt", eingangsSchluessel: "eingang/d", laeuftAbAm: vorher(5), erledigtAm: vorher(6), ergebnis: "angenommen" },
    ];
    const u = umgebung(auftraege, ["eingang/a", "eingang/b", "eingang/c", "fotos/x.jpg"]);
    const r = await raeumeAbgelaufeneAuf(u.repo, { loesche: u.loesche }, JETZT);
    expect(r).toEqual({ geschlossen: 2, geloescht: 2, fehler: 0 });
    expect([...u.speicher].sort()).toEqual(["eingang/c", "fotos/x.jpg"]);
    expect(auftraege.find((a) => a.id === "foto")).toMatchObject({ ergebnis: "abgelaufen", erledigtAm: JETZT });
    // laufende und bereits erledigte Aufträge bleiben unverändert
    expect(auftraege.find((a) => a.id === "offen")?.erledigtAm).toBeNull();
    expect(auftraege.find((a) => a.id === "erledigt")?.ergebnis).toBe("angenommen");
  });

  it("ein inzwischen beanspruchter Auftrag wird nicht angefasst (kein Löschen unter laufender Registrierung)", async () => {
    const auftraege: Auftrag[] = [{ id: "x", eingangsSchluessel: "eingang/x", laeuftAbAm: vorher(1), erledigtAm: null, ergebnis: null }];
    const u = umgebung(auftraege, ["eingang/x"]);
    const repo: AbgelaufeneAuftraege = { finde: u.repo.finde, schliesse: async () => false };
    expect(await raeumeAbgelaufeneAuf(repo, { loesche: u.loesche }, JETZT)).toEqual({ geschlossen: 0, geloescht: 0, fehler: 0 });
    expect(u.speicher.has("eingang/x")).toBe(true);
  });

  it("Speicherfehler werden gezählt, nicht geworfen; höchstens `max` je Durchlauf", async () => {
    const auftraege: Auftrag[] = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, eingangsSchluessel: `eingang/${i}`, laeuftAbAm: vorher(1), erledigtAm: null, ergebnis: null }));
    const u = umgebung(auftraege, ["eingang/0", "eingang/1", "eingang/2"], ["eingang/1"]);
    expect(await raeumeAbgelaufeneAuf(u.repo, { loesche: u.loesche }, JETZT, 3)).toEqual({ geschlossen: 3, geloescht: 2, fehler: 1 });
    expect(auftraege.filter((a) => a.erledigtAm === null)).toHaveLength(2);
  });
});

describe("REQ-414 Speicherobjekte vor Datensätzen löschen", () => {
  it("liefert die fehlgeschlagenen Schlüssel (Aufrufer bricht vor dem Löschen der Datensätze ab)", async () => {
    const u = umgebung([], ["fotos/a.jpg", "fotos/b.jpg", "eingang/c"], ["fotos/b.jpg"]);
    expect(await loescheObjekte({ loesche: u.loesche }, ["fotos/a.jpg", "fotos/b.jpg", "eingang/c", "fotos/a.jpg"])).toEqual(["fotos/b.jpg"]);
    expect([...u.speicher]).toEqual(["fotos/b.jpg"]);
    expect(await loescheObjekte({ loesche: u.loesche }, [])).toEqual([]);
  });
});
