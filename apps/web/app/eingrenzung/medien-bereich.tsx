import { standardFragenkataloge } from "@medassist/core";
import { Hinweis, Panel } from "@medassist/ui";
import { aktiveEinwilligung, EINWILLIGUNG } from "@/lib/medien/einwilligung";
import { ladeFotoAnsichten } from "@/lib/medien/fotos";
import { objektSpeicher } from "@/lib/medien/speicher";
import { sttAnbieter } from "@/lib/medien/stt";
import { EinwilligungFormular } from "./[fallId]/einwilligung-formular";
import { FotoHochladen } from "./[fallId]/foto-hochladen";
import { FotoLoeschen } from "./[fallId]/foto-loeschen";
import { SprachAufnahme } from "./[fallId]/sprach-aufnahme";

/**
 * REQ-405 – REQ-410: Sprachaufnahme und Fotos eines Falls von Weg 1. Nur für bereits
 * zugriffsgeprüfte Fälle aufrufen (`ladeFall`). `erlaubt` = Ablauf erlaubt Medien
 * (`medienErlaubt`: nach Schnellcheck/Krisen-Screening, keine Krise). Alle Prüfungen erfolgen
 * zusätzlich serverseitig in den Actions.
 */
const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export async function MedienBereich({ fallId, nutzerId, erlaubt, sprache }: { fallId: string; nutzerId: string; erlaubt: boolean; sprache: boolean }) {
  const speicherAktiv = objektSpeicher() !== null;
  const sttAktiv = speicherAktiv && sttAnbieter() !== null;
  const [fotos, fotoEinwilligung, sprachEinwilligung] = await Promise.all([
    ladeFotoAnsichten(fallId, nutzerId),
    aktiveEinwilligung(nutzerId, "FOTO_VERARBEITUNG"),
    aktiveEinwilligung(nutzerId, "SPRACH_VERARBEITUNG"),
  ]);
  const regionen = standardFragenkataloge().koerperkarte.regionen.map((r) => ({ id: r.id, bezeichnung: r.bezeichnung }));
  const regionName = new Map(regionen.map((r) => [r.id, r.bezeichnung]));

  return (
    <>
      {sprache && (
        <Panel titel="Sprachaufnahme" data-testid="sprach-bereich">
          {!sttAktiv ? (
            <Hinweis titel="Sprachaufnahme in dieser Demo nicht aktiviert.">
              <span data-testid="sprache-aus">Bitte beschreiben Sie Ihre Beschwerden im Textfeld oben.</span>
            </Hinweis>
          ) : !erlaubt ? null : (
            <>
              <p className="text-soft" style={{ margin: 0 }}>
                Sie können Ihre Beschwerden auch sprechen. Der erkannte Text erscheint im Textfeld und kann vor dem Absenden
                korrigiert werden. Die Aufnahme wird danach sofort gelöscht.
              </p>
              <EinwilligungFormular
                zweck="SPRACH_VERARBEITUNG"
                text={EINWILLIGUNG.SPRACH_VERARBEITUNG.text}
                version={sprachEinwilligung?.textVersion ?? EINWILLIGUNG.SPRACH_VERARBEITUNG.version}
                erteiltAm={sprachEinwilligung ? DATUM.format(sprachEinwilligung.erteiltAm) : null}
              />
              {sprachEinwilligung && <SprachAufnahme fallId={fallId} />}
            </>
          )}
        </Panel>
      )}

      <Panel titel="Fotos" data-testid="foto-bereich">
        {!speicherAktiv ? (
          <Hinweis titel="Foto-Upload in dieser Demo nicht aktiviert.">
            <span data-testid="foto-aus">Es kann kein Foto hochgeladen werden. Beschreiben Sie Hautveränderungen bitte im Text.</span>
          </Hinweis>
        ) : erlaubt ? (
          <>
            <p className="text-soft" style={{ margin: 0 }}>
              Ein Foto kann z. B. bei Hautveränderungen helfen. Es wird nicht automatisch ausgewertet (folgt mit Meilenstein 6).
            </p>
            <EinwilligungFormular
              zweck="FOTO_VERARBEITUNG"
              text={EINWILLIGUNG.FOTO_VERARBEITUNG.text}
              version={fotoEinwilligung?.textVersion ?? EINWILLIGUNG.FOTO_VERARBEITUNG.version}
              erteiltAm={fotoEinwilligung ? DATUM.format(fotoEinwilligung.erteiltAm) : null}
            />
            {fotoEinwilligung && (
              <>
                {/* REQ-409: Aufnahmehinweise (CLAUDE.md §5) */}
                <Hinweis titel="So gelingt das Foto:">
                  <ul style={{ margin: 0 }} data-testid="aufnahmehinweise">
                    <li>Tageslicht oder helles Raumlicht, kein Blitz.</li>
                    <li>Abstand etwa 20–30 cm, die Stelle füllt einen Großteil des Bildes.</li>
                    <li>Ein Lineal oder eine Münze daneben legen – so lässt sich die Größe abschätzen.</li>
                    <li>Keine Gesichter, Namen oder Dokumente im Bild. Für den Verlauf: später erneut fotografieren.</li>
                  </ul>
                </Hinweis>
                <FotoHochladen fallId={fallId} regionen={regionen} />
              </>
            )}
          </>
        ) : null}
        {fotos.length > 0 ? (
          <ul className="foto-liste" data-testid="foto-liste">
            {fotos.map((f, i) => {
              const beschriftung = `Foto ${i + 1} vom ${DATUM.format(f.erstelltAm)}${f.koerperregion ? `, ${regionName.get(f.koerperregion) ?? f.koerperregion}` : ""}`;
              return (
                <li key={f.id} className="foto-kachel" data-foto-id={f.id}>
                  {f.url ? (
                    // Signierte, kurzlebige URL (REQ-410) – kein next/image (keine Zwischenspeicherung).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={beschriftung} width={160} height={160} loading="lazy" />
                  ) : (
                    <span className="text-soft">Vorschau nicht verfügbar</span>
                  )}
                  <span className="text-soft">{beschriftung}</span>
                  <FotoLoeschen fotoId={f.id} beschriftung={beschriftung} />
                </li>
              );
            })}
          </ul>
        ) : (
          speicherAktiv && <p className="text-soft" style={{ margin: 0 }}>Noch keine Fotos zu diesem Fall.</p>
        )}
      </Panel>
    </>
  );
}
