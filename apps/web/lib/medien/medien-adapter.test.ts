import { describe, expect, it } from "vitest";
import { S3Speicher } from "./speicher-s3";
import { neuerEingangsSchluessel, neuerFotoSchluessel } from "./speicher-typen";
import { erzeugeStt, TEST_TRANSKRIPT } from "./stt-adapter";

describe("REQ-406 STT-Adapter", () => {
  it("„aus“ ⇒ kein Anbieter (Sprachaufnahme deaktiviert)", () => {
    expect(erzeugeStt("aus")).toBeNull();
  });

  it("„test“ ⇒ fester Test-Text; leere Aufnahme ⇒ Fehler", async () => {
    const stt = erzeugeStt("test")!;
    expect(stt.art).toBe("test");
    await expect(stt.transkribiere(new Uint8Array([1, 2, 3]), "audio/webm")).resolves.toEqual({ text: TEST_TRANSKRIPT });
    await expect(stt.transkribiere(new Uint8Array(), "audio/webm")).rejects.toThrow();
  });
});

describe("REQ-408 S3-Adapter: presigned URLs (offline signiert)", () => {
  const s3 = new S3Speicher({
    bucket: "medassist-test",
    region: "eu-central-1",
    endpoint: "https://s3.eu-central-1.example.org",
    accessKeyId: "AKIDTEST",
    secretAccessKey: "geheim-nur-test",
  });

  it("PUT: Content-Type und Content-Length signiert, Laufzeit ≤ 5 min", async () => {
    const k = neuerEingangsSchluessel();
    const ziel = await s3.hochladeUrl({ schluessel: k, mimeType: "image/jpeg", groesseBytes: 1234, gueltigS: 3600 });
    const url = new URL(ziel.url);
    expect(url.origin).toBe("https://s3.eu-central-1.example.org");
    expect(url.pathname).toBe(`/medassist-test/${k}`);
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBe(300);
    const signiert = url.searchParams.get("X-Amz-SignedHeaders")!.split(";");
    expect(signiert).toEqual(expect.arrayContaining(["content-length", "content-type", "host"]));
    expect(ziel.header).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("QA M5: presigned URLs enthalten keine Prüfsummen-Parameter (x-amz-checksum*, x-amz-sdk-checksum*)", async () => {
    const put = (await s3.hochladeUrl({ schluessel: neuerEingangsSchluessel(), mimeType: "image/jpeg", groesseBytes: 1234, gueltigS: 300 })).url;
    const get = await s3.ladeUrl({ schluessel: neuerFotoSchluessel(), mimeType: "image/jpeg", gueltigS: 120 });
    for (const u of [put, get]) {
      const namen = [...new URL(u).searchParams.keys()].map((k) => k.toLowerCase());
      expect(namen.filter((k) => k.startsWith("x-amz-checksum") || k.startsWith("x-amz-sdk-checksum"))).toEqual([]);
      expect(decodeURIComponent(u).toLowerCase()).not.toContain("checksum");
    }
  });

  it("GET: kurze Laufzeit, keine Zwischenspeicherung", async () => {
    const url = new URL(await s3.ladeUrl({ schluessel: neuerFotoSchluessel(), mimeType: "image/jpeg", gueltigS: 120 }));
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBe(120);
    expect(url.searchParams.get("response-cache-control")).toBe("private, no-store");
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.searchParams.get("response-content-disposition")).toBe("inline");
  });

  it("ungültige Schlüssel werden abgewiesen", async () => {
    await expect(s3.hochladeUrl({ schluessel: "anna.jpg", mimeType: "image/jpeg", groesseBytes: 1, gueltigS: 60 })).rejects.toThrow();
  });
});
