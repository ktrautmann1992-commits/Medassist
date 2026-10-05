"use client";

import { useEffect, useRef, useState } from "react";
import { bereiteAudioVor, transkribiere } from "../medien-actions";
import { useBeschreibung } from "./beschreibung-feld";

/**
 * REQ-407: Sprachaufnahme im Browser per `MediaRecorder` – bewusst **nicht** über die
 * Web-Speech-API (Audio ginge an Dritte, RISK-044). Ablauf: Aufnahme → Upload per signierter URL
 * direkt in den Objektspeicher → serverseitige Transkription (Audio wird danach sofort gelöscht)
 * → Transkript im Textfeld, vor dem Absenden korrigierbar.
 */
export const MAX_AUFNAHME_S = 120;
const TYPEN = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
export const FEHLER_AUFNAHME = "Die Sprachaufnahme hat nicht geklappt – bitte erneut versuchen oder den Text eintippen.";

type Zustand = { art: "bereit" } | { art: "aufnahme"; sekunden: number } | { art: "verarbeitung"; text: string } | { art: "fertig" } | { art: "fehler"; text: string };

export function SprachAufnahme({ fallId }: { fallId: string }) {
  const beschreibung = useBeschreibung();
  const [zustand, setZustand] = useState<Zustand>({ art: "bereit" });
  const recorder = useRef<MediaRecorder | null>(null);
  const teile = useRef<Blob[]>([]);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);
  const [unterstuetzt, setUnterstuetzt] = useState(true);

  useEffect(() => {
    // Nach dem Mount prüfen (kein Hydrationsunterschied zwischen Server und Browser).
    const ok = typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);
    if (!ok) queueMicrotask(() => setUnterstuetzt(false));
    return () => {
      if (uhr.current) clearInterval(uhr.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function verarbeite(blob: Blob, mimeType: string) {
    try {
      setZustand({ art: "verarbeitung", text: "Aufnahme wird hochgeladen …" });
      const v = await bereiteAudioVor({ fallId, groesseBytes: blob.size, mimeType });
      if (!v.ok) return setZustand({ art: "fehler", text: v.fehler });
      const antwort = await fetch(v.upload.url, { method: v.upload.methode, headers: v.upload.header, body: blob }).catch(() => null);
      if (!antwort?.ok) return setZustand({ art: "fehler", text: "Das Hochladen der Aufnahme ist fehlgeschlagen – bitte erneut versuchen oder den Text eintippen." });
      setZustand({ art: "verarbeitung", text: "Aufnahme wird in Text umgewandelt …" });
      const t = await transkribiere({ fallId, auftragId: v.auftragId });
      if (!t.ok) return setZustand({ art: "fehler", text: t.fehler });
      beschreibung?.uebernimmTranskript(t.text, t.auftragId);
      setZustand({ art: "fertig" });
      document.getElementById("beschreibung-text")?.focus();
    } catch {
      // QA M5: Netzwerk-/Serverfehler einer Server Action ⇒ Meldung statt hängender Oberfläche.
      setZustand({ art: "fehler", text: FEHLER_AUFNAHME });
    }
  }

  async function starte() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setZustand({ art: "fehler", text: "Kein Zugriff auf das Mikrofon. Bitte erlauben Sie den Zugriff oder nutzen Sie das Textfeld." });
    }
    let mimeType = "";
    let r: MediaRecorder;
    try {
      mimeType = TYPEN.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      r = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return setZustand({ art: "fehler", text: FEHLER_AUFNAHME });
    }
    teile.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size > 0) teile.current.push(e.data);
    };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (uhr.current) clearInterval(uhr.current);
      const typ = (r.mimeType || mimeType || "audio/webm").split(";")[0]!;
      void verarbeite(new Blob(teile.current, { type: typ }), typ);
    };
    try {
      r.start(250);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return setZustand({ art: "fehler", text: FEHLER_AUFNAHME });
    }
    recorder.current = r;
    setZustand({ art: "aufnahme", sekunden: 0 });
    const start = Date.now();
    uhr.current = setInterval(() => {
      const sekunden = Math.floor((Date.now() - start) / 1000);
      if (sekunden >= MAX_AUFNAHME_S) stoppe();
      else setZustand({ art: "aufnahme", sekunden });
    }, 500);
  }

  function stoppe() {
    if (uhr.current) clearInterval(uhr.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  if (!unterstuetzt) {
    return <p className="text-soft">Ihr Browser unterstützt keine Sprachaufnahme – bitte nutzen Sie das Textfeld.</p>;
  }

  const laeuft = zustand.art === "aufnahme";
  return (
    <div className="stack" data-testid="sprach-aufnahme">
      <div className="actions">
        {laeuft ? (
          <button type="button" className="btn btn-primary" onClick={stoppe}>
            Aufnahme beenden
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => void starte()} disabled={zustand.art === "verarbeitung"}>
            Aufnahme starten
          </button>
        )}
      </div>
      <p aria-live="polite" className="text-soft" style={{ margin: 0 }} data-testid="sprach-status">
        {zustand.art === "aufnahme" && `Aufnahme läuft: ${zustand.sekunden} s (höchstens ${MAX_AUFNAHME_S} s).`}
        {zustand.art === "verarbeitung" && zustand.text}
        {zustand.art === "fertig" && "Transkript eingefügt – bitte im Textfeld prüfen und bei Bedarf korrigieren. Die Aufnahme wurde gelöscht."}
      </p>
      {zustand.art === "fehler" && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {zustand.text}
        </p>
      )}
    </div>
  );
}
