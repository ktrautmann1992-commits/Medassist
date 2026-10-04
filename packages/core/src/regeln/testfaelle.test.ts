import { describe, expect, it } from "vitest";
import testfaelle from "../../../../content/regeln/testfaelle.json" with { type: "json" };
import { befundlageFuerProfil } from "./befundlage";
import { pruefeVorrangig } from "./engine";
import { standardRegelwerk } from "./standard";
import { testfallDateiSchema } from "./testfaelle-schema";

/**
 * REQ-217: Klinische Testfälle als Daten (`content/regeln/testfaelle.json`).
 * Erwartet werden Status, ausgelöste Regel-IDs in Rangfolge (Krisenpfad zuerst)
 * und `ablaufBeenden`.
 */
const datei = testfallDateiSchema.parse(testfaelle);
const regelwerk = standardRegelwerk();
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("REQ-217 klinische Testfälle", () => {
  it("Testfälle passen zur Regelwerk-Version und haben eindeutige IDs", () => {
    expect(datei.regelwerkVersion).toBe(regelwerk.version);
    expect(new Set(datei.faelle.map((f) => f.id)).size).toBe(datei.faelle.length);
  });

  it("jede Regel wird von mindestens einem Testfall ausgelöst", () => {
    const ausgeloest = new Set(datei.faelle.flatMap((f) => f.erwartet.regelIds));
    for (const r of [...regelwerk.redFlags, ...regelwerk.krisenRegeln, regelwerk.sicherheitsnetz]) expect(ausgeloest, r.id).toContain(r.id);
  });

  it.each(datei.faelle.map((f) => [f.id, f.beschreibung, f] as const))("%s %s", (_id, _b, fall) => {
    const befund = befundlageFuerProfil(
      { ...fall.profil, geburtsdatum: tag(fall.profil.geburtsdatum) },
      fall.eingabe,
      tag(fall.stichtag ?? datei.stichtag),
    );
    const e = pruefeVorrangig(regelwerk, befund);
    expect(e.status).toBe(fall.erwartet.status);
    expect([...e.krisenRegeln, ...e.redFlags].map((r) => r.id)).toEqual(fall.erwartet.regelIds);
    expect(e.ablaufBeenden).toBe(fall.erwartet.ablaufBeenden);
    expect(e.befundlageFehler).toHaveLength(fall.erwartet.befundlageFehler);
    expect(e.regelwerkVersion).toBe(regelwerk.version);
  });
});
