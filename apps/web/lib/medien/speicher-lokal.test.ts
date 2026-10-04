import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_GUELTIGKEIT_S, pruefeToken, signiereToken, type DateiToken } from "./signatur";
import { LokalerSpeicher } from "./speicher-lokal";
import { neuerEingangsSchluessel, neuerFotoSchluessel } from "./speicher-typen";

const HMAC = Buffer.alloc(32, 7);
const JETZT = 1_800_000_000;

function speicher(jetzt = JETZT) {
  const wurzel = mkdtempSync(path.join(tmpdir(), "medassist-speicher-"));
  return { s: new LokalerSpeicher({ wurzel, hmacSchluessel: HMAC, jetztS: () => jetzt }), wurzel };
}
const tokenAus = (url: string) => url.split("/").pop()!;
function strom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

describe("REQ-408 Signatur der lokalen Datei-URLs", () => {
  const basis: DateiToken = { m: "GET", k: neuerFotoSchluessel(), u: "nutzer-a", e: JETZT + 60, t: "image/jpeg", n: 0 };

  it("gültiges Token wird angenommen", () => {
    expect(pruefeToken(signiereToken(basis, HMAC), HMAC, JETZT)).toEqual({ ok: true, token: basis });
  });

  it("abgelaufen ⇒ abgelehnt (auch genau zum Ablaufzeitpunkt)", () => {
    expect(pruefeToken(signiereToken(basis, HMAC), HMAC, JETZT + 60)).toEqual({ ok: false, grund: "abgelaufen" });
  });

  it("länger als 5 min gültig ⇒ abgelehnt, auch mit gültiger Signatur", () => {
    expect(pruefeToken(signiereToken({ ...basis, e: JETZT + MAX_GUELTIGKEIT_S + 1 }, HMAC), HMAC, JETZT).ok).toBe(false);
  });

  it("manipulierter Inhalt (Nutzer, Ablauf, Schlüssel) oder anderer Schlüssel ⇒ Signaturfehler", () => {
    const t = signiereToken(basis, HMAC);
    const [, sig] = t.split(".");
    for (const aenderung of [{ u: "nutzer-b" }, { e: JETZT + 250 }, { k: neuerFotoSchluessel() }, { m: "PUT" as const }]) {
      const daten = Buffer.from(JSON.stringify({ ...basis, ...aenderung })).toString("base64url");
      expect(pruefeToken(`${daten}.${sig}`, HMAC, JETZT)).toEqual({ ok: false, grund: "signatur" });
    }
    expect(pruefeToken(t, Buffer.alloc(32, 8), JETZT)).toEqual({ ok: false, grund: "signatur" });
  });

  it("Unsinn und Pfad-Traversal im Schlüssel ⇒ abgelehnt", () => {
    expect(pruefeToken("abc", HMAC, JETZT).ok).toBe(false);
    expect(pruefeToken("a.b.c", HMAC, JETZT).ok).toBe(false);
    expect(pruefeToken(signiereToken({ ...basis, k: "../../etc/passwd" }, HMAC), HMAC, JETZT)).toEqual({ ok: false, grund: "format" });
  });

  it("Schlüssel sind zufällig (128 Bit) und enthalten keine IDs", () => {
    const a = neuerEingangsSchluessel();
    expect(a).toMatch(/^eingang\/[a-f0-9]{32}$/);
    expect(neuerEingangsSchluessel()).not.toBe(a);
    expect(neuerFotoSchluessel()).toMatch(/^fotos\/[a-f0-9]{32}\.jpg$/);
  });
});

describe("REQ-408 lokaler Speicher: Upload/Download über signierte, nutzergebundene URLs", () => {
  const DATEN = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);

  it("PUT mit passendem Typ und exakter Größe ⇒ gespeichert; GET liefert die Datei", async () => {
    const { s } = speicher();
    const k = neuerEingangsSchluessel();
    const ziel = await s.hochladeUrl({ schluessel: k, mimeType: "image/jpeg", groesseBytes: DATEN.length, nutzerId: "a", gueltigS: 300 });
    expect(ziel).toMatchObject({ methode: "PUT", header: { "Content-Type": "image/jpeg" } });
    expect(ziel.url.startsWith("/api/dateien/")).toBe(true);
    const z = s.pruefeZugriff(tokenAus(ziel.url), "PUT", "a");
    expect(z.ok).toBe(true);
    if (!z.ok) return;
    expect(await s.nimmAn(z.token, "image/jpeg", String(DATEN.length), strom(DATEN))).toEqual({ ok: true });
    const r = await s.lese(k, 100);
    expect(r).toEqual({ art: "ok", daten: DATEN });
    expect(await s.lese(k, 3)).toEqual({ art: "zu_gross" });
  });

  it("fremder Nutzer oder ohne Anmeldung ⇒ 404; falsche Methode ⇒ 403", async () => {
    const { s } = speicher();
    const url = await s.ladeUrl({ schluessel: neuerFotoSchluessel(), mimeType: "image/jpeg", nutzerId: "a", gueltigS: 120 });
    expect(s.pruefeZugriff(tokenAus(url), "GET", "b")).toMatchObject({ ok: false, status: 404 });
    expect(s.pruefeZugriff(tokenAus(url), "GET", null)).toMatchObject({ ok: false, status: 404 });
    expect(s.pruefeZugriff(tokenAus(url), "PUT", "a")).toMatchObject({ ok: false, status: 403, grund: "methode" });
  });

  it("abgelaufene URL ⇒ 403", async () => {
    const { s: alt, wurzel } = speicher(JETZT);
    const url = await alt.ladeUrl({ schluessel: neuerFotoSchluessel(), mimeType: "image/jpeg", nutzerId: "a", gueltigS: 120 });
    const spaeter = new LokalerSpeicher({ wurzel, hmacSchluessel: HMAC, jetztS: () => JETZT + 121 });
    expect(spaeter.pruefeZugriff(tokenAus(url), "GET", "a")).toEqual({ ok: false, status: 403, grund: "abgelaufen" });
  });

  it("Gültigkeit wird auf höchstens 5 min begrenzt", async () => {
    const { s } = speicher();
    const url = await s.ladeUrl({ schluessel: neuerFotoSchluessel(), mimeType: "image/jpeg", nutzerId: "a", gueltigS: 3600 });
    const p = pruefeToken(tokenAus(url), HMAC, JETZT);
    expect(p.ok && p.token.e - JETZT).toBe(MAX_GUELTIGKEIT_S);
  });

  it("falscher Typ ⇒ 415, zu groß ⇒ 413, abweichende Größe ⇒ 400, Body länger als angegeben ⇒ 413", async () => {
    const { s } = speicher();
    const token: DateiToken = { m: "PUT", k: neuerEingangsSchluessel(), u: "a", e: JETZT + 60, t: "image/jpeg", n: DATEN.length };
    expect(await s.nimmAn(token, "image/png", String(DATEN.length), strom(DATEN))).toMatchObject({ status: 415 });
    expect(await s.nimmAn(token, null, String(DATEN.length), strom(DATEN))).toMatchObject({ status: 415 });
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length + 1), strom(DATEN))).toMatchObject({ status: 413 });
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length - 1), strom(DATEN))).toMatchObject({ status: 400 });
    expect(await s.nimmAn(token, "image/jpeg", null, strom(DATEN))).toMatchObject({ status: 400 });
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length), strom(new Uint8Array(DATEN.length + 5)))).toMatchObject({ status: 413 });
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length), strom(DATEN.slice(1)))).toMatchObject({ status: 400 });
    expect(await s.lese(token.k, 100)).toEqual({ art: "fehlt" });
  });

  it("kein Überschreiben (409); Löschen entfernt die Datei; fehlende Datei ⇒ 404", async () => {
    const { s, wurzel } = speicher();
    const token: DateiToken = { m: "PUT", k: neuerEingangsSchluessel(), u: "a", e: JETZT + 60, t: "image/jpeg", n: DATEN.length };
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length), strom(DATEN))).toEqual({ ok: true });
    expect(await s.nimmAn(token, "image/jpeg", String(DATEN.length), strom(DATEN))).toMatchObject({ status: 409 });
    await s.loesche(token.k);
    expect(readdirSync(path.join(wurzel, "eingang"))).toEqual([]);
    expect(await s.liefere({ ...token, m: "GET", n: 0 })).toEqual({ ok: false, status: 404 });
    await expect(s.loesche(token.k)).resolves.toBeUndefined();
  });

  it("ungültige Schlüssel werden nie als Pfad verwendet", async () => {
    const { s } = speicher();
    await expect(s.lese("../geheim", 10)).rejects.toThrow();
    await expect(s.hochladeUrl({ schluessel: "fotos/anna-mueller.jpg", mimeType: "image/jpeg", groesseBytes: 1, nutzerId: "a", gueltigS: 60 })).rejects.toThrow();
  });
});
