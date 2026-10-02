import type { ComponentProps } from "react";
import styles from "./ui.module.css";

// shadcn/ui's owned-source Badge pattern, adapted to the project's CSS tokens.
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span data-slot="badge" data-variant={tone} className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")} {...props} />;
}

export function statusTone(status: string): BadgeTone {
  if (status === "REGISTERED") return "warning";
  if (status === "CONFIRMED") return "info";
  if (status === "ATTENDED" || status === "PUBLISHED") return "success";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

export function StatusBadge({ status, ...props }: ComponentProps<"span"> & { status: string }) {
  return <Badge tone={statusTone(status)} {...props} />;
}
