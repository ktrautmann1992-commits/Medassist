import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { basisMimeTyp } from "@medassist/core";
import { MAX_GUELTIGKEIT_S, pruefeToken, SCHLUESSEL_MUSTER, signiereToken, type DateiToken } from "./signatur";
import type { HochladeZiel, LeseErgebnis, ObjektSpeicher } from "./speicher-typen";

/**
 * REQ-408: Lokaler Objektspeicher – **nur Entwicklung/Test** (Startprüfung REQ-412). Dateien
 * liegen unter einem gitignorierten Ordner; Zugriff ausschließlich über HMAC-signierte,
 * nutzergebundene URLs der Route `/api/dateien/<token>` (≤ 5 min). Die HTTP-Logik steckt hier,
 * damit sie ohne Next.js testbar ist.
 */
export type ZugriffsPruefung = { ok: true; token: DateiToken } | { ok: false; status: 403 | 404; grund: string };
export type AnnahmeErgebnis = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409 | 413 | 415; grund: string };

export class LokalerSpeicher implements ObjektSpeicher {
  readonly art = "lokal" as const;
  private readonly wurzel: string;
  private readonly hmac: Buffer;
  private readonly basisPfad: string;
  private readonly jetztS: () => number;

  constructor(opts: { wurzel: string; hmacSchluessel: Buffer; basisPfad?: string; jetztS?: () => number }) {
    this.wurzel = path.resolve(opts.wurzel);
    this.hmac = opts.hmacSchluessel;
    this.basisPfad = opts.basisPfad ?? "/api/dateien";
    this.jetztS = opts.jetztS ?? (() => Math.floor(Date.now() / 1000));
  }

  private pfad(schluessel: string): string {
    // Nur zufällige Schlüssel nach festem Muster – kein Pfad aus Nutzereingaben (Path Traversal).
    if (!SCHLUESSEL_MUSTER.test(schluessel)) throw new Error("Ungültiger Objektschlüssel.");
    return path.join(this.wurzel, schluessel);
  }

  private url(token: DateiToken): string {
    return `${this.basisPfad}/${signiereToken(token, this.hmac)}`;
  }

  private ablauf(gueltigS: number): number {
    return this.jetztS() + Math.max(1, Math.min(gueltigS, MAX_GUELTIGKEIT_S));
  }

  async hochladeUrl(p: { schluessel: string; mimeType: string; groesseBytes: number; nutzerId: string; gueltigS: number }): Promise<HochladeZiel> {
    this.pfad(p.schluessel);
    const url = this.url({ m: "PUT", k: p.schluessel, u: p.nutzerId, e: this.ablauf(p.gueltigS), t: p.mimeType, n: p.groesseBytes });
    return { url, methode: "PUT", header: { "Content-Type": p.mimeType } };
  }

  async ladeUrl(p: { schluessel: string; mimeType: string; nutzerId: string; gueltigS: number }): Promise<string> {
    this.pfad(p.schluessel);
    return this.url({ m: "GET", k: p.schluessel, u: p.nutzerId, e: this.ablauf(p.gueltigS), t: p.mimeType, n: 0 });
  }

  async lese(schluessel: string, maxBytes: number): Promise<LeseErgebnis> {
    const datei = this.pfad(schluessel);
    try {
      const s = await stat(datei);
      if (s.size > maxBytes) return { art: "zu_gross" };
      return { art: "ok", daten: new Uint8Array(await readFile(datei)) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { art: "fehlt" };
      throw e;
    }
  }

  async schreibe(schluessel: string, daten: Uint8Array): Promise<void> {
    const datei = this.pfad(schluessel);
    await mkdir(path.dirname(datei), { recursive: true });
    // `wx`: nie überschreiben.
    await writeFile(datei, daten, { flag: "wx" });
  }

  async loesche(schluessel: string): Promise<void> {
    await rm(this.pfad(schluessel), { force: true });
  }

  /**
   * Prüft ein Token für eine Anfrage: Signatur und Ablauf (sonst 403), Methode (403),
   * Bindung an den angemeldeten Nutzer (sonst 404 – keine Auskunft über die Existenz).
   */
  pruefeZugriff(roh: string, methode: "PUT" | "GET", nutzerId: string | null): ZugriffsPruefung {
    const p = pruefeToken(roh, this.hmac, this.jetztS());
    if (!p.ok) return { ok: false, status: 403, grund: p.grund };
    if (p.token.m !== methode) return { ok: false, status: 403, grund: "methode" };
    if (!nutzerId || p.token.u !== nutzerId) return { ok: false, status: 404, grund: "nutzer" };
    return { ok: true, token: p.token };
  }

  /** PUT: Content-Type und exakte Größe wie signiert; Inhalt höchstens `n` Byte; kein Überschreiben. */
  async nimmAn(token: DateiToken, contentType: string | null, contentLength: string | null, body: ReadableStream<Uint8Array> | null): Promise<AnnahmeErgebnis> {
    if (!contentType || basisMimeTyp(contentType) !== token.t) return { ok: false, status: 415, grund: "typ" };
    const angegeben = contentLength !== null && /^\d{1,9}$/.test(contentLength) ? Number(contentLength) : Number.NaN;
    if (Number.isNaN(angegeben)) return { ok: false, status: 400, grund: "laenge_fehlt" };
    if (angegeben > token.n) return { ok: false, status: 413, grund: "zu_gross" };
    if (angegeben !== token.n) return { ok: false, status: 400, grund: "laenge" };
    const daten = await leseBegrenzt(body, token.n);
    if (daten === null) return { ok: false, status: 413, grund: "zu_gross" };
    if (daten.length !== token.n) return { ok: false, status: 400, grund: "laenge" };
    try {
      await this.schreibe(token.k, daten);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return { ok: false, status: 409, grund: "vorhanden" };
      throw e;
    }
    return { ok: true };
  }

  /** GET: Objekt liefern (fehlt ⇒ 404). */
  async liefere(token: DateiToken): Promise<{ ok: true; daten: Uint8Array; mimeType: string } | { ok: false; status: 404 }> {
    const r = await this.lese(token.k, 50 * 1024 * 1024);
    return r.art === "ok" ? { ok: true, daten: r.daten, mimeType: token.t } : { ok: false, status: 404 };
  }
}

/** Liest höchstens `max` Byte; mehr ⇒ `null` (Abbruch, ohne alles in den Speicher zu laden). */
export async function leseBegrenzt(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const teile: Uint8Array[] = [];
  let laenge = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    laenge += value.length;
    if (laenge > max) {
      await reader.cancel();
      return null;
    }
    teile.push(value);
  }
  const ergebnis = new Uint8Array(laenge);
  let i = 0;
  for (const t of teile) {
    ergebnis.set(t, i);
    i += t.length;
  }
  return ergebnis;
}
