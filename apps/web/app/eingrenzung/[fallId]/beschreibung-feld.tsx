"use client";

import { beschreibungsLaenge } from "@medassist/core";
import { CheckboxField, Hinweis, KrisenKontakte, TextareaField } from "@medassist/ui";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * REQ-402, REQ-403, REQ-407: Freitextfeld des Schritts „Beschreibung“ (Weg 1). Der Zustand
 * (Text, Quelle, Sprachauftrag) liegt in einem Kontext, damit die Sprachaufnahme (eigener
 * Bereich außerhalb des Formulars) das Transkript in das Feld übernehmen kann. Das Feld hat
 * bewusst **kein** `maxlength` (Einfügen würde sonst still abgeschnitten, RISK-050).
 */
interface Beschreibung {
  text: string;
  setText: (t: string) => void;
  quelle: "text" | "sprache";
  sprachAuftrag: string | null;
  /** Transkript übernehmen – an leeren Text anhängen bzw. als neuen Absatz. */
  uebernimmTranskript: (text: string, auftragId: string) => void;
  verwirfTranskript: () => void;
}

const Kontext = createContext<Beschreibung | null>(null);

export function BeschreibungProvider({ vorher, children }: { vorher: string; children: ReactNode }) {
  const [text, setText] = useState(vorher);
  const [quelle, setQuelle] = useState<"text" | "sprache">("text");
  const [sprachAuftrag, setSprachAuftrag] = useState<string | null>(null);
  const wert = useMemo<Beschreibung>(
    () => ({
      text,
      setText,
      quelle,
      sprachAuftrag,
      uebernimmTranskript: (t, auftragId) => {
        setText((alt) => (alt.trim() ? `${alt.trimEnd()}\n${t}` : t));
        setQuelle("sprache");
        setSprachAuftrag(auftragId);
      },
      verwirfTranskript: () => {
        setQuelle("text");
        setSprachAuftrag(null);
      },
    }),
    [text, quelle, sprachAuftrag],
  );
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useBeschreibung(): Beschreibung | null {
  return useContext(Kontext);
}

export function BeschreibungFeld({ maxLaenge, fehler }: { maxLaenge: number; fehler: (feld: string) => string | undefined }) {
  const b = useBeschreibung();
  // Ohne Provider (sollte nicht vorkommen): einfaches, unkontrolliertes Feld.
  const [eigenerText, setEigenerText] = useState("");
  const text = b?.text ?? eigenerText;
  const setText = b?.setText ?? setEigenerText;
  const laenge = beschreibungsLaenge(text);
  const zuLang = laenge > maxLaenge;

  return (
    <div className="stack">
      <input type="hidden" name="quelle" value={b?.quelle ?? "text"} />
      {b?.sprachAuftrag && <input type="hidden" name="sprachAuftrag" value={b.sprachAuftrag} />}
      <TextareaField
        id="beschreibung-text"
        name="text"
        label="Beschreiben Sie Ihre Beschwerden in eigenen Worten"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        hinweis={`Was ist los, seit wann, wo genau, was macht es besser oder schlechter? Höchstens ${maxLaenge} Zeichen. Bitte nur Testdaten, keine Namen.`}
        fehler={fehler("text")}
        aria-describedby={["beschreibung-text-hinweis", "beschreibung-zaehler", fehler("text") ? "beschreibung-text-fehler" : null].filter(Boolean).join(" ")}
      />
      <p id="beschreibung-zaehler" className={zuLang ? "error" : "text-soft"} aria-live="polite" data-testid="zeichen-zaehler" style={{ margin: 0 }}>
        {laenge} von {maxLaenge} Zeichen
        {zuLang && ` – ${laenge - maxLaenge} zu viel. Bitte kürzen; es wird nichts automatisch abgeschnitten.`}
      </p>
      {b?.quelle === "sprache" && (
        // REQ-407: Transkript vor dem Absenden prüfen und korrigieren.
        <div className="stack" data-testid="transkript-hinweis">
          <Hinweis titel="Transkript der Sprachaufnahme – bitte prüfen.">
            Die automatische Spracherkennung kann sich irren (z. B. „kein Fieber“ statt „Fieber“). Korrigieren Sie den
            Text im Feld oben, bevor Sie fortfahren.
          </Hinweis>
          <CheckboxField id="transkriptGeprueft" name="transkriptGeprueft" label="Ich habe das Transkript geprüft und bei Bedarf korrigiert." fehler={fehler("transkriptGeprueft")} />
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => b.verwirfTranskript()}>
              Als selbst geschriebenen Text behandeln
            </button>
          </div>
        </div>
      )}
      <Hinweis titel="Automatische Auswertung des Textes folgt (KI, Meilenstein 6).">
        Bis dahin wird Ihr Text unverändert gespeichert und nicht automatisch ausgewertet. Danach geht es mit kurzen Fragen
        weiter.
      </Hinweis>
      {/* REQ-403/RISK-043: Der Text wird nicht auf Krisen ausgewertet – Hilfe daher direkt am Feld. */}
      <KrisenKontakte titel="Wenn Sie an Suizid denken:" id="beschreibung-krise" />
    </div>
  );
}
