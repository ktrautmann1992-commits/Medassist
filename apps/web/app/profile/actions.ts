"use server";

import { pruefeProfil, type GeprueftesProfil, type ProfilSchemaOptionen } from "@medassist/core";
import { redirect } from "next/navigation";
import { requireBerechtigung, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formDataZuObjekt } from "@/lib/forms/form-objekt";
import { feldFehlerAus, type FormState } from "@/lib/forms/state";
import { aktualisiereProfil, legeProfilAn } from "@/lib/profile/speichern";
import { findeZugaenglichesProfil } from "@/lib/profile/zugriff";

/**
 * Server Actions für Profile. REQ-116: Jede Action prüft selbst Sitzung, Rolle
 * und – bei vorhandenem Profil – den Zugriff (REQ-115). Die Rolle kommt immer
 * aus der Sitzung, nie aus dem Formular.
 */

const PRUEFEN = "Bitte die markierten Felder prüfen.";

function rohdaten(formData: FormData) {
  const roh = formDataZuObjekt(formData, ["profilId", "profilart", "sorgerechtBestaetigt"]);
  // Checkbox: nur „on“ zählt als Bestätigung (REQ-106).
  roh.sorgerechtBestaetigt = formData.get("sorgerechtBestaetigt") === "on";
  return roh;
}

type Pruefung = { ok: false; state: FormState } | { ok: true; daten: GeprueftesProfil };

function pruefe(opt: ProfilSchemaOptionen, formData: FormData): Pruefung {
  const ergebnis = pruefeProfil(opt, rohdaten(formData));
  if (!ergebnis.success) return { ok: false, state: { fehler: PRUEFEN, feldFehler: feldFehlerAus(ergebnis.issues) } };
  return { ok: true, daten: ergebnis.daten };
}

/** REQ-100: eigenes Profil (genau eines). */
export async function legeEigenesProfilAn(_vorher: FormState, formData: FormData): Promise<FormState> {
  const { nutzer } = await requireBerechtigung("profil:eigenes:verwalten");
  const vorhanden = await db().patientenprofil.findUnique({ where: { kontoinhaberId: nutzer.id }, select: { id: true } });
  if (vorhanden) redirect(`/profile/${vorhanden.id}/bearbeiten`);

  const p = pruefe({ rolle: nutzer.rolle, kind: false, neu: true }, formData);
  if (!p.ok) return p.state;
  let id: string;
  try {
    id = await legeProfilAn(nutzer, "EIGEN", p.daten);
  } catch (e) {
    // Gleichzeitiges Anlegen: Unique-Index auf kontoinhaberId greift.
    if ((e as { code?: string }).code === "P2002") return { fehler: "Es besteht bereits ein eigenes Profil." };
    throw e;
  }
  redirect(`/profile/${id}`);
}

/** REQ-106: Kinderprofil mit Sorgerechtsbestätigung. */
export async function legeKinderprofilAn(_vorher: FormState, formData: FormData): Promise<FormState> {
  const { nutzer } = await requireBerechtigung("profil:kinder:verwalten");
  const p = pruefe({ rolle: nutzer.rolle, kind: true, neu: true }, formData);
  if (!p.ok) return p.state;
  if (!p.daten.sorgerechtBestaetigt) return { fehler: PRUEFEN }; // defensiv, Schema verlangt es bereits
  const id = await legeProfilAn(nutzer, "KIND", p.daten);
  redirect(`/profile/${id}`);
}

/** REQ-113: Arzt legt Patientenprofil an (Erwachsene oder Kind). */
export async function legePatientenprofilAn(_vorher: FormState, formData: FormData): Promise<FormState> {
  const { nutzer } = await requireBerechtigung("patienten:verwalten");
  const kind = formData.get("profilart") === "KIND";
  const p = pruefe({ rolle: nutzer.rolle, kind, neu: true }, formData);
  if (!p.ok) return p.state;
  const id = await legeProfilAn(nutzer, "ARZT_PATIENT", p.daten);
  redirect(`/profile/${id}`);
}

/** REQ-100/REQ-113/REQ-116: Profil bearbeiten – Zugriff wird hier erneut geprüft. */
export async function aktualisiereProfilAction(_vorher: FormState, formData: FormData): Promise<FormState> {
  const { nutzer } = await requireUser();
  const profilId = formData.get("profilId");
  const profil = typeof profilId === "string" ? await findeZugaenglichesProfil(nutzer, profilId) : null;
  // Keine Auskunft, ob das Profil existiert (REQ-115).
  if (!profil) return { fehler: "Profil nicht gefunden." };

  const p = pruefe({ rolle: nutzer.rolle, kind: profil.istKinderprofil, neu: false }, formData);
  if (!p.ok) return p.state;
  await aktualisiereProfil(nutzer, profil.id, p.daten);
  redirect(`/profile/${profil.id}`);
}
