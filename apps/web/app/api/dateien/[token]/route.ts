import { sitzungMitVollemZugang } from "@/lib/auth/guards";
import { auftragOffen } from "@/lib/medien/auftrag";
import { lokalerSpeicher } from "@/lib/medien/speicher";

/**
 * REQ-408: Signierte Datei-URLs des **lokalen** Speichers (nur Entwicklung/Test, REQ-412).
 * PUT = direkter Upload vom Client (Foto/Audio), GET = Download (Foto). Jede Anfrage prüft
 * Signatur und Ablauf (403), Methode (403) und die Bindung an den angemeldeten Nutzer (404).
 * Ist der lokale Speicher nicht aktiv (`aus`/`s3`), gibt es die Route nicht (404).
 * QA M5: PUT nur, solange der zugehörige Hochladeauftrag offen ist (nicht registriert/transkribiert,
 * nicht abgelaufen) – ein Replay nach der Registrierung legt kein verwaistes Eingangsobjekt an.
 */
export const maxDuration = 10;
export const dynamic = "force-dynamic";

const KOPF = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

function antwort(status: number, text: string): Response {
  return new Response(text, { status, headers: { ...KOPF, "Content-Type": "text/plain; charset=utf-8" } });
}

async function pruefe(token: string, methode: "PUT" | "GET") {
  const speicher = lokalerSpeicher();
  if (!speicher) return { fehler: antwort(404, "Nicht gefunden.") } as const;
  const sitzung = await sitzungMitVollemZugang();
  const z = speicher.pruefeZugriff(token, methode, sitzung?.nutzer.id ?? null);
  if (!z.ok) return { fehler: antwort(z.status, z.status === 404 ? "Nicht gefunden." : z.grund === "abgelaufen" ? "Link abgelaufen." : "Ungültiger Link.") } as const;
  return { speicher, token: z.token } as const;
}

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const p = await pruefe((await params).token, "PUT");
  if ("fehler" in p) return p.fehler;
  if (!(await auftragOffen(p.token.u, p.token.k))) return antwort(409, "Upload abgelehnt.");
  const r = await p.speicher.nimmAn(p.token, request.headers.get("content-type"), request.headers.get("content-length"), request.body);
  if (!r.ok) return antwort(r.status, "Upload abgelehnt.");
  // Wurde der Auftrag während des Uploads beansprucht/geschlossen, das gerade geschriebene Objekt sofort wieder entfernen.
  if (!(await auftragOffen(p.token.u, p.token.k))) {
    await p.speicher.loesche(p.token.k).catch(() => undefined);
    return antwort(409, "Upload abgelehnt.");
  }
  return new Response(null, { status: 204, headers: KOPF });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const p = await pruefe((await params).token, "GET");
  if ("fehler" in p) return p.fehler;
  const r = await p.speicher.liefere(p.token);
  if (!r.ok) return antwort(404, "Nicht gefunden.");
  return new Response(Buffer.from(r.daten), {
    status: 200,
    headers: { ...KOPF, "Content-Type": r.mimeType, "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
