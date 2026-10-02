import {
  AKTIVITAET_BEZEICHNUNG,
  ALKOHOL_BEZEICHNUNG,
  ALLERGIE_TYP_BEZEICHNUNG,
  EINRICHTUNG_BEZEICHNUNG,
  GESCHLECHT_BEZEICHNUNG,
  ORGAN_FUNKTION_BEZEICHNUNG,
  RAUCH_BEZEICHNUNG,
  SCHWANGERSCHAFT_BEZEICHNUNG,
  SPRACHSITUATION_BEZEICHNUNG,
  VORSORGE_BEZEICHNUNG,
  VORSORGE_ERGEBNIS_BEZEICHNUNG,
  sichererBmi,
} from "@medassist/core";
import { Hinweis, Panel } from "@medassist/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/guards";
import { datumDe, zahlDe } from "@/lib/profile/format";
import { ladeProfil } from "@/lib/profile/zugriff";
import { ProfilKopf } from "../profil-kopf";

export const dynamic = "force-dynamic";

const term = (text: string) => <span className="term">{text}</span>;

function Liste<T>({ eintraege, leer, children }: { eintraege: readonly T[]; leer: string; children: (e: T) => ReactNode }) {
  if (eintraege.length === 0) return <p className="text-soft">{leer}</p>;
  return (
    <ul>
      {eintraege.map((e, i) => (
        <li key={i}>{children(e)}</li>
      ))}
    </ul>
  );
}

/** REQ-105/REQ-108/REQ-109/REQ-110/REQ-114: Profilansicht. REQ-115: fremde IDs → 404. */
export default async function ProfilAnsichtSeite({ params }: { params: Promise<{ id: string }> }) {
  const { nutzer } = await requireUser();
  const { id } = await params;
  const p = await ladeProfil(nutzer, id);
  const groesse = p.groesseCm != null ? Number(p.groesseCm) : null;
  const gewicht = p.gewichtKg != null ? Number(p.gewichtKg) : null;
  const bmi = sichererBmi(groesse, gewicht);
  const k = p.kind;
  const zurueck = nutzer.rolle === "ARZT" ? { href: "/arzt/patienten", text: "Zur Patientenliste" } : { href: "/profile", text: "Zu meinen Profilen" };

  return (
    <section className="stack">
      <ProfilKopf {...p} sswWochen={k?.sswWochen} sswTage={k?.sswTage} />
      <div className="actions">
        <Link className="btn btn-primary" href={`/profile/${p.id}/bearbeiten`}>
          Profil bearbeiten
        </Link>
        <Link className="btn btn-secondary" href={zurueck.href}>
          {zurueck.text}
        </Link>
      </div>

      <Panel titel="Stammdaten">
        <dl className="facts">
          <dt>Geschlecht</dt>
          <dd>{GESCHLECHT_BEZEICHNUNG[p.geschlecht]}</dd>
          <dt>Größe</dt>
          <dd className="num">{p.groesseCm != null ? `${zahlDe(p.groesseCm)} cm` : "–"}</dd>
          <dt>Gewicht</dt>
          <dd className="num">{p.gewichtKg != null ? `${zahlDe(p.gewichtKg)} kg` : "–"}</dd>
          <dt>
            Body-Mass-Index ({term("BMI")})
          </dt>
          <dd>
            <span className="num" data-testid="bmi">
              {bmi != null ? `${zahlDe(bmi)} kg/m²` : "–"}
            </span>
            {bmi != null && <span className="text-soft"> · berechnet aus Größe und Gewicht</span>}
            {bmi != null && p.istKinderprofil && (
              <div className="text-soft">Bei Kindern nur zusammen mit Perzentilen aussagekräftig.</div>
            )}
          </dd>
          {/* REQ-104: nicht bei „männlich“ und nicht bei Kinderprofilen */}
          {p.geschlecht !== "MAENNLICH" && !p.istKinderprofil && (
            <>
              <dt>Schwangerschaft / Stillzeit</dt>
              <dd>{SCHWANGERSCHAFT_BEZEICHNUNG[p.schwangerschaft]}</dd>
            </>
          )}
        </dl>
      </Panel>

      {k && (
        <Panel titel="Geburt, Betreuung und Sprache">
          <dl className="facts">
            <dt>
              Schwangerschaftswoche bei Geburt ({term("SSW")})
            </dt>
            <dd className="num">{k.sswWochen != null ? `${k.sswWochen}+${k.sswTage ?? 0}` : "–"}</dd>
            <dt>Geburtsgewicht</dt>
            <dd className="num">{k.geburtsgewichtG != null ? `${k.geburtsgewichtG} g` : "–"}</dd>
            <dt>Betreuung / Schule</dt>
            <dd>
              {k.einrichtung ? EINRICHTUNG_BEZEICHNUNG[k.einrichtung] : "–"}
              {k.einrichtungName ? ` (${k.einrichtungName})` : ""}
              {k.klassenstufe != null ? `, Klasse ${k.klassenstufe}` : ""}
            </dd>
            <dt>Sprache</dt>
            <dd>
              {k.sprachsituation ? SPRACHSITUATION_BEZEICHNUNG[k.sprachsituation] : "–"}
              {k.sprachen.length > 0 ? `: ${k.sprachen.join(", ")}` : ""}
            </dd>
            <dt>Sorgerecht bestätigt</dt>
            <dd>{k.sorgerechtBestaetigtAm ? `am ${datumDe(k.sorgerechtBestaetigtAm)}` : "–"}</dd>
          </dl>
        </Panel>
      )}

      <Panel titel={<>Vorerkrankungen ({term("Anamnese")})</>}>
        <Liste eintraege={p.vorerkrankungen} leer="Keine Vorerkrankungen erfasst.">
          {(v) => (
            <>
              {v.bezeichnung}
              {v.icd10Code && (
                <>
                  {" "}
                  <span className="num text-soft">{v.icd10Code}</span>
                </>
              )}
            </>
          )}
        </Liste>
        {p.vorerkrankungen.some((v) => v.icd10Code) && (
          <p className="text-soft">ICD-10-GM-Codes sind nur auf ihr Format geprüft (kein Katalogabgleich im Prototyp).</p>
        )}
      </Panel>

      <Panel titel="Operationen">
        <Liste eintraege={p.operationen} leer="Keine Operationen erfasst.">
          {(o) => (
            <>
              {o.bezeichnung}
              {o.datum && <span className="text-soft"> · {datumDe(o.datum)}</span>}
            </>
          )}
        </Liste>
      </Panel>

      <Panel titel="Allergien und Unverträglichkeiten">
        <Liste eintraege={p.allergien} leer="Keine Allergien oder Unverträglichkeiten erfasst.">
          {(a) => (
            <>
              <strong>{a.ausloeser}</strong> ({ALLERGIE_TYP_BEZEICHNUNG[a.typ]})
              {a.reaktion && <span className="text-soft"> · {a.reaktion}</span>}
            </>
          )}
        </Liste>
      </Panel>

      <Panel titel="Dauermedikation">
        <Liste eintraege={p.dauermedikation} leer="Keine Dauermedikation erfasst.">
          {(m) => (
            <>
              <strong>{m.wirkstoff}</strong>
              {m.staerke && <> {m.staerke}</>}
              {m.dosierung && <span className="num text-soft"> · {m.dosierung}</span>}
            </>
          )}
        </Liste>
      </Panel>

      <Panel titel="Familie und Lebensstil">
        <dl className="facts">
          <dt>Familienanamnese</dt>
          <dd style={{ whiteSpace: "pre-line" }}>{p.familienanamnese ?? "–"}</dd>
          <dt>Rauchen</dt>
          <dd>
            {RAUCH_BEZEICHNUNG[p.rauchen]}
            {p.packungsjahre != null && <span className="num"> · {zahlDe(p.packungsjahre)} Packungsjahre</span>}
          </dd>
          <dt>Alkohol</dt>
          <dd>{ALKOHOL_BEZEICHNUNG[p.alkohol]}</dd>
          <dt>Sport</dt>
          <dd>{AKTIVITAET_BEZEICHNUNG[p.sport]}</dd>
        </dl>
      </Panel>

      <Panel titel="Impfungen">
        {p.impfstatusNotiz && <p style={{ whiteSpace: "pre-line" }}>{p.impfstatusNotiz}</p>}
        <Liste eintraege={p.impfungen} leer="Keine Impfungen erfasst.">
          {(i) => (
            <>
              {i.gegen}
              {i.impfstoff && <> ({i.impfstoff})</>}
              {i.dosisNr != null && <span className="text-soft"> · Dosis {i.dosisNr}</span>}
              {i.datum && <span className="text-soft"> · {datumDe(i.datum)}</span>}
            </>
          )}
        </Liste>
      </Panel>

      {k && (
        <Panel titel="Vorsorgeuntersuchungen">
          <Liste eintraege={k.vorsorge} leer="Keine Vorsorgeuntersuchungen erfasst.">
            {(v) => (
              <>
                <strong>{VORSORGE_BEZEICHNUNG[v.typ]}</strong>: {VORSORGE_ERGEBNIS_BEZEICHNUNG[v.ergebnis]}
                {v.datum && <span className="text-soft"> · {datumDe(v.datum)}</span>}
              </>
            )}
          </Liste>
        </Panel>
      )}

      {k && (
        <Panel variante="data" titel="Größe und Gewicht im Verlauf">
          {k.wachstum.length === 0 ? (
            <p className="text-soft">Noch keine Messungen erfasst.</p>
          ) : (
            <div className="table-scroll">
              <table className="table num">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Größe (cm)</th>
                    <th scope="col">Gewicht (kg)</th>
                    <th scope="col">Kopfumfang (cm)</th>
                  </tr>
                </thead>
                <tbody>
                  {k.wachstum.map((w, i) => (
                    <tr key={i}>
                      <td>{datumDe(w.gemessenAm)}</td>
                      <td>{zahlDe(w.groesseCm)}</td>
                      <td>{zahlDe(w.gewichtKg)}</td>
                      <td>{zahlDe(w.kopfumfangCm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* REQ-110: keine Perzentilen ohne geprüfte Referenzquelle. */}
          <Hinweis titel="Perzentilen:">
            Perzentilen folgen, sobald eine geprüfte Referenzquelle eingebunden ist.
          </Hinweis>
        </Panel>
      )}

      {/* REQ-114: `arzt` ist für Patienten serverseitig null. */}
      {p.arzt && (
        <Panel variante="data" titel="Organfunktion und Laborwerte (nur ärztlich)">
          <dl className="facts">
            <dt>Nierenfunktion</dt>
            <dd data-testid="nierenfunktion">{ORGAN_FUNKTION_BEZEICHNUNG[p.arzt.nierenfunktion]}</dd>
            <dt>Leberfunktion</dt>
            <dd>{ORGAN_FUNKTION_BEZEICHNUNG[p.arzt.leberfunktion]}</dd>
          </dl>
          {p.arzt.laborwerte.length === 0 ? (
            <p className="text-soft">Keine Laborwerte erfasst.</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Parameter</th>
                    <th scope="col">Wert</th>
                    <th scope="col">Einheit</th>
                    <th scope="col">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {p.arzt.laborwerte.map((l, i) => (
                    <tr key={i}>
                      <td>{l.parameter}</td>
                      <td className="num">{zahlDe(l.wert)}</td>
                      <td>{l.einheit}</td>
                      <td className="num">{datumDe(l.gemessenAm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-soft">Referenzbereiche folgen mit geprüften Quellen (ohne Bewertung im Prototyp).</p>
        </Panel>
      )}
    </section>
  );
}
