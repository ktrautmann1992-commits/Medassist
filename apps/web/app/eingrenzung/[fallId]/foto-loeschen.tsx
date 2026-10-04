"use client";

import { useActionState } from "react";
import { loescheFoto, type MedienErgebnis } from "../medien-actions";

/** REQ-410: Foto löschen (Objekt und Datensatz). */
export function FotoLoeschen({ fotoId, beschriftung }: { fotoId: string; beschriftung: string }) {
  const [state, aktion, laeuft] = useActionState<MedienErgebnis, FormData>(loescheFoto, { ok: true });
  return (
    <form action={aktion} className="stack">
      <input type="hidden" name="fotoId" value={fotoId} />
      <button type="submit" className="btn btn-secondary" disabled={laeuft}>
        Foto löschen<span className="visually-hidden">: {beschriftung}</span>
      </button>
      {!state.ok && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {state.fehler}
        </p>
      )}
    </form>
  );
}
