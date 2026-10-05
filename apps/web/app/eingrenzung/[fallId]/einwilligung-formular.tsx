import { aendereEinwilligung } from "../medien-actions";

/**
 * REQ-405: Einwilligung erteilen bzw. widerrufen (eigenes Formular, Server Action). Erteilt wird
 * nur mit ausdrücklich angekreuzter Bestätigung – der Server prüft das erneut.
 */
export function EinwilligungFormular({
  zweck,
  text,
  version,
  erteiltAm,
}: {
  zweck: "FOTO_VERARBEITUNG" | "SPRACH_VERARBEITUNG";
  text: string;
  version: string;
  erteiltAm: string | null;
}) {
  const id = `einwilligung-${zweck.toLowerCase()}`;
  if (erteiltAm) {
    return (
      <form action={aendereEinwilligung} className="actions" data-testid={`${id}-erteilt`}>
        <input type="hidden" name="zweck" value={zweck} />
        <span className="text-soft">
          Einwilligung erteilt am {erteiltAm} (Version {version}).
        </span>
        <button type="submit" className="btn btn-secondary" name="aktion" value="widerrufen">
          Einwilligung widerrufen
        </button>
      </form>
    );
  }
  return (
    <form action={aendereEinwilligung} className="stack" data-testid={id}>
      <input type="hidden" name="zweck" value={zweck} />
      <label className="check-row" htmlFor={id} style={{ alignItems: "flex-start" }}>
        <input type="checkbox" id={id} name="bestaetigt" required style={{ marginTop: 4 }} />
        <span>
          {text} <span className="text-soft">(Version {version})</span>
        </span>
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-secondary" name="aktion" value="erteilen">
          Einwilligen
        </button>
      </div>
    </form>
  );
}
