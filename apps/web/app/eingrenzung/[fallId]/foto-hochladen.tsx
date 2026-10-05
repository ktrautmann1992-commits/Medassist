"use client";

import { useRef, useState } from "react";
import { bereiteFotoVor, registriereFoto } from "../medien-actions";

/**
 * REQ-409: Foto im Browser bereinigen und hochladen. Die Neu-Kodierung über Canvas zu JPEG
 * (längste Kante ≤ 2048 px) entfernt EXIF/GPS und andere Metadaten **vor** dem Upload; der
 * Server schreibt das JPEG danach selbst neu (`bereinigeJpeg`: nur Bilddaten, alle Metadaten-
 * Segmente verworfen) und registriert erst dann.
 */
export const MAX_KANTE = 2048;
export const JPEG_QUALITAET = 0.85;
const FEHLER_HOCHLADEN = "Das Hochladen ist fehlgeschlagen – bitte erneut versuchen.";

export async function bereinigeFoto(datei: Blob): Promise<Blob> {
  const bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
  const breite = Math.max(1, Math.round(bild.width * faktor));
  const hoehe = Math.max(1, Math.round(bild.height * faktor));
  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  // Transparente Bereiche (PNG) weiß statt schwarz.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, breite, hoehe);
  ctx.drawImage(bild, 0, 0, breite, hoehe);
  bild.close();
  return new Promise((ok, fehler) => canvas.toBlob((b) => (b ? ok(b) : fehler(new Error("Kodierung fehlgeschlagen"))), "image/jpeg", JPEG_QUALITAET));
}

export function FotoHochladen({ fallId, regionen }: { fallId: string; regionen: { id: string; bezeichnung: string }[] }) {
  const [status, setStatus] = useState<{ art: "ok" | "fehler" | "laeuft"; text: string } | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  const region = useRef<HTMLSelectElement>(null);

  async function hochladen() {
    const f = datei.current?.files?.[0];
    if (!f) return setStatus({ art: "fehler", text: "Bitte zuerst ein Foto auswählen." });
    setStatus({ art: "laeuft", text: "Foto wird bereinigt (Metadaten werden entfernt) …" });
    let blob: Blob;
    try {
      blob = await bereinigeFoto(f);
    } catch {
      return setStatus({ art: "fehler", text: "Das Bild konnte nicht gelesen werden. Bitte ein JPEG- oder PNG-Foto wählen." });
    }
    try {
      setStatus({ art: "laeuft", text: "Foto wird hochgeladen …" });
      const v = await bereiteFotoVor({ fallId, groesseBytes: blob.size });
      if (!v.ok) return setStatus({ art: "fehler", text: v.fehler });
      const antwort = await fetch(v.upload.url, { method: v.upload.methode, headers: v.upload.header, body: blob }).catch(() => null);
      if (!antwort?.ok) return setStatus({ art: "fehler", text: FEHLER_HOCHLADEN });
      setStatus({ art: "laeuft", text: "Foto wird geprüft …" });
      const r = await registriereFoto({ fallId, auftragId: v.auftragId, koerperregion: region.current?.value || null });
      if (!r.ok) return setStatus({ art: "fehler", text: r.fehler });
      if (datei.current) datei.current.value = "";
      setStatus({ art: "ok", text: "Foto gespeichert (ohne Metadaten)." });
    } catch {
      // QA M5: Netzwerk-/Serverfehler einer Server Action ⇒ verständliche Meldung, Schaltfläche wieder frei.
      setStatus({ art: "fehler", text: FEHLER_HOCHLADEN });
    }
  }

  return (
    <div className="stack" data-testid="foto-hochladen">
      <div className="field">
        <label htmlFor="foto-datei">Foto auswählen oder aufnehmen</label>
        <input id="foto-datei" type="file" accept="image/jpeg,image/png,image/webp" ref={datei} aria-describedby="foto-datei-hinweis" />
        <span className="hint" id="foto-datei-hinweis">
          JPEG, PNG oder WebP. Das Foto wird vor dem Hochladen verkleinert (höchstens {MAX_KANTE} px) und von Metadaten wie dem
          Aufnahmeort befreit.
        </span>
      </div>
      <div className="field">
        <label htmlFor="foto-region">Körperstelle (optional)</label>
        <select id="foto-region" ref={region} defaultValue="">
          <option value="">Keine Angabe</option>
          {regionen.map((r) => (
            <option key={r.id} value={r.id}>
              {r.bezeichnung}
            </option>
          ))}
        </select>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => void hochladen()} disabled={status?.art === "laeuft"}>
          {status?.art === "laeuft" ? "Bitte warten …" : "Foto hochladen"}
        </button>
      </div>
      <p aria-live="polite" className={status?.art === "fehler" ? "form-error" : "text-soft"} role={status?.art === "fehler" ? "alert" : undefined} style={{ margin: 0 }} data-testid="foto-status">
        {status?.text}
      </p>
    </div>
  );
}
