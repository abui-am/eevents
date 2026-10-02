import type { ComponentProps } from "react";
import styles from "./ui.module.css";

// shadcn/ui's variant-based Button pattern, with native semantics and plain CSS.
export type ButtonVariant = "primary" | "secondary" | "danger";

export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(" ");
}

export function Button({ variant = "primary", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button data-slot="button" data-variant={variant} className={buttonClassName(variant, className)} type={type} {...props} />;
}
