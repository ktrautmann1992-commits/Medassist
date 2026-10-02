// REQ-006: Laufzeit pro Route explizit; Region fra1 aus vercel.json.
export const maxDuration = 5;
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", hinweis: "Demo – nicht für den klinischen Einsatz" });
}
