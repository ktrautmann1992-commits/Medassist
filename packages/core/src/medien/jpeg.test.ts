import { describe, expect, it } from "vitest";
import { basisMimeTyp, bereinigeJpeg, erkenneAudioTyp, jpegFehlerText, jpegSegmente, KANONISCHES_APP0, MAX_JPEG_KANTE } from "./jpeg";

/** Segment mit Marker und Inhalt (Länge inkl. der 2 Längenbytes). */
function seg(marker: number, inhalt: number[] | string): number[] {
  const bytes = typeof inhalt === "string" ? [...inhalt].map((c) => c.charCodeAt(0)) : inhalt;
  const laenge = bytes.length + 2;
  return [0xff, marker, laenge >> 8, laenge & 0xff, ...bytes];
}
const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const APP0 = seg(0xe0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
const DQT = seg(0xdb, [0, ...Array(64).fill(1)]);
const SOF0 = seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const DHT = seg(0xc4, [0, ...Array(16).fill(0)]);
const DRI = seg(0xdd, [0, 4]);
const SOS = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
// Bilddaten mit Stuffing (FF00) und Restart-Marker (FFD0)
const DATEN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];

function jpeg(...segmente: number[][]): Uint8Array {
  return new Uint8Array([...SOI, ...segmente.flat(), ...SOS, ...DATEN, ...EOI]);
}
/** Erwartete Ausgabe: SOI, kanonisches APP0, übernommene Segmente, SOS + Daten, EOI. */
function erwartet(...segmente: number[][]): Uint8Array {
  return new Uint8Array([...SOI, ...KANONISCHES_APP0, ...segmente.flat(), ...SOS, ...DATEN, ...EOI]);
}

const GPS = "Exif\0\0MM\0*\0\0\0\x08GPSLatitude=52.5200N;GPSLongitude=13.4050E;Kamera=QA";
const APP1_EXIF = seg(0xe1, GPS);
const APP1_XMP = seg(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>");

function enthaelt(daten: Uint8Array, text: string): boolean {
  return Buffer.from(daten).includes(Buffer.from(text, "latin1"));
}
function ok(daten: Uint8Array): Uint8Array {
  const r = bereinigeJpeg(daten);
  if (!r.ok) throw new Error(`abgelehnt: ${r.grund} ${r.segment ?? ""}`);
  return r.daten;
}

describe("REQ-409 JPEG wird serverseitig neu geschrieben (EXIF/GPS, QA M5)", () => {
  it("Canvas-ähnliches JPEG: Tabellen, Bildkopf, DRI und Scan-Daten bleiben, APP0 wird kanonisch", () => {
    const r = bereinigeJpeg(jpeg(APP0, DQT, SOF0, DHT, DRI));
    expect(r).toMatchObject({ ok: true, entfernt: ["APP0"], breite: 1, hoehe: 1 });
    expect(r.ok && r.daten).toEqual(erwartet(DQT, SOF0, DHT, DRI));
  });

  it("die Ausgabe ist idempotent (zweite Bereinigung ändert nichts)", () => {
    const einmal = ok(jpeg(APP0, APP1_EXIF, DQT, SOF0, DHT));
    expect(ok(einmal)).toEqual(einmal);
  });

  it.each([
    ["APP0 JFIF mit angehängtem Exif/GPS", seg(0xe0, [...txt("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"), ...txt(GPS)])],
    ["APP0 JFXX-Thumbnail mit eingebettetem APP1-Exif", seg(0xe0, [...txt("JFXX\0\x10"), ...SOI, ...APP1_EXIF, ...EOI])],
    ["APP2 ICC_PROFILE mit Exif/GPS-Nutzlast", seg(0xe2, [...txt("ICC_PROFILE\0\x01\x01"), ...txt(GPS)])],
    ["APP14 Adobe mit Nutzlast", seg(0xee, [...txt("Adobe\0\x64\0\0\0\0\x01"), ...txt(GPS)])],
    ["COM mit GPS", seg(0xfe, GPS)],
    ["APP1 Exif", APP1_EXIF],
    ["APP1 XMP", APP1_XMP],
    ["APP13 IPTC/Photoshop", seg(0xed, `Photoshop 3.0\0${GPS}`)],
    ["APP5 unbekannt", seg(0xe5, GPS)],
  ])("%s wird entfernt", (_name, segment) => {
    const r = bereinigeJpeg(jpeg(APP0, segment, DQT, SOF0, DHT));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(enthaelt(r.daten, "GPS")).toBe(false);
    expect(enthaelt(r.daten, "Exif")).toBe(false);
    expect(enthaelt(r.daten, "xmpmeta")).toBe(false);
    expect(r.daten).toEqual(erwartet(DQT, SOF0, DHT));
    // Keine APPn außer dem kanonischen APP0, kein COM
    expect(jpegSegmente(r.daten)).toEqual(["SOI", "APP0", "DQT", "SOF0", "DHT", "SOS", "EOI"]);
  });

  it("Metadaten-Segmente zwischen den Scans (progressives JPEG) werden ebenfalls entfernt", () => {
    const SOF2 = seg(0xc2, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
    const ein = new Uint8Array([...SOI, ...APP1_EXIF, ...DQT, ...SOF2, ...DHT, ...SOS, ...DATEN, ...seg(0xfe, GPS), ...DHT, ...SOS, ...DATEN, ...EOI]);
    const r = bereinigeJpeg(ein);
    expect(r).toMatchObject({ ok: true, entfernt: ["APP1", "COM"] });
    if (!r.ok) return;
    expect(jpegSegmente(r.daten)).toEqual(["SOI", "APP0", "DQT", "SOF2", "DHT", "SOS", "DHT", "SOS", "EOI"]);
    expect(enthaelt(r.daten, "GPS")).toBe(false);
  });

  it("Füllbytes vor Markern und Null-Bytes nach EOI werden nicht übernommen", () => {
    const ein = new Uint8Array([...SOI, 0xff, 0xff, ...APP0, ...DQT, ...SOF0, ...SOS, ...DATEN, 0xff, 0xff, ...EOI, 0, 0]);
    expect(ok(ein)).toEqual(erwartet(DQT, SOF0));
  });

  it("das kanonische APP0 hat 16 Byte Länge und kein Thumbnail", () => {
    expect(KANONISCHES_APP0.length).toBe(18);
    expect((KANONISCHES_APP0[2]! << 8) | KANONISCHES_APP0[3]!).toBe(16);
    expect(KANONISCHES_APP0.slice(16)).toEqual([0, 0]);
  });

  it("Daten nach EOI ⇒ abgelehnt", () => {
    expect(bereinigeJpeg(new Uint8Array([...jpeg(APP0, DQT, SOF0), 0x45, 0x78, 0x69, 0x66]))).toMatchObject({ ok: false, grund: "anhang" });
  });

  it("kaputtes oder unvollständiges JPEG ⇒ abgelehnt", () => {
    expect(bereinigeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toMatchObject({ ok: false, grund: "kein_jpeg" });
    expect(bereinigeJpeg(new Uint8Array([]))).toMatchObject({ ok: false, grund: "kein_jpeg" });
    const voll = jpeg(APP0, DQT, SOF0);
    // ohne EOI
    expect(bereinigeJpeg(voll.slice(0, voll.length - 2))).toMatchObject({ ok: false, grund: "defekt" });
    // Längenangabe über das Dateiende hinaus
    expect(bereinigeJpeg(new Uint8Array([...SOI, 0xff, 0xe0, 0xff, 0xff, 0x4a]))).toMatchObject({ ok: false, grund: "defekt" });
    // Bytes zwischen Segmenten
    expect(bereinigeJpeg(new Uint8Array([...SOI, 0x00, ...DQT, ...SOF0, ...SOS, ...DATEN, ...EOI]))).toMatchObject({ ok: false, grund: "defekt" });
    // SOS ohne Bildkopf
    expect(bereinigeJpeg(new Uint8Array([...SOI, ...SOS, ...DATEN, ...EOI]))).toMatchObject({ ok: false, grund: "defekt" });
    // ohne Bilddaten
    expect(bereinigeJpeg(new Uint8Array([...SOI, ...APP0, ...SOF0, ...EOI]))).toMatchObject({ ok: false, grund: "defekt" });
    // zweites SOI
    expect(bereinigeJpeg(new Uint8Array([...SOI, ...SOI, ...SOF0, ...SOS, ...DATEN, ...EOI]))).toMatchObject({ ok: false, grund: "defekt" });
    // SOF mit falscher Länge
    expect(bereinigeJpeg(jpeg(seg(0xc0, [8, 0, 1, 0, 1, 2, 1, 0x11, 0])))).toMatchObject({ ok: false, grund: "defekt", segment: "SOF" });
    // SOS mit falscher Länge
    expect(bereinigeJpeg(new Uint8Array([...SOI, ...SOF0, ...seg(0xda, [1, 1, 0]), ...DATEN, ...EOI]))).toMatchObject({ ok: false, grund: "defekt", segment: "SOS" });
    // DRI mit falscher Länge
    expect(bereinigeJpeg(jpeg(SOF0, seg(0xdd, [0, 4, 0])))).toMatchObject({ ok: false, grund: "defekt", segment: "DRI" });
  });

  it("unbekannte/nicht unterstützte Marker, mehrere Bildköpfe, Höhe 0 und Riesenbilder ⇒ abgelehnt", () => {
    expect(bereinigeJpeg(jpeg(DQT, seg(0xdc, [0, 1]), SOF0))).toMatchObject({ ok: false, grund: "nicht_unterstuetzt", segment: "FFDC" });
    expect(bereinigeJpeg(jpeg(DQT, seg(0xcc, [0, 1]), SOF0))).toMatchObject({ ok: false, grund: "nicht_unterstuetzt", segment: "FFCC" });
    expect(bereinigeJpeg(jpeg(seg(0xc5, [8, 0, 1, 0, 1, 1, 1, 0x11, 0])))).toMatchObject({ ok: false, grund: "nicht_unterstuetzt" });
    expect(bereinigeJpeg(jpeg(SOF0, SOF0))).toMatchObject({ ok: false, grund: "nicht_unterstuetzt", segment: "SOF" });
    expect(bereinigeJpeg(jpeg(seg(0xc0, [8, 0, 0, 0, 1, 1, 1, 0x11, 0])))).toMatchObject({ ok: false, grund: "nicht_unterstuetzt" });
    const k = MAX_JPEG_KANTE + 1;
    expect(bereinigeJpeg(jpeg(seg(0xc0, [8, k >> 8, k & 0xff, 0, 1, 1, 1, 0x11, 0])))).toMatchObject({ ok: false, grund: "abmessungen" });
  });

  it("Fehlertexte nennen Ablehnung und Löschung", () => {
    for (const grund of ["kein_jpeg", "defekt", "anhang", "nicht_unterstuetzt", "abmessungen"] as const) {
      expect(jpegFehlerText({ ok: false, grund })).toContain("gelöscht");
    }
  });

  it("jpegSegmente liefert bei defekter Struktur null", () => {
    expect(jpegSegmente(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull();
    expect(jpegSegmente(new Uint8Array([1, 2]))).toBeNull();
  });
});

describe("REQ-407 Dateisignatur der Sprachaufnahme", () => {
  it("erkennt WebM, Ogg und MP4", () => {
    expect(erkenneAudioTyp(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("audio/webm");
    expect(erkenneAudioTyp(new Uint8Array([..."OggS"].map((c) => c.charCodeAt(0))))).toBe("audio/ogg");
    expect(erkenneAudioTyp(new Uint8Array([0, 0, 0, 0x18, ..."ftypM4A ".split("").map((c) => c.charCodeAt(0))]))).toBe("audio/mp4");
    expect(erkenneAudioTyp(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("Basistyp ohne Parameter", () => {
    expect(basisMimeTyp("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(basisMimeTyp(" Audio/OGG ")).toBe("audio/ogg");
  });
});
