import type { AudioTyp } from "@medassist/core";

/**
 * REQ-406: Anbieterneutrale Speech-to-Text-Schnittstelle. Bewusst **ohne** Browser-Web-Speech-API
 * (Audio ginge an Dritte). Ein produktiver Anbieter (on-device in der Mobil-App oder EU-gehostet
 * mit AVV, ohne Trainingsnutzung, mit Löschfristen) ist eine offene Entscheidung des Product Owners.
 */
export interface SttAnbieter {
  readonly art: "test";
  transkribiere(audio: Uint8Array, mimeType: AudioTyp): Promise<{ text: string }>;
}

/** Fester Text des Test-Adapters (nur Entwicklung/E2E, REQ-412). */
export const TEST_TRANSKRIPT = "Seit drei Tagen Halsschmerzen und Schluckbeschwerden, abends leichtes Fieber. (Test-Transkript)";

export class TestStt implements SttAnbieter {
  readonly art = "test" as const;
  async transkribiere(audio: Uint8Array): Promise<{ text: string }> {
    if (audio.length === 0) throw new Error("Leere Aufnahme.");
    return { text: TEST_TRANSKRIPT };
  }
}

export type SttKonfiguration = "aus" | "test";

/** `aus` ⇒ `null` (Sprachaufnahme deaktiviert). */
export function erzeugeStt(art: SttKonfiguration): SttAnbieter | null {
  return art === "test" ? new TestStt() : null;
}
