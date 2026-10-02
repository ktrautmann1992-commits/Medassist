"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { leererFormState, type FormState } from "./state";

/**
 * Wie `useActionState`, aber ohne das automatische Zurücksetzen des Formulars
 * nach der Action. Sonst springen z. B. Radio-Buttons (Rollenwahl) im DOM auf
 * ihren Ausgangswert zurück, während die Oberfläche noch die gewählte Rolle
 * zeigt – und es würde die falsche Rolle abgeschickt (REQ-010).
 */
export function useFormular(action: (vorher: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, laeuft] = useActionState(action, leererFormState);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, laeuft };
}
