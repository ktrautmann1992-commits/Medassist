import type { ButtonHTMLAttributes } from "react";

export type ButtonVariante = "primary" | "secondary" | "emergency";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariante;
}

export function Button({ variante = "primary", className, type = "button", ...rest }: ButtonProps) {
  const klassen = ["btn", `btn-${variante}`, className].filter(Boolean).join(" ");
  return <button type={type} className={klassen} {...rest} />;
}
