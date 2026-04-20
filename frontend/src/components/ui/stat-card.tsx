import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  accent = false
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article className={cn("stat-card", accent && "stat-card--accent")}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
    </article>
  );
}
