import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_GUELTIGKEIT_S, SCHLUESSEL_MUSTER } from "./signatur";
import type { HochladeZiel, LeseErgebnis, ObjektSpeicher } from "./speicher-typen";

/**
 * REQ-408: S3-kompatibler Objektspeicher (für einen EU-Anbieter; Wahl offen, REQ-406/RISK-044).
 * Presigned PUT/GET mit Laufzeit ≤ 5 min; beim Upload sind Content-Type **und** Content-Length
 * signiert (der Client kann weder Typ noch Größe ändern). Presigned URLs sind – anders als im
 * lokalen Adapter – nicht an einen Nutzer gebunden (nur kurze Laufzeit, RISK-046).
 */
export interface S3Konfiguration {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function pruefeSchluessel(schluessel: string): void {
  if (!SCHLUESSEL_MUSTER.test(schluessel)) throw new Error("Ungültiger Objektschlüssel.");
}

function laufzeit(gueltigS: number): number {
  return Math.max(1, Math.min(gueltigS, MAX_GUELTIGKEIT_S));
}

function istNichtGefunden(e: unknown): boolean {
  return e instanceof S3ServiceException && (e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404);
}

export class S3Speicher implements ObjektSpeicher {
  readonly art = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3Konfiguration) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Pfad-Stil: von den meisten S3-kompatiblen Anbietern unterstützt (Bucket nicht im Hostnamen).
      forcePathStyle: true,
      // QA M5: Prüfsummen nur, wenn die API sie verlangt. Sonst signiert das SDK einen
      // `x-amz-checksum-crc32`-Parameter des **leeren** Bodys in die presigned PUT-URL (Upload
      // schlägt fehl) und hängt `x-amz-checksum-mode` an GET-URLs.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async hochladeUrl(p: { schluessel: string; mimeType: string; groesseBytes: number; gueltigS: number }): Promise<HochladeZiel> {
    pruefeSchluessel(p.schluessel);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: p.schluessel, ContentType: p.mimeType, ContentLength: p.groesseBytes }),
      { expiresIn: laufzeit(p.gueltigS), signableHeaders: new Set(["content-type", "content-length"]) },
    );
    return { url, methode: "PUT", header: { "Content-Type": p.mimeType } };
  }

  async ladeUrl(p: { schluessel: string; mimeType: string; gueltigS: number }): Promise<string> {
    pruefeSchluessel(p.schluessel);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: p.schluessel,
        // Antwort-Header fest vorgeben (nicht vom gespeicherten Objekt übernehmen): Typ, Anzeige inline, kein Cache.
        ResponseContentType: p.mimeType,
        ResponseContentDisposition: "inline",
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: laufzeit(p.gueltigS) },
    );
  }

  async lese(schluessel: string, maxBytes: number): Promise<LeseErgebnis> {
    pruefeSchluessel(schluessel);
    try {
      const kopf = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: schluessel }));
      if ((kopf.ContentLength ?? Number.POSITIVE_INFINITY) > maxBytes) return { art: "zu_gross" };
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: schluessel }));
      const daten = await r.Body?.transformToByteArray();
      if (!daten) return { art: "fehlt" };
      return daten.length > maxBytes ? { art: "zu_gross" } : { art: "ok", daten };
    } catch (e) {
      if (istNichtGefunden(e)) return { art: "fehlt" };
      throw e;
    }
  }

  async schreibe(schluessel: string, daten: Uint8Array, mimeType: string): Promise<void> {
    pruefeSchluessel(schluessel);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: schluessel, Body: daten, ContentType: mimeType }));
  }

  async loesche(schluessel: string): Promise<void> {
    pruefeSchluessel(schluessel);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: schluessel }));
  }
}
