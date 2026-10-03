"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { leererFormState, type FormState } from "./state";

/**
 * Wie `useActionState`, aber ohne das automatische Zurücksetzen des Formulars
 * nach der Action. Sonst springen z. B. Radio-Buttons (Rollenwahl) im DOM auf
 * ihren Ausgangswert zurück, während die Oberfläche noch die gewählte Rolle
 * zeigt – und es würde die falsche Rolle abgeschickt (REQ-010).
 */
export function useFormular<S extends object = FormState>(
  action: (vorher: Awaited<S>, formData: FormData) => Promise<S>,
  start: Awaited<S> = leererFormState as Awaited<S>,
) {
  const [state, dispatch, laeuft] = useActionState<S, FormData>(action, start);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Die auslösende Schaltfläche (z. B. „Überspringen“ mit name/value) wird mit übermittelt.
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = submitter ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, laeuft };
}
