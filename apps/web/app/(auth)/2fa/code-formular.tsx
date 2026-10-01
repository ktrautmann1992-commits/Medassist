"use client";

import { Button, Field } from "@medassist/ui";
import { useFormular } from "@/lib/forms/use-formular";
import { zweitenFaktorPruefen } from "./actions";

export function CodeFormular({ knopf }: { knopf: string }) {
  const { state, onSubmit, laeuft } = useFormular(zweitenFaktorPruefen);
  return (
    <form onSubmit={onSubmit} className="stack">
      <Field
        id="code"
        name="code"
        label="6-stelliger Code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        fehler={state.fehler}
      />
      <div>
        <Button type="submit" disabled={laeuft}>
          {knopf}
        </Button>
      </div>
    </form>
  );
}
